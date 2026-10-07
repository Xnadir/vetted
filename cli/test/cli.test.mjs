import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { sandbox, GOOD_DESC } from "./helpers.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "vet.mjs");
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });

const box = sandbox();
box.skill("clean/ok-skill", `name: ok-skill\ndescription: ${GOOD_DESC}`);
box.skill("warny/warn-skill", "name: warn-skill\ndescription: Helps with PDFs.");
box.skill("broken/bad-skill", "name: wrong-name\ndescription: " + GOOD_DESC);
const p = (d) => join(box.root, d);

test("docs/rules.md lists every rule with its severity", () => {
  const doc = readFileSync(join(dirname(CLI), "..", "docs", "rules.md"), "utf8").split("\n");
  for (const rule of JSON.parse(run("rules", "--format", "json").stdout)) {
    const row = doc.find((line) => line.startsWith(`| \`${rule.id}\` |`));
    assert.ok(row, `docs/rules.md has no row for ${rule.id}`);
    assert.ok(row.split("|")[2].includes(rule.severity), `docs/rules.md severity for ${rule.id} should include ${rule.severity}`);
  }
});

test("exit 0 on a clean skill, with a text summary", () => {
  const r = run("vet", p("clean"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ok-skill/);
  assert.match(r.stdout, /0 errors/);
});

test("missing license is visible in JSON and verbose output but does not fail strict", () => {
  const r = run("vet", p("clean"), "--strict", "--format", "json");
  assert.equal(r.status, 0, r.stderr);
  const finding = JSON.parse(r.stdout).skills[0].findings.find((f) => f.rule === "spec/license-missing");
  assert.ok(finding);
  assert.equal(finding.severity, "info");
  assert.match(run("vet", p("clean"), "--verbose").stdout, /spec\/license-missing/);
  assert.doesNotMatch(run("vet", p("clean")).stdout, /spec\/license-missing/);
});

test("exit 1 on errors; warnings fail only with --strict", () => {
  assert.equal(run("vet", p("broken")).status, 1);
  assert.equal(run("vet", p("warny")).status, 0);
  assert.equal(run("vet", p("warny"), "--strict").status, 1);
});

test("chmod 777 is a JSON warning and fails only in strict mode", () => {
  const file = sandbox().skill("chmod-cli", `name: chmod-cli\ndescription: ${GOOD_DESC}`, "\nRun `chmod -R 777 cache`.\n");
  const r = run("vet", file, "--format", "json");
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  const f = report.skills[0].findings.find((x) => x.rule === "sec/chmod-777");
  assert.ok(f);
  assert.equal(f.severity, "warn");
  assert.equal(run("vet", file, "--strict").status, 1);
});

test("rules lists the chmod 777 warning", () => {
  const r = run("rules", "--format", "json");
  assert.equal(r.status, 0, r.stderr);
  const rule = JSON.parse(r.stdout).find((x) => x.id === "sec/chmod-777");
  assert.ok(rule);
  assert.equal(rule.severity, "warn");
});

test("--ignore skips rules, including prefixes", () => {
  assert.equal(run("vet", p("broken"), "--ignore", "spec/name-dir-mismatch").status, 0);
  assert.equal(run("vet", p("warny"), "--strict", "--ignore=trigger/*").status, 0);
});

test("json output has a stable shape", () => {
  const r = run("vet", box.root, "--format", "json");
  const j = JSON.parse(r.stdout);
  assert.equal(j.schemaVersion, 1);
  assert.equal(j.summary.skills, 3);
  assert.ok(j.skills.every((s) => Array.isArray(s.findings) && typeof s.cost.descriptionTokens === "number"));
});

test("sarif reports rules, severity, and source locations without changing exit codes", () => {
  const sarifBox = sandbox();
  sarifBox.skill("bad-skill", `name: wrong-name\ndescription: ${GOOD_DESC}`, "\n# Title\n", {
    "scripts/check #%.sh": "# helper\nchmod 777 cache\n",
  });
  const r = spawnSync(process.execPath, [CLI, "vet", ".", "--format", "sarif"], {
    cwd: sarifBox.root, encoding: "utf8",
  });
  assert.equal(r.status, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.version, "2.1.0");
  assert.match(report.$schema, /sarif-schema-2\.1\.0\.json$/);
  assert.equal(report.runs.length, 1);
  const scan = report.runs[0];
  assert.equal(scan.tool.driver.name, "skill-vet");
  const ids = scan.tool.driver.rules.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(scan.results.every((finding) => ids.includes(finding.ruleId) && finding.message.text));
  const error = scan.results.find((finding) => finding.ruleId === "spec/name-dir-mismatch");
  assert.equal(error.level, "error");
  assert.equal(error.locations[0].physicalLocation.artifactLocation.uri, "bad-skill/SKILL.md");
  const warning = scan.results.find((finding) => finding.ruleId === "sec/chmod-777");
  assert.equal(warning.level, "warning");
  assert.deepEqual(warning.locations[0].physicalLocation, {
    artifactLocation: { uri: "bad-skill/scripts/check%20%23%25.sh" }, region: { startLine: 2 },
  });
  assert.equal(scan.results.find((finding) => finding.ruleId === "spec/license-missing").level, "note");
  assert.equal(run("vet", p("warny"), "--format=sarif").status, 0);
  assert.equal(run("vet", p("warny"), "--format=sarif", "--strict").status, 1);
  assert.equal(run("vet", p("broken"), "--format=sarif", "--ignore", "spec/name-dir-mismatch").status, 0);
});

test("sarif emits a valid empty run when no skills are found", () => {
  const r = run("vet", p("clean/ok-skill/nothing-here"), "--format", "sarif", "--quiet");
  assert.equal(r.status, 0, r.stderr);
  const scan = JSON.parse(r.stdout).runs[0];
  assert.deepEqual(scan.tool.driver.rules, []);
  assert.deepEqual(scan.results, []);
});

test("github format emits workflow annotations", () => {
  const r = run("vet", p("broken"), "--format", "github");
  assert.match(r.stdout, /^::error file=.*SKILL\.md,title=spec\/name-dir-mismatch::/m);
});

test("markdown format renders a table", () => {
  const r = run("vet", p("clean"), "--format", "markdown");
  assert.match(r.stdout, /\| Skill \| Status \|/);
});

test("usage errors exit 2", () => {
  assert.equal(run("vet", "--format", "xml").status, 2);
  assert.equal(run("vet", "--nope").status, 2);
  assert.equal(run("frobnicate").status, 2);
});

test("rules and version commands", () => {
  assert.match(run("rules").stdout, /sec\/remote-exec/);
  assert.match(run("--version").stdout, /^\d+\.\d+\.\d+/);
});

test("rules shows id, severity and description, as a table or as json", () => {
  const table = run("rules");
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /^RULE\s+SEVERITY\s+DESCRIPTION/);
  assert.match(table.stdout, /^sec\/remote-exec\s+error\s+Downloads code/m);

  const r = run("rules", "--format", "json");
  assert.equal(r.status, 0, r.stderr);
  const list = JSON.parse(r.stdout);
  assert.ok(list.length > 0);
  assert.ok(list.every((x) => x.id && ["error", "warn", "info"].includes(x.severity) && x.description));
  assert.deepEqual(list.find((x) => x.id === "sec/remote-exec").severity, "error");
  assert.equal(list.find((x) => x.id === "spec/license-missing").severity, "info");
});

test("an empty directory is not an error", () => {
  const r = run("vet", p("clean/ok-skill/nothing-here"));
  assert.equal(r.status, 0);
});

test("--quiet prints only findings with no summary or cost table", () => {
  const clean = run("vet", p("clean"), "--quiet");
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout, "");

  const empty = run("vet", p("clean/ok-skill/nothing-here"), "--quiet");
  assert.equal(empty.status, 0);
  assert.equal(empty.stdout, "");

  const broken = run("vet", p("broken"), "--quiet");
  assert.equal(broken.status, 1);
  assert.match(broken.stdout, /error\s+spec\/name-dir-mismatch/);
  assert.match(broken.stdout, /bad-skill\/SKILL\.md/);
  assert.doesNotMatch(broken.stdout, /vetted ·/);
  assert.doesNotMatch(broken.stdout, /skills ·/);
  assert.doesNotMatch(broken.stdout, /context:/);
  assert.doesNotMatch(broken.stdout, /desc ≈/);

  const warny = run("vet", p("warny"), "--quiet");
  assert.equal(warny.status, 0);
  assert.match(warny.stdout, /warn\s+trigger\/too-vague/);
  assert.doesNotMatch(warny.stdout, /skills ·/);

  const warnyStrict = run("vet", p("warny"), "--quiet", "--strict");
  assert.equal(warnyStrict.status, 1);
  assert.match(warnyStrict.stdout, /warn\s+trigger\/too-vague/);
});
