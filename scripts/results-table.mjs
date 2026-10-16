#!/usr/bin/env node
// Turns `claude plugin eval --json` output into the README results table.
//
//   node scripts/results-table.mjs a.json b.json                  # print markdown
//   node scripts/results-table.mjs a.json b.json --update-readme  # rewrite README section
//   node scripts/results-table.mjs a.json --save evals/published  # write compact evidence
//
// Files are grouped by the model under test. When two files for the same model
// contain the same case, the later file wins (use this for a corrected re-run).
// Cases are grouped by the skill directory they live in under evals/.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hasErroredRun, summarizeCase, pct, signed, shortModel as short, skillStats, verdict } from "./lib/eval-summary.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
};
const updateReadme = argv.includes("--update-readme");
const saveDir = flag("--save");
const files = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--save");
if (!files.length) {
  console.error("usage: results-table.mjs <result.json>... [--update-readme] [--save <dir>]");
  process.exit(2);
}

function caseToSkill() {
  const map = new Map();
  for (const evalsDir of [join(ROOT, "evals"), join(ROOT, "retired", "evals")]) {
  if (!existsSync(evalsDir)) continue;
  for (const skill of readdirSync(evalsDir)) {
    const sd = join(evalsDir, skill);
    if (["results", "mocks", "published"].includes(skill) || !statSync(sd).isDirectory()) continue;
    for (const c of readdirSync(sd)) if (statSync(join(sd, c)).isDirectory()) map.set(c, skill);
  }
  }
  return map;
}
const skillOf = caseToSkill();

// ---- load and merge
const byModel = new Map();
for (const file of files) {
  const r = JSON.parse(readFileSync(file, "utf8"));
  const model = r.suite?.modelOverride ?? "default model";
  if (!byModel.has(model)) byModel.set(model, { model, judge: r.suite?.judgeModel, costUsd: 0, claudeVersion: r.claudeVersion, date: (r.startedAt ?? "").slice(0, 10), partial: false, cases: new Map(), skipped: new Set() });
  const m = byModel.get(model);
  m.costUsd += r.costUsd ?? 0;
  m.partial ||= !!r.partial;
  for (const c of r.cases ?? []) {
    // A run that errored (usage limit, timeout) is graded on whatever it
    // produced, which would publish a fake score. Leave the case out.
    if (hasErroredRun(c)) {
      if (!m.cases.has(c.name)) m.skipped.add(c.name);
      continue;
    }
    m.skipped.delete(c.name);
    m.cases.set(c.name, { name: c.name, skill: skillOf.get(c.name) ?? "other", ...summarizeCase(c) });
  }
}
const models = [...byModel.values()];

// ---- helpers
const skillStatsFor = (m, skill) => skillStats([...m.cases.values()].filter((c) => c.skill === skill));

// ---- render
const skills = [...new Set(models.flatMap((m) => [...m.cases.values()].map((c) => c.skill)))].sort((a, b) => (a.startsWith("_") ? 1 : b.startsWith("_") ? -1 : a.localeCompare(b)));
const lines = [];
lines.push(
  `| Skill | ${models.map((m) => `${short(m.model)}<br/>with → without (Δ)`).join(" | ")} | Skill loaded | Verdict |`,
  `| --- | ${models.map(() => "---:").join(" | ")} | ---: | --- |`,
);
for (const skill of skills) {
  const stats = models.map((m) => [m.model, skillStatsFor(m, skill)]);
  const cells = stats.map(([, s]) => (s ? `${pct(s.with)} → ${pct(s.without)} (**${signed(s.delta)}**)` : "–"));
  const loaded = stats.map(([, s]) => (s ? s.loaded : "–")).join(" · ");
  const retired = existsSync(join(ROOT, "retired", "skills", skill));
  const name = skill.startsWith("_")
    ? "_no skill should fire_"
    : retired
      ? `[\`${skill}\`](retired/skills/${skill}/SKILL.md) _(retired)_`
      : `[\`${skill}\`](skills/${skill}/SKILL.md)`;
  lines.push(`| ${name} | ${cells.join(" | ")} | ${skill.startsWith("_") ? "–" : loaded} | ${skill.startsWith("_") ? (stats.every(([, s]) => !s || s.with === 1) ? "✅ nothing fired" : "⚠️ something fired") : verdict(stats)} |`);
}
const meta = models
  .map((m) => `**${short(m.model)}**: ${m.cases.size} cases × ${[...m.cases.values()][0]?.runs ?? 3} runs per arm, judge \`${m.judge}\`, Claude Code ${m.claudeVersion}, ${m.date}, ≈$${m.costUsd.toFixed(2)} at list price${m.partial ? ", ⚠️ partial" : ""}${m.skipped.size ? `. **${m.skipped.size} cases not yet run** (runs errored, e.g. usage limit): ${[...m.skipped].map((n) => "`" + n + "`").join(", ")}` : ""}`)
  .join("<br/>\n");
const detailRows = [];
for (const m of models)
  for (const c of [...m.cases.values()].sort((a, b) => a.skill.localeCompare(b.skill) || a.name.localeCompare(b.name)))
    detailRows.push(`| ${short(m.model)} | ${c.skill} | \`${c.name}\` | ${pct(c.with)} | ${pct(c.without)} | ${signed(c.delta)} | ${c.loaded ?? "–"} |`);
const out = [
  lines.join("\n"),
  "",
  meta,
  "",
  "<details><summary>Per-case scores</summary>",
  "",
  "| Model | Skill | Case | With | Without | Δ | Loaded |",
  "| --- | --- | --- | ---: | ---: | ---: | ---: |",
  ...detailRows,
  "",
  "</details>",
].join("\n");

if (saveDir) {
  mkdirSync(saveDir, { recursive: true });
  for (const m of models) {
    const p = join(saveDir, `${m.date}-${m.model}.json`);
    writeFileSync(p, JSON.stringify({ model: m.model, judge: m.judge, claudeVersion: m.claudeVersion, date: m.date, costUsd: +m.costUsd.toFixed(2), cases: [...m.cases.values()] }, null, 2) + "\n");
    console.error(`saved ${p}`);
  }
}

if (updateReadme) {
  const readme = join(ROOT, "README.md");
  const text = readFileSync(readme, "utf8");
  const start = "<!-- results:start -->";
  const end = "<!-- results:end -->";
  if (!text.includes(start) || !text.includes(end)) {
    console.error("README.md has no results markers");
    process.exit(1);
  }
  writeFileSync(readme, text.slice(0, text.indexOf(start) + start.length) + "\n" + out + "\n" + text.slice(text.indexOf(end)));
  console.error("README.md updated");
} else {
  console.log(out);
}
