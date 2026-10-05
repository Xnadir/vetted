#!/usr/bin/env node
// vetted: checks agent skills (SKILL.md) for spec problems, weak triggers,
// context cost, outdated prompting style, and security red flags.

import { readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vetSkill, crossSkillFindings } from "./lib/rules.mjs";
import { findSkillFiles, installedLocations, parseRemote, fetchRemote } from "./lib/discover.mjs";
import { formatText, formatJson, formatMarkdown, formatGithub, summarize } from "./lib/report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8")).version;

const HELP = `skill-vet ${VERSION}: check agent skills before you trust them

Usage
  skill-vet vet [paths or owner/repo ...]   Check skills (default: current directory)
  skill-vet vet --installed                 Check every skill your agents have installed
  skill-vet rules                           List all rules
  skill-vet rules --format json             List all rules in JSON

Examples
  npx @menadirali/skill-vet vet ./skills
  npx @menadirali/skill-vet vet anthropics/skills        # vet a repo before installing it
  npx @menadirali/skill-vet vet --installed              # what are my skills costing me?

Options
  --format <text|json|markdown|github>  Output format (default: text)
  --strict                  Exit 1 on warnings as well as errors
  --ignore <rule,...>       Skip rules (prefix match with /*, e.g. style/*)
  --verbose                 Show info-level findings
  -q, --quiet               Print only findings, no summary line or cost table
  --summary-file <path>     Also append a markdown report (e.g. $GITHUB_STEP_SUMMARY)
  -h, --help                Show help
  -v, --version             Show version

Exit codes: 0 clean, 1 findings at the failing level, 2 usage error.`;

const RULES = [
  ["spec/frontmatter-missing", "error", "SKILL.md must start with YAML frontmatter"],
  ["spec/frontmatter-parse", "warn", "Frontmatter could not be fully parsed"],
  ["spec/name-missing", "error", "`name` is required"],
  ["spec/name-format", "error", "`name`: 1-64 chars, lowercase letters, digits, single hyphens"],
  ["spec/name-dir-mismatch", "error", "`name` must match the skill's directory"],
  ["spec/description-missing", "error", "`description` is required"],
  ["spec/description-length", "error", "`description` must be at most 1024 characters"],
  ["spec/license-missing", "info", "Frontmatter has no license declaration"],
  ["spec/compatibility-length", "error", "`compatibility` must be 1-500 characters"],
  ["spec/metadata-shape", "warn", "`metadata` must map strings to strings"],
  ["spec/allowed-tools-shape", "warn", "`allowed-tools` should be a space-separated string"],
  ["spec/unknown-field", "warn", "Frontmatter field no agent recognizes (likely a typo)"],
  ["spec/extension-field", "info", "Claude Code-only field; ignored by other agents"],
  ["spec/body-too-long", "warn", "Body over 500 lines or ~5000 tokens"],
  ["spec/broken-reference", "error", "Linked file inside the skill doesn't exist"],
  ["trigger/too-vague", "warn", "Description too short to match requests against"],
  ["trigger/no-when", "warn", "Description doesn't say when to use the skill"],
  ["trigger/first-person", "info", "Description written in the first person"],
  ["trigger/listing-truncated", "warn", "Longer than Claude Code's 1536-character listing cap"],
  ["trigger/duplicate-name", "warn", "Two different skills share a name"],
  ["trigger/overlap", "warn", "Two descriptions overlap enough to confuse skill selection"],
  ["style/emphasis-overload", "warn", "Many all-caps directives (MUST/NEVER/CRITICAL)"],
  ["style/shouting", "warn", "Many words in all caps"],
  ["style/persona-boilerplate", "info", '"You are an expert..." style persona lines'],
  ["sec/remote-exec", "error", "Downloads code and pipes it into a shell or interpreter"],
  ["sec/obfuscated-exec", "error", "Decodes hidden content and executes it"],
  ["sec/prompt-injection", "error", "Tries to override instructions or hide actions from the user"],
  ["sec/permission-bypass", "error", "Turns off permission prompts or the sandbox"],
  ["sec/hidden-unicode", "error", "Invisible or bidirectional-override characters"],
  ["sec/secret-access", "warn", "References credential or key files"],
  ["sec/exfil-endpoint", "warn", "Talks to raw IPs or data-collection services"],
  ["sec/metadata-endpoint", "warn", "Reaches the cloud instance-metadata service"],
  ["sec/env-dump", "warn", "Dumps all environment variables"],
  ["sec/destructive", "warn", "Can wipe a home directory or disk"],
  ["sec/persistence", "warn", "Installs shell-profile, cron, launch-agent, or hook persistence"],
  ["sec/sudo", "warn", "Uses sudo to escalate privileges"],
  ["sec/chmod-777", "warn", "Makes files world-writable with chmod 777"],
  ["sec/hidden-instructions", "warn", "Instructions inside HTML comments"],
  ["sec/broad-allowed-tools", "warn", "Pre-approves an unrestricted shell"],
  ["sec/binary", "warn", "Ships compiled executables"],
  ["sec/suspicious-install", "warn", "Install command names a package within 1-2 edits of a popular one"],
];

function parseArgs(argv) {
  const opts = { format: "text", strict: false, ignore: [], verbose: false, quiet: false, installed: false, paths: [], summaryFile: null };
  const rest = [...argv];
  const cmd = rest[0] && !rest[0].startsWith("-") ? rest.shift() : "vet";
  while (rest.length) {
    const a = rest.shift();
    const val = () => {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : rest.shift();
      if (v === undefined) throw usage(`${a} needs a value`);
      return v;
    };
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "-v" || a === "--version") opts.version = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "-q" || a === "--quiet") opts.quiet = true;
    else if (a === "--installed") opts.installed = true;
    else if (a === "--json") opts.format = "json";
    else if (a.startsWith("--format")) opts.format = val();
    else if (a.startsWith("--ignore")) opts.ignore.push(...val().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith("--summary-file")) opts.summaryFile = val();
    else if (a.startsWith("-")) throw usage(`unknown option ${a}`);
    else opts.paths.push(a);
  }
  if (!["text", "json", "markdown", "github"].includes(opts.format)) throw usage(`unknown format ${opts.format}`);
  return { cmd, opts };
}

function usage(msg) {
  const e = new Error(msg);
  e.usage = true;
  return e;
}

const ignored = (rule, list) => list.some((p) => (p.endsWith("/*") ? rule.startsWith(p.slice(0, -1)) : rule === p));

function main(argv) {
  const { cmd, opts } = parseArgs(argv);
  if (opts.version) return console.log(VERSION), 0;
  if (opts.help || cmd === "help") return console.log(HELP), 0;
  if (cmd === "rules") {
    if (opts.format === "json") {
      const list = RULES.map(([id, sev, desc]) => ({ id, severity: sev, description: desc }));
      console.log(JSON.stringify(list, null, 2));
      return 0;
    }
    console.log(`${"RULE".padEnd(28)} ${"SEVERITY".padEnd(10)} DESCRIPTION`);
    for (const [id, sev, desc] of RULES) console.log(`${id.padEnd(28)} ${sev.padEnd(10)} ${desc}`);
    return 0;
  }
  if (cmd !== "vet") throw usage(`unknown command ${cmd}`);

  const cleanups = [];
  const targets = [];
  let heading;
  try {
    if (opts.installed) {
      const locs = installedLocations();
      heading = locs.length
        ? `installed skills in ${locs.length} location${locs.length === 1 ? "" : "s"}: ${locs.map((l) => `${l.agent} (${l.scope})`).join(", ")}`
        : "no installed skills found";
      targets.push(...locs.map((l) => l.path));
    }
    const paths = opts.paths.length || opts.installed ? opts.paths : ["."];
    for (const p of paths) {
      const remote = parseRemote(p);
      if (remote) {
        process.stderr.write(`fetching ${remote.owner}/${remote.repo}${remote.ref ? "@" + remote.ref : ""}...\n`);
        const { dir, cleanup } = fetchRemote(remote);
        cleanups.push(cleanup);
        targets.push(dir);
        heading ??= `${remote.owner}/${remote.repo}`;
      } else targets.push(p);
    }

    const files = [...new Set(targets.flatMap((t) => findSkillFiles(t)))];
    let results = files.map((f) => vetSkill(f));
    for (const { skill, finding } of crossSkillFindings(results)) skill.findings.push(finding);
    results = results
      .map((r) => ({ ...r, findings: r.findings.filter((f) => !ignored(f.rule, opts.ignore)) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const base = targets.length === 1 && cleanups.length === 1 ? targets[0] : process.cwd();
    if (!results.length && opts.format === "text") {
      if (!opts.quiet) {
        console.log(opts.installed ? "skill-vet · no installed skills found" : "skill-vet · no SKILL.md files found");
      }
      return 0;
    }
    const render = { text: formatText, json: formatJson, markdown: formatMarkdown, github: formatGithub }[opts.format];
    const out = render(results, { base, verbose: opts.verbose, heading, quiet: opts.quiet });
    if (out) console.log(out);
    if (opts.summaryFile) appendFileSync(opts.summaryFile, formatMarkdown(results, { base }) + "\n");

    const s = summarize(results);
    return s.errors || (opts.strict && s.warnings) ? 1 : 0;
  } finally {
    for (const c of cleanups) c();
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`skill-vet: ${err.message}`);
  if (err.usage) console.error("Run `skill-vet --help` for usage.");
  process.exitCode = 2;
}
