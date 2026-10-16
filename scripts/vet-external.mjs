#!/usr/bin/env node
// Tests a third-party skill from the registry: runs the entry's eval cases with
// and without the skill, and saves the compact result next to them.
//
//   node scripts/vet-external.mjs registry/<owner>/<repo>/<skill> --by <your-github-username>
//
// Options:
//   --model <id>         model under test (default claude-sonnet-5-5)
//   --judge <id>         LLM-grader model (default claude-sonnet-5-5, as in the main results)
//   --runs <n>           runs per case and arm (default 3)
//   --concurrency <n>    agent runs at once (default 2)
//   --max-cost-usd <n>   stop when this much has been spent
//   --allow-bash         grant Bash to cases that list it (needs WSL2 on Windows)
//   --keep-temp          keep the temporary checkout and plugin
//
// The skill is fetched at the commit pinned in source.json, scanned with
// skill-vet (any security error stops the run before anything executes), and
// wrapped alone in a temporary plugin, so no hooks, MCP servers, or other
// skills from its source repository load.

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync, mkdtempSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { vetSkill } from "../cli/lib/rules.mjs";
import { parseFrontmatter } from "../cli/lib/frontmatter.mjs";
import { hasErroredRun, summarizeCase, skillStats, pct, signed } from "./lib/eval-summary.mjs";
import { REGISTRY, updateReadme } from "./registry-table.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i < 0 ? fallback : argv[i + 1];
};
const fail = (msg) => {
  console.error(`vet-external: ${msg}`);
  process.exit(1);
};

const VALUE_FLAGS = new Set(["--by", "--model", "--judge", "--runs", "--concurrency", "--max-cost-usd"]);
const entryArg = argv.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]));
const by = opt("--by");
if (!entryArg || !by) fail("usage: node scripts/vet-external.mjs registry/<owner>/<repo>/<skill> --by <your-github-username>");
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(by)) fail(`--by must be a GitHub username, got "${by}"`);
const model = opt("--model", "claude-sonnet-5-5");
const judge = opt("--judge", "claude-sonnet-5-5");
const runs = opt("--runs", "3");
const concurrency = opt("--concurrency", "2");
const maxCost = opt("--max-cost-usd");

const entry = resolve(entryArg);
if (relative(REGISTRY, entry).startsWith("..")) fail(`${entryArg} is not inside registry/`);
const sourceFile = join(entry, "source.json");
if (!existsSync(sourceFile)) fail(`${entryArg} has no source.json`);
const source = JSON.parse(readFileSync(sourceFile, "utf8"));
if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(source.repo ?? "")) fail("source.json: repo must be https://github.com/<owner>/<repo>");
if (!/^[0-9a-f]{40}$/.test(source.ref ?? "")) fail("source.json: ref must be a full 40-character commit SHA");
if (!source.path || source.path.split(/[\\/]/).includes("..")) fail("source.json: path must point at the skill folder inside the repo");
if (!existsSync(join(entry, "evals"))) fail(`${entryArg} has no evals/ folder`);

// ---- fetch the skill at the pinned commit
const tmp = mkdtempSync(join(tmpdir(), "vetted-registry-"));
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0 && !opts.allowFailure) fail(`${cmd} ${args.join(" ")} failed:\n${r.stderr ?? ""}`);
  return r;
};
const src = join(tmp, "src");
console.error(`fetching ${source.repo} at ${source.ref.slice(0, 12)}…`);
run("git", ["init", "-q", src]);
run("git", ["-C", src, "fetch", "-q", "--depth", "1", source.repo, source.ref]);
run("git", ["-C", src, "checkout", "-q", "FETCH_HEAD"]);
const skillDir = join(src, source.path);
if (!existsSync(join(skillDir, "SKILL.md"))) fail(`no SKILL.md at ${source.path} in ${source.repo}@${source.ref}`);

// ---- scan before anything runs
const scan = vetSkill(join(skillDir, "SKILL.md"));
const blocking = scan.findings.filter((f) => f.severity === "error" && f.rule.startsWith("sec/"));
if (blocking.length) {
  for (const f of blocking) console.error(`  error ${f.rule} ${f.file}:${f.line ?? ""} ${f.message}`);
  fail("skill-vet found security errors in this skill; not running it");
}
const warnings = scan.findings.filter((f) => f.severity === "warn").length;
console.error(`skill-vet: no security errors${warnings ? `, ${warnings} warning(s)` : ""}`);

// ---- wrap the skill alone in a temporary plugin, with this entry's cases
const plugin = join(tmp, "plugin");
mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
writeFileSync(join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({
  name: "vetted-registry",
  version: "0.0.0",
  description: `Temporary wrapper for ${scan.name} from ${source.repo} at ${source.ref}`,
}, null, 2));
cpSync(skillDir, join(plugin, "skills", scan.name), { recursive: true });
cpSync(join(entry, "evals"), join(plugin, "evals"), { recursive: true });

const caseDirs = readdirSync(join(plugin, "evals"), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "results").map((d) => join(plugin, "evals", d.name));
const tools = new Set();
let scaffold = false;
for (const dir of caseDirs) {
  const { data } = parseFrontmatter(readFileSync(join(dir, "prompt.md"), "utf8"));
  for (const t of data?.allowed_tools ?? []) tools.add(t);
  if (existsSync(join(dir, "case.yaml")) && /scaffold_script/.test(readFileSync(join(dir, "case.yaml"), "utf8"))) scaffold = true;
}
if (tools.has("Bash") && !argv.includes("--allow-bash")) fail("a case needs Bash; rerun with --allow-bash (on Windows, run from WSL2)");
const gated = ["Write", "Edit", "WebFetch", "Bash"].filter((t) => tools.has(t));

// ---- run the evals
const out = join(tmp, "result.json");
const args = ["plugin", "eval", plugin, "--trust-plugin", "--no-publish", "--threshold", "0",
  "--json", out, "--model", model, "--judge-model", judge, "--runs", runs, "-j", concurrency,
  ...(gated.length ? ["--allow-tools", ...gated] : []), ...(scaffold ? ["--scaffold"] : []),
  ...(maxCost ? ["--max-cost-usd", maxCost] : [])];
console.error(`running ${caseDirs.length} case(s) × ${runs} runs × 2 arms on ${model}…`);
const ran = spawnSync("claude", args, { stdio: "inherit" });
if (ran.error) fail(`could not start claude: ${ran.error.message}`);
if (!existsSync(out)) fail("claude plugin eval produced no result file");

// ---- save the compact result
const r = JSON.parse(readFileSync(out, "utf8"));
if (r.partialReason === "auth_failed") fail("Claude Code isn't logged in, or the login expired. Run `claude`, type /login, then run this again.");
const cases = (r.cases ?? []).filter((c) => !hasErroredRun(c)).map((c) => ({ name: c.name, ...summarizeCase(c) }));
const skipped = (r.cases ?? []).filter(hasErroredRun).map((c) => c.name);
if (!cases.length) fail(`every case errored (usage limit or timeout?): ${skipped.join(", ")}`);
const date = (r.startedAt ?? new Date().toISOString()).slice(0, 10);
const resultsDir = join(entry, "results");
mkdirSync(resultsDir, { recursive: true });
const file = join(resultsDir, `${date}-${model}-${by}.json`);
writeFileSync(file, JSON.stringify({
  skill: scan.name, repo: source.repo, ref: source.ref, ranBy: by,
  model: r.suite?.modelOverride ?? model, judge: r.suite?.judgeModel ?? judge,
  claudeVersion: r.claudeVersion, date, costUsd: +(r.costUsd ?? 0).toFixed(2), partial: !!r.partial,
  cases, skipped,
}, null, 2) + "\n");
updateReadme();

const s = skillStats(cases);
console.log(`\n${scan.name} on ${model}: ${pct(s.with)} with → ${pct(s.without)} without (Δ ${signed(s.delta)}), skill loaded ${s.loaded}`);
if (skipped.length) console.log(`not counted (a run errored): ${skipped.join(", ")}`);
if (r.partial) console.log(`⚠️ partial run (${r.partialReason ?? "stopped early"}); the result file is marked partial`);
console.log(`saved ${relative(process.cwd(), file)} and updated registry/README.md`);
if (argv.includes("--keep-temp")) console.log(`temp files kept in ${tmp}`);
else rmSync(tmp, { recursive: true, force: true });
