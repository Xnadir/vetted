import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeCase, hasErroredRun, verdict, skillStats } from "../lib/eval-summary.mjs";
import { renderTable, updateReadme } from "../registry-table.mjs";

const run = (passed, { error, fired } = {}) => ({
  ...(error ? { error } : {}),
  graders: [
    { name: "honest-status", passed },
    ...(fired === undefined ? [] : [{ name: "skill-fired", passed: fired }]),
  ],
});
const evalCase = {
  name: "claims-fix",
  runsPerCase: 2,
  aggregates: { score: 1, scoreWithout: 0.5, delta: 0.5 },
  arms: { with: [run(true, { fired: true }), run(true, { fired: false })], without: [run(true), run(false)] },
};

test("summarizeCase tallies graders per arm and counts skill loads separately", () => {
  assert.deepEqual(summarizeCase(evalCase), {
    runs: 2, with: 1, without: 0.5, delta: 0.5, loaded: "1/2", errors: 0,
    graders: { "honest-status": { with: "2/2", without: "1/2" } },
  });
  assert.equal(hasErroredRun(evalCase), false);
  assert.equal(hasErroredRun({ arms: { with: [run(false, { error: "exit 1" })], without: [] } }), true);
});

test("verdict needs +10 points to help and -5 points, with no help elsewhere, to hurt", () => {
  const s = (delta) => skillStats([{ with: 0.5 + delta, without: 0.5, delta, loaded: "3/3" }]);
  assert.equal(verdict([["claude-sonnet-5-5", s(0.1)]]), "✅ helps");
  assert.equal(verdict([["claude-sonnet-5-5", s(0.09)]]), "✂️ no measurable effect");
  assert.equal(verdict([["claude-sonnet-5-5", s(0)], ["claude-haiku-4-5", s(0.2)]]), "✅ helps on Haiku 4.5");
  assert.equal(verdict([["claude-sonnet-5-5", s(-0.05)]]), "❌ hurts on Sonnet 5.5");
});

test("the registry table shows the newest result per model and who ran it", () => {
  const entry = (results) => ({
    owner: "acme", repo: "skills", skill: "careful",
    source: { repo: "https://github.com/acme/skills", ref: "a".repeat(40), path: "skills/careful" },
    results,
  });
  const result = (model, delta, ranBy) => ({ model, ranBy, cases: [{ with: 0.5 + delta, without: 0.5, delta, loaded: "2/3" }] });
  const table = renderTable([
    entry([result("claude-sonnet-5-5", 0, "old-runner"), result("claude-sonnet-5-5", 0.25, "new-runner")]),
    { ...entry([]), skill: "pending" },
  ]);
  const [header, , careful, pending] = table.split("\n");
  assert.match(header, /Sonnet 5\.5<br\/>with → without/);
  assert.match(careful, /\(\*\*\+25\*\*\)/);
  assert.match(careful, /✅ helps/);
  assert.match(careful, /\[@old-runner\]\(https:\/\/github\.com\/old-runner\), \[@new-runner\]/);
  assert.match(careful, /tree\/a{40}\/skills\/careful/);
  assert.match(pending, /⏳ not run yet/);
});

test("registry/README.md is up to date with the registry entries", () => {
  assert.ok(updateReadme({ check: true }), "run: node scripts/registry-table.mjs");
});
