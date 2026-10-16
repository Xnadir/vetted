#!/usr/bin/env node
// Rebuilds the results table in registry/README.md from the entries under
// registry/<owner>/<repo>/<skill>/ (source.json plus results/*.json).
//
//   node scripts/registry-table.mjs          # rewrite the table in registry/README.md
//   node scripts/registry-table.mjs --check  # exit 1 if the table is out of date

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pct, signed, shortModel, skillStats, verdict } from "./lib/eval-summary.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REGISTRY = join(ROOT, "registry");
const README = join(REGISTRY, "README.md");
const START = "<!-- registry:start -->";
const END = "<!-- registry:end -->";

const subdirs = (p) => (existsSync(p) ? readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory()).sort() : []);

/** Every registry entry with its source pointer and result files (oldest first; names start with the date). */
export function loadEntries() {
  const entries = [];
  for (const owner of subdirs(REGISTRY))
    for (const repo of subdirs(join(REGISTRY, owner)))
      for (const skill of subdirs(join(REGISTRY, owner, repo))) {
        const dir = join(REGISTRY, owner, repo, skill);
        if (!existsSync(join(dir, "source.json"))) continue;
        const resultsDir = join(dir, "results");
        const results = existsSync(resultsDir)
          ? readdirSync(resultsDir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(resultsDir, f), "utf8")))
          : [];
        entries.push({ owner, repo, skill, source: JSON.parse(readFileSync(join(dir, "source.json"), "utf8")), results });
      }
  return entries;
}

export function renderTable(entries) {
  const models = [...new Set(entries.flatMap((e) => e.results.map((r) => r.model)))].sort((a, b) => b.localeCompare(a));
  const heads = models.length ? models.map((m) => `${shortModel(m)}<br/>with → without (Δ)`) : ["with → without (Δ)"];
  const lines = [
    `| Skill | ${heads.join(" | ")} | Skill loaded | Verdict | Vetted by |`,
    `| --- | ${heads.map(() => "---:").join(" | ")} | ---: | --- | --- |`,
  ];
  for (const e of entries) {
    // The newest result per model counts; a later run replaces an earlier one.
    const latest = new Map(e.results.map((r) => [r.model, r]));
    const stats = models.map((m) => [m, latest.has(m) ? skillStats(latest.get(m).cases) : null]);
    const ran = stats.filter(([, s]) => s);
    const cells = stats.map(([, s]) => (s ? `${pct(s.with)} → ${pct(s.without)} (**${signed(s.delta)}**)` : "–"));
    const loaded = stats.map(([, s]) => (s ? s.loaded : "–")).join(" · ");
    const by = [...new Set(e.results.map((r) => r.ranBy))].map((u) => `[@${u}](https://github.com/${u})`).join(", ");
    const name = `[\`${e.skill}\`](${e.source.repo}/tree/${e.source.ref}/${e.source.path}) · ${e.owner}/${e.repo}`;
    lines.push(`| ${name} | ${(cells.length ? cells : ["–"]).join(" | ")} | ${ran.length ? loaded : "–"} | ${ran.length ? verdict(ran) : "⏳ not run yet"} | ${by || "–"} |`);
  }
  if (!entries.length) lines.push(`| _no entries yet_ |${heads.map(() => " |").join("")} | | |`);
  return lines.join("\n");
}

export function updateReadme({ check = false } = {}) {
  const text = readFileSync(README, "utf8");
  if (!text.includes(START) || !text.includes(END)) throw new Error("registry/README.md has no registry markers");
  const next = text.slice(0, text.indexOf(START) + START.length) + "\n" + renderTable(loadEntries()) + "\n" + text.slice(text.indexOf(END));
  if (check) return next === text;
  writeFileSync(README, next);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes("--check");
  const ok = updateReadme({ check });
  if (check && !ok) {
    console.error("registry/README.md is out of date: run node scripts/registry-table.mjs");
    process.exit(1);
  }
  if (!check) console.error("registry/README.md updated");
}
