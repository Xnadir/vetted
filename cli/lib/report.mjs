// Output formats for `skill-vet vet`: text (terminal), json, markdown, github, sarif.

import { relative, sep, join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";
const paint = (code) => (s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const red = paint(31);
const yellow = paint(33);
const green = paint(32);
const dim = paint(2);
const bold = paint(1);
const cyan = paint(36);

const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const rel = (p, base) => {
  const r = relative(base, p);
  if (!r.startsWith("..")) return r.split(sep).join("/") || ".";
  const home = relative(homedir(), p);
  return home.startsWith("..") ? p.split(sep).join("/") : "~/" + home.split(sep).join("/");
};

export function summarize(results) {
  const count = (sev) => results.reduce((n, r) => n + r.findings.filter((f) => f.severity === sev).length, 0);
  return {
    skills: results.length,
    errors: count("error"),
    warnings: count("warn"),
    infos: count("info"),
    alwaysLoadedTokens: results.reduce((n, r) => n + r.cost.descriptionTokens, 0),
    onActivationTokens: results.reduce((n, r) => n + r.cost.bodyTokens, 0),
  };
}

export function formatText(results, { base = process.cwd(), verbose = false, heading, quiet = false } = {}) {
  const out = [];
  const s = summarize(results);

  if (quiet) {
    for (const r of results) {
      const shown = r.findings.filter((f) => verbose || f.severity !== "info");
      for (const f of shown) {
        const sev = f.severity === "error" ? red("error") : f.severity === "warn" ? yellow("warn ") : dim("info ");
        const file = rel(join(r.dir, f.file), base);
        const where = dim(`${file}${f.line ? ":" + f.line : ""}`);
        out.push(`${sev} ${cyan(f.rule)}  ${where}`);
        out.push(`      ${f.message}`);
      }
    }
    return out.join("\n");
  }

  out.push(bold("vetted") + dim(` · ${heading ?? `scanned ${s.skills} skill${s.skills === 1 ? "" : "s"}`}`));
  out.push("");
  const width = Math.min(28, Math.max(8, ...results.map((r) => r.name.length)));
  for (const r of results) {
    const shown = r.findings.filter((f) => verbose || f.severity !== "info");
    const hasErr = r.findings.some((f) => f.severity === "error");
    const hasWarn = r.findings.some((f) => f.severity === "warn");
    const icon = hasErr ? red("✖") : hasWarn ? yellow("▲") : green("✔");
    const cost = dim(`desc ≈${fmtTokens(r.cost.descriptionTokens)} tok · body ≈${fmtTokens(r.cost.bodyTokens)} tok`);
    out.push(`${icon} ${r.name.padEnd(width)}  ${cost}  ${dim(rel(r.dir, base))}`);
    for (const f of shown) {
      const sev = f.severity === "error" ? red("error") : f.severity === "warn" ? yellow("warn ") : dim("info ");
      const where = dim(`${f.file}${f.line ? ":" + f.line : ""}`);
      out.push(`    ${sev} ${cyan(f.rule)}  ${where}`);
      out.push(`          ${f.message}`);
    }
  }
  out.push("");
  const hidden = s.infos && !verbose ? dim(` (${s.infos} info hidden, use --verbose)`) : "";
  out.push(
    `${s.skills} skills · ${s.errors ? red(s.errors + " errors") : "0 errors"} · ${s.warnings ? yellow(s.warnings + " warnings") : "0 warnings"}${hidden}`,
  );
  out.push(
    dim(`context: ≈${fmtTokens(s.alwaysLoadedTokens)} tokens always loaded (names + descriptions) · ≈${fmtTokens(s.onActivationTokens)} tokens if every skill activates`),
  );
  return out.join("\n");
}

export function formatJson(results, { base = process.cwd() } = {}) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      summary: summarize(results),
      skills: results.map((r) => ({
        name: r.name,
        path: rel(r.path, base),
        description: r.description,
        cost: r.cost,
        findings: r.findings,
      })),
    },
    null,
    2,
  );
}

export function formatSarif(results, { base = process.cwd() } = {}) {
  const rules = new Map();
  const findings = results.flatMap((r) => r.findings.map((f) => {
    rules.set(f.rule, { id: f.rule });
    const file = join(r.dir, f.file);
    const path = relative(base, file);
    const uri = isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)
      ? pathToFileURL(file).href
      : path.split(sep).map(encodeURIComponent).join("/");
    const physicalLocation = { artifactLocation: { uri } };
    if (Number.isInteger(f.line) && f.line > 0) physicalLocation.region = { startLine: f.line };
    return {
      ruleId: f.rule,
      level: { error: "error", warn: "warning", info: "note" }[f.severity],
      message: { text: f.message },
      locations: [{ physicalLocation }],
    };
  }));
  return JSON.stringify({
    $schema: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "skill-vet", rules: [...rules.values()] } }, results: findings }],
  }, null, 2);
}

export function formatMarkdown(results, { base = process.cwd() } = {}) {
  const s = summarize(results);
  const status = s.errors ? "❌" : s.warnings ? "⚠️" : "✅";
  const lines = [
    `## ${status} vetted: ${s.skills} skills, ${s.errors} errors, ${s.warnings} warnings`,
    "",
    `Context cost: ≈${fmtTokens(s.alwaysLoadedTokens)} tokens always loaded, ≈${fmtTokens(s.onActivationTokens)} tokens if every skill activates.`,
    "",
    "| Skill | Status | Description tokens | Body tokens | Findings |",
    "| --- | --- | ---: | ---: | --- |",
  ];
  for (const r of results) {
    const e = r.findings.filter((f) => f.severity === "error").length;
    const w = r.findings.filter((f) => f.severity === "warn").length;
    const st = e ? "❌" : w ? "⚠️" : "✅";
    const top = r.findings
      .filter((f) => f.severity !== "info")
      .slice(0, 3)
      .map((f) => `\`${f.rule}\``)
      .join(", ");
    lines.push(`| \`${r.name}\` | ${st} | ${r.cost.descriptionTokens} | ${r.cost.bodyTokens} | ${top || "none"} |`);
  }
  const problems = results.flatMap((r) => r.findings.filter((f) => f.severity !== "info").map((f) => ({ r, f })));
  if (problems.length) {
    lines.push("", "<details><summary>All findings</summary>", "");
    for (const { r, f } of problems)
      lines.push(`- **${f.severity}** \`${f.rule}\` in \`${rel(r.dir, base)}/${f.file}${f.line ? ":" + f.line : ""}\`: ${f.message}`);
    lines.push("", "</details>");
  }
  return lines.join("\n");
}

// GitHub Actions workflow commands, so findings show up as annotations on the
// changed files in a pull request.
export function formatGithub(results, { base = process.cwd(), quiet = false } = {}) {
  const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const escProp = (s) => esc(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
  const out = [];
  for (const r of results) {
    for (const f of r.findings) {
      if (f.severity === "info") continue;
      const level = f.severity === "error" ? "error" : "warning";
      const file = `${rel(r.dir, base)}/${f.file}`;
      out.push(`::${level} file=${escProp(file)}${f.line ? `,line=${f.line}` : ""},title=${escProp(f.rule)}::${esc(f.message)}`);
    }
  }
  if (!quiet) {
    const s = summarize(results);
    out.push(`vetted: ${s.skills} skills, ${s.errors} errors, ${s.warnings} warnings`);
  }
  return out.join("\n");
}
