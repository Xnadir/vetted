import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import * as report from "../lib/report.mjs";

test("sarif keeps file locations but omits unknown or invalid line regions", () => {
  assert.equal(typeof report.formatSarif, "function");
  const base = join(tmpdir(), "sarif-base");
  const findings = [undefined, null, 0, -1, 1.5, "2", 2].map((line) => ({
    rule: "spec/example", severity: "warn", message: "An example finding", file: "SKILL #?%.md", line,
  }));
  const scan = JSON.parse(report.formatSarif([{ dir: join(base, "skill"), findings }], { base })).runs[0];
  assert.deepEqual(scan.tool.driver.rules, [{ id: "spec/example" }]);
  for (const finding of scan.results.slice(0, -1)) {
    assert.deepEqual(finding.locations[0].physicalLocation, { artifactLocation: { uri: "skill/SKILL%20%23%3F%25.md" } });
  }
  assert.deepEqual(scan.results.at(-1).locations[0].physicalLocation.region, { startLine: 2 });
});

test("sarif uses escaped file URIs for findings outside the report base", () => {
  assert.equal(typeof report.formatSarif, "function");
  const base = join(tmpdir(), "sarif-base");
  const dir = join(tmpdir(), "outside #?%");
  const scan = JSON.parse(report.formatSarif([{
    dir, findings: [{ rule: "spec/example", severity: "info", message: "Example", file: "SKILL.md" }],
  }], { base })).runs[0];
  assert.equal(scan.results[0].locations[0].physicalLocation.artifactLocation.uri, pathToFileURL(join(dir, "SKILL.md")).href);
});
