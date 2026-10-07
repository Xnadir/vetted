// The checks `skill-vet vet` runs against each skill.
//
// Every finding has a stable rule id (used for suppression and docs), a
// severity (error | warn | info), a message, and where possible a file and
// line. Rules are grouped by prefix: spec/, trigger/, style/, cost/, sec/.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep, extname, basename, dirname } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";

export const SPEC_FIELDS = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];

// Frontmatter keys that Claude Code understands beyond the open spec. Other
// agents ignore them, which is fine, so they are informational only.
export const CLAUDE_CODE_FIELDS = [
  "when_to_use",
  "argument-hint",
  "disable-model-invocation",
  "user-invocable",
  "model",
  "effort",
  "context",
  "agent",
  "background",
  "hooks",
  "paths",
  "shell",
  "version",
];

export const LIMITS = {
  nameMax: 64,
  descriptionMax: 1024,
  compatibilityMax: 500,
  claudeListingMax: 1536,
  bodyLinesMax: 500,
  bodyTokensMax: 5000,
  descriptionMinChars: 40,
};

export const estimateTokens = (text) => Math.ceil((text || "").length / 4);

const TEXT_EXT = new Set([
  "", ".md", ".mdx", ".txt", ".sh", ".bash", ".zsh", ".ps1", ".psm1", ".bat", ".cmd", ".py", ".js", ".mjs",
  ".cjs", ".ts", ".tsx", ".jsx", ".rb", ".go", ".rs", ".java", ".php", ".pl", ".lua", ".json", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".html", ".htm", ".css", ".xml", ".sql", ".csv", ".env",
]);
const BINARY_EXEC_EXT = new Set([".exe", ".dll", ".so", ".dylib", ".bin", ".msi", ".scr", ".com", ".app"]);
const SKIP_DIRS = new Set([".git", "node_modules", "__pycache__", ".venv", "venv"]);
const MAX_FILE_BYTES = 1024 * 1024;

// Popular packages used as a reference list for typosquat detection.
// Keep this list small and curated; no network lookups, no new deps.
const POPULAR_PACKAGES = new Set([
  // Python
  "requests", "numpy", "pandas", "flask", "django", "scipy", "matplotlib", "pytest",
  // JavaScript / npm
  "lodash", "express", "react", "axios", "webpack", "eslint", "typescript",
]);
// Legitimate packages that happen to be close neighbors of popular ones.
const INSTALL_ALLOWLIST = new Set(["preact", "numba", "scapy", "serve", "tslint", "request", "pandoc"]);
// Flags whose next token is a value, not a package name.
const INSTALL_FLAGS_WITH_VALUE = new Set(["-r", "-e", "-c", "--index-url", "--features", "-F"]);
const INSTALL_CMD_RE = /\b(npm\s+i(?:nstall)?|pip3?\s+install|cargo\s+add)\b/;
// A closing backtick ends an inline-code command, so prose after it is not parsed.
const INSTALL_SHELL_OP_RE = /&&|\|\||[;|#`]/;

// ---------------------------------------------------------------- security patterns

const SEC_PATTERNS = [
  {
    rule: "sec/remote-exec",
    severity: "error",
    re: /\b(curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\n|]*\|\s*(iex|invoke-expression|python3?|node|perl|ruby)\b|(ba|z)?sh\s+<\(\s*(curl|wget)|\b(iex|invoke-expression)\s*\(?\s*\(?\s*(iwr|irm|invoke-webrequest|invoke-restmethod|new-object\s+net\.webclient)/i,
    msg: "downloads code and pipes it straight into an interpreter",
  },
  {
    rule: "sec/obfuscated-exec",
    severity: "error",
    re: /base64\s+(-d|--decode)[^\n]*\|\s*(ba|z)?sh\b|\beval\s*\(\s*atob\s*\(|\bexec\s*\(\s*(base64\.b64decode|codecs\.decode|bytes\.fromhex)|\beval\s*\(\s*Buffer\.from\([^)]*['"]base64['"]|powershell[^\n]*-e(nc(odedcommand)?)?\s+[A-Za-z0-9+/=]{40,}/i,
    msg: "decodes hidden content and executes it",
  },
  {
    rule: "sec/prompt-injection",
    severity: "error",
    re: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+)?(of\s+)?(the\s+|your\s+)?(previous|prior|above|earlier|system|original)\s+(instructions|prompts?|rules|guidelines|messages)\b|\b(do\s+not|don't|never)\s+(tell|inform|alert|notify)\s+the\s+user\s+(about|of|that\s+(you|this|it)|what\s+you)\b|\b(do\s+not|don't|never)\s+(mention|reveal|disclose|show)\s+(this|these|it|them|anything)\s+to\s+the\s+user\b|\bwithout\s+(telling|informing|notifying|alerting)\s+the\s+user\b|\b(hide|conceal|keep)\s+(this|these|it|them)\s+(secret\s+)?from\s+the\s+user\b|\byou\s+are\s+now\s+(in\s+)?(developer|dan|jailbreak|god)\s+mode\b/i,
    msg: "contains text that tries to override the agent's instructions or hide actions from the user",
  },
  {
    rule: "sec/permission-bypass",
    severity: "error",
    re: /--dangerously-skip-permissions|--dangerously-bypass-approvals-and-sandbox|\bbypassPermissions\b|\bdangerouslyDisableSandbox\b|--yolo\b|--full-auto\b/,
    msg: "asks the agent to run with permission checks or the sandbox turned off",
  },
  {
    rule: "sec/secret-access",
    severity: "warn",
    re: /~\/\.ssh\b|\bid_(rsa|ed25519|ecdsa)\b|\.aws\/credentials|\.netrc\b|\.git-credentials|\.docker\/config\.json|\.kube\/config|\/etc\/shadow|Login Data\b|login\.keychain|security\s+(find-(generic|internet)-password|dump-keychain)|\.config\/gh\/hosts\.yml|\.npmrc\b|\.pypirc\b/i,
    msg: "references credential or key files",
  },
  {
    rule: "sec/exfil-endpoint",
    severity: "warn",
    re: /https?:\/\/(?!127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)(\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|\b)|\b(webhook\.site|requestbin\.(com|net)|pipedream\.net|ngrok(-free)?\.(io|app|dev)|pastebin\.com|transfer\.sh|interact\.sh|oast\.(fun|pro|live|site|online|me)|burpcollaborator\.net|hookbin\.com|beeceptor\.com)\b|discord(app)?\.com\/api\/webhooks|api\.telegram\.org\/bot/i,
    msg: "talks to an address commonly used to collect exfiltrated data",
  },
  {
    rule: "sec/metadata-endpoint",
    severity: "warn",
    re: /169.254.169.254|metadata.google.internal|fd00:ec2::254/i,
    msg: "reaches the cloud instance-metadata service, which hands out credentials",
  },
  {
    rule: "sec/env-dump",
    severity: "warn",
    re: /\bprintenv\b[^\n]*\||\benv\s*\|\s*(curl|nc|base64)|JSON\.stringify\(\s*process\.env\s*\)|json\.dumps\(\s*(dict\()?\s*os\.environ|Get-ChildItem\s+env:[^\n]*\|/i,
    msg: "dumps all environment variables, which usually contain secrets",
  },
  {
    rule: "sec/destructive",
    severity: "warn",
    re: /\brm\s+-(rf|fr|r\s+-f|f\s+-r)\s+(--no-preserve-root\s+)?(\/|~|\$HOME|\/\*|\$\{HOME\})(\s|$|["'])|\bmkfs(\.\w+)?\s+\/dev\/|\bdd\s+[^\n]*of=\/dev\/(sd|nvme|disk|hd)|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|\bformat\s+[a-z]:\s*\/q|Remove-Item\s+[^\n]*-Recurse[^\n]*\s(C:\\|~|\$HOME|\$env:USERPROFILE)\s*(-|$)/i,
    msg: "can delete or overwrite a whole home directory or disk",
  },
  {
    rule: "sec/persistence",
    severity: "warn",
    re: /(?<![-=])>>?\s*~?\/?[\w./$]*\.(bashrc|zshrc|bash_profile|profile|zprofile)\b|\bcrontab\s+(-[^l\s]|\S+\.cron)|\blaunchctl\s+(load|bootstrap)\b|\bschtasks\s+\/create\b|CurrentVersion\\Run\b|\.claude\/settings(\.local)?\.json[^\n]*(>|hooks)/i,
    msg: "installs something that runs automatically outside the task (shell profile, cron, launch agent, hooks)",
  },
  {
    rule: "sec/sudo",
    severity: "warn",
    re: /\bsudo\b/,
    msg: "uses sudo, which escalates privileges",
  },
  {
    rule: "sec/chmod-777",
    severity: "warn",
    re: /\bchmod\s+(?:(?:-[A-Za-z]+|--[a-z-]+|--)\s+)*(?:0?777|[ugoa]*[ao][ugoa]*\+[rwxXst]*w[rwxXst]*)(?=\s|[`"';&|]|\.(?=\s|$)|$)/,
    msg: "makes files world-writable with chmod; use the narrowest permissions needed",
  },
];

const HIDDEN_UNICODE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|\uDB40[\uDC00-\uDC7F]/g;
const HIDDEN_NAMES = {
  "\u200B": "ZERO WIDTH SPACE", "\u200C": "ZERO WIDTH NON-JOINER", "\u200D": "ZERO WIDTH JOINER",
  "\u200E": "LEFT-TO-RIGHT MARK", "\u200F": "RIGHT-TO-LEFT MARK", "\u202A": "LRE", "\u202B": "RLE",
  "\u202C": "PDF", "\u202D": "LRO", "\u202E": "RIGHT-TO-LEFT OVERRIDE", "\u2066": "LRI", "\u2067": "RLI",
  "\u2068": "FSI", "\u2069": "PDI", "\u2060": "WORD JOINER", "\uFEFF": "ZERO WIDTH NO-BREAK SPACE",
};

// ---------------------------------------------------------------- style patterns

// Uppercase words that are normal in technical prose and not shouting.
const CAPS_ALLOW = new Set(
  (
    "API APIS CLI CSS CSV DB DNS DOM EOF GET HEAD HTML HTTP HTTPS ID IDE IO IP JSON JWT LLM MCP NPM OK OS PDF " +
    "PR PRS PUT POST PATCH DELETE REST SDK SQL SSH SSL TLS TODO FIXME NOTE UI UX URL URI UTC UTF UUID XML YAML " +
    "YAGNI DRY KISS AWS GCP CPU GPU RAM SSD USB README LICENSE MIT BSD GPL CI CD QA MVP ASCII ANSI AST CRUD " +
    "ORM RPC SSO SAML OAUTH OIDC CORS CSRF XSS SQLI RCE CVE OWASP PII GDPR HIPAA SLA SLO ETA FAQ PNG JPG JPEG " +
    "SVG GIF WEBP MP4 ZIP TAR GZ PATH HOME ENV STDIN STDOUT STDERR TTY PID SIGINT SIGTERM NULL NAN AND OR NOT " +
    "IF THEN ELSE FROM SELECT WHERE INSERT UPDATE CREATE TABLE INDEX JOIN LIMIT ORDER BY GROUP SKILL CLAUDE AGENTS"
  ).split(" "),
);
const EMPHASIS = /\b(MUST|NEVER|ALWAYS|CRITICAL|IMPORTANT|MANDATORY|REQUIRED|ABSOLUTELY|UNDER NO CIRCUMSTANCES)\b/g;
const EMPHASIS_WORD = /^(MUST|NEVER|ALWAYS|CRITICAL|IMPORTANT|MANDATORY|REQUIRED|ABSOLUTELY)$/;
const PERSONA = /\byou are (an? )?(expert|world[- ]class|senior|highly skilled|elite|10x|genius)\b/i;

// ---------------------------------------------------------------- helpers

function listFiles(dir, root = dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) listFiles(p, root, out);
    } else if (e.isFile()) out.push(p);
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let k = 0; k < index && k < text.length; k++) if (text.charCodeAt(k) === 10) line++;
  return line;
}

// Replaces fenced code blocks and inline code with spaces, keeping offsets.
function maskCode(text) {
  return text
    .replace(/(^|\n)[ \t]*(```|~~~)[^\n]*\n[\s\S]*?\n[ \t]*\2[^\n]*(?=\n|$)/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]+`/g, (m) => " ".repeat(m.length));
}

// Suppressions: `<!-- vet-ignore: rule-a, rule-b -->` anywhere in a file
// silences those rules for the file; `vet-ignore-next-line: rule` (in any
// comment syntax) silences them for the following line only.
function suppressions(text) {
  const file = new Set();
  const lines = new Map();
  const src = text.split("\n");
  src.forEach((l, idx) => {
    const f = l.match(/vet-ignore:\s*([\w/*,\s-]+?)\s*(-->|\*\/|$)/);
    if (f && !/vet-ignore-next-line/.test(l)) f[1].split(/[,\s]+/).filter(Boolean).forEach((r) => file.add(r));
    const n = l.match(/vet-ignore-next-line:\s*([\w/*,\s-]+?)\s*(-->|\*\/|$)/);
    if (n) lines.set(idx + 2, new Set(n[1].split(/[,\s]+/).filter(Boolean)));
  });
  return { file, lines };
}

const ruleMatches = (set, rule) =>
  set.has(rule) || set.has("*") || [...set].some((s) => s.endsWith("/*") && rule.startsWith(s.slice(0, -1)));

// ---------------------------------------------------------------- main entry

export function vetSkill(skillFile) {
  const skillDir = dirname(resolve(skillFile));
  const text = readFileSync(skillFile, "utf8");
  const { data, body, bodyStartLine, warnings: parseWarnings, unterminated } = parseFrontmatter(text);
  const findings = [];
  const add = (rule, severity, message, file = "SKILL.md", line) => findings.push({ rule, severity, message, file, line });

  const fm = data || {};
  const name = typeof fm.name === "string" ? fm.name : undefined;
  const description = typeof fm.description === "string" ? fm.description.trim() : undefined;
  const whenToUse = typeof fm.when_to_use === "string" ? fm.when_to_use.trim() : "";

  // ---- spec
  if (!data) {
    add("spec/frontmatter-missing", "error", unterminated ? "frontmatter is opened with --- but never closed" : "SKILL.md has no YAML frontmatter; it must start with a --- block containing name and description", "SKILL.md", 1);
  }
  for (const w of parseWarnings) add("spec/frontmatter-parse", "warn", `frontmatter: ${w}`, "SKILL.md");

  if (data) {
    if (typeof fm.license !== "string" || !fm.license.trim())
      add("spec/license-missing", "info", "frontmatter has no `license`; declare the terms under which the skill can be reused");
    if (name === undefined || name === "") add("spec/name-missing", "error", "frontmatter has no `name`");
    else {
      if (name.length > LIMITS.nameMax) add("spec/name-format", "error", `name is ${name.length} characters; the limit is ${LIMITS.nameMax}`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name))
        add("spec/name-format", "error", `name "${name}" must be lowercase letters, digits, and single hyphens, not starting or ending with a hyphen`);
      const dirName = basename(skillDir);
      if (dirName !== name) add("spec/name-dir-mismatch", "error", `name "${name}" doesn't match its directory "${dirName}"`);
    }
    if (!description) add("spec/description-missing", "error", "frontmatter has no `description`; agents use it to decide when to load the skill");
    else if (description.length > LIMITS.descriptionMax)
      add("spec/description-length", "error", `description is ${description.length} characters; the spec limit is ${LIMITS.descriptionMax}`);

    if (fm.compatibility !== undefined) {
      if (typeof fm.compatibility !== "string" || fm.compatibility.length === 0 || fm.compatibility.length > LIMITS.compatibilityMax)
        add("spec/compatibility-length", "error", `compatibility must be a string of 1-${LIMITS.compatibilityMax} characters`);
    }
    if (fm.metadata !== undefined && fm.metadata !== null) {
      const ok = typeof fm.metadata === "object" && !Array.isArray(fm.metadata) && Object.values(fm.metadata).every((v) => typeof v === "string");
      if (!ok) add("spec/metadata-shape", "warn", "metadata should be a map of string keys to string values (quote numbers and booleans)");
    }
    if (fm["allowed-tools"] !== undefined && typeof fm["allowed-tools"] !== "string" && !Array.isArray(fm["allowed-tools"]))
      add("spec/allowed-tools-shape", "warn", "allowed-tools should be a space-separated string");

    for (const key of Object.keys(fm)) {
      if (SPEC_FIELDS.includes(key)) continue;
      if (CLAUDE_CODE_FIELDS.includes(key))
        add("spec/extension-field", "info", `\`${key}\` is a Claude Code extension; other agents ignore it`);
      else {
        const maxDist = key.length >= 7 ? 2 : 1;
        const near = [...SPEC_FIELDS, ...CLAUDE_CODE_FIELDS].find((k) => k !== key && editDistance(k, key.toLowerCase().replace(/_/g, "-")) <= maxDist);
        if (near) add("spec/unknown-field", "warn", `unknown frontmatter field \`${key}\`; did you mean \`${near}\`?`);
        else add("spec/unknown-field", "info", `non-standard frontmatter field \`${key}\`; agents that don't know it will ignore it`);
      }
    }
  }

  const bodyLines = body.split("\n").length;
  const bodyTokens = estimateTokens(body);
  if (bodyLines > LIMITS.bodyLinesMax)
    add("spec/body-too-long", "warn", `SKILL.md body is ${bodyLines} lines; keep it under ${LIMITS.bodyLinesMax} and move detail into references/`);
  else if (bodyTokens > LIMITS.bodyTokensMax)
    add("spec/body-too-long", "warn", `SKILL.md body is about ${bodyTokens} tokens; keep it under ${LIMITS.bodyTokensMax} and move detail into references/`);

  // Relative markdown links must resolve.
  const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const m of maskCode(body).matchAll(linkRe)) {
    const target = m[1];
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/|mailto:)/i.test(target) || target.startsWith("<")) continue;
    if (!/[./]/.test(target)) continue; // a placeholder such as (URL) or (link)
    const expanded = target.replace(/\$\{CLAUDE_SKILL_DIR\}\/?/g, "");
    if (expanded.includes("${") || expanded.includes("$CLAUDE")) continue; // resolved at runtime
    const clean = safeDecode(expanded.split("#")[0].split("?")[0]);
    if (!clean) continue;
    if (!existsSync(join(skillDir, clean)))
      add("spec/broken-reference", "error", `links to \`${clean}\`, which doesn't exist in the skill`, "SKILL.md", bodyStartLine + lineOf(body, m.index) - 1);
  }
  for (const m of maskLinks(body).matchAll(/`((?:scripts|references|assets)\/[^`\s]+)`/g)) {
    const p = m[1].replace(/[),.;:]+$/, "");
    if (/[*{}<>$]/.test(p)) continue;
    if (!existsSync(join(skillDir, p)))
      add("spec/broken-reference", "info", `mentions \`${p}\`, which doesn't exist in the skill`, "SKILL.md", bodyStartLine + lineOf(body, m.index) - 1);
  }

  // ---- trigger quality
  if (description) {
    const words = description.split(/\s+/).filter(Boolean).length;
    if (description.length < LIMITS.descriptionMinChars || words < 8)
      add("trigger/too-vague", "warn", "description is very short; agents match requests against it, so name the task and the situations it covers");
    const combined = description + " " + whenToUse;
    const userOnly = fm["disable-model-invocation"] === true;
    if (!userOnly && !/\b(use|used|invoke|invoked|trigger|triggers|apply|applies|load|activate)\b[^.]{0,120}\b(when|whenever|for|if|before|after|on)\b|\bwhen\b|\bwhenever\b/i.test(combined))
      add("trigger/no-when", "warn", 'description says what the skill does but not when to use it; add a "Use when ..." clause');
    if (/^\s*(i|i'm|i am|i can|i will|i'll)\b|\b(i can help|i will help|you can use me|let me)\b/i.test(description))
      add("trigger/first-person", "info", "write the description in the third person (\"Formats X...\"), since it's inserted into the agent's own context");
    const listing = description.length + (whenToUse ? whenToUse.length + 1 : 0);
    if (listing > LIMITS.claudeListingMax)
      add("trigger/listing-truncated", "warn", `description + when_to_use is ${listing} characters; Claude Code truncates the skill listing at ${LIMITS.claudeListingMax}, so put the key use case first`);
  }

  // ---- style (prose only: code is masked)
  const prose = maskCode(body);
  const emphasis = [...prose.matchAll(EMPHASIS)];
  if (emphasis.length >= 6) {
    add(
      "style/emphasis-overload",
      "warn",
      `${emphasis.length} all-caps directives (MUST, NEVER, CRITICAL...). Current models follow instructions closely, and heavy emphasis tends to make them over-apply a rule; state the rule once and explain why`,
      "SKILL.md",
      bodyStartLine + lineOf(body, emphasis[0].index) - 1,
    );
  }
  const capsWords = [...prose.matchAll(/\b[A-Z]{4,}\b/g)].filter((m) => !CAPS_ALLOW.has(m[0]) && !EMPHASIS_WORD.test(m[0]));
  const wordCount = prose.split(/\s+/).filter(Boolean).length || 1;
  if (capsWords.length >= 8 && capsWords.length / wordCount > 0.01)
    add("style/shouting", "warn", `${capsWords.length} words in all caps; write calmly and put the reason next to the rule instead`, "SKILL.md", bodyStartLine + lineOf(body, capsWords[0].index) - 1);
  const persona = prose.match(PERSONA);
  if (persona)
    add("style/persona-boilerplate", "info", `"${persona[0]}" adds little for current models; describe the task, constraints, and why they matter instead`, "SKILL.md", bodyStartLine + lineOf(body, persona.index) - 1);

  // ---- security: every text file in the skill
  const files = listFiles(skillDir);
  let resourceBytes = 0;
  for (const f of files) {
    const rel = relative(skillDir, f).split(sep).join("/");
    const ext = extname(f).toLowerCase();
    let size = 0;
    try {
      size = statSync(f).size;
    } catch {
      continue;
    }
    if (rel !== "SKILL.md") resourceBytes += size;
    if (BINARY_EXEC_EXT.has(ext)) {
      add("sec/binary", "warn", "ships a compiled executable, which can't be reviewed as text", rel);
      continue;
    }
    if (!TEXT_EXT.has(ext) || size > MAX_FILE_BYTES) continue;
    const content = readFileSync(f, "utf8");
    const sup = suppressions(content);
    // A scanned file must not be able to silence the scanner, so an inline
    // vet-ignore only downgrades a security finding to info; it stays listed.
    const push = (rule, severity, message, line) => {
      const ls = sup.lines.get(line);
      const suppressed = ruleMatches(sup.file, rule) || (ls && ruleMatches(ls, rule));
      if (suppressed) add(rule, "info", `[suppressed in file] ${message}`, rel, line);
      else add(rule, severity, message, rel, line);
    };

    for (const m of content.matchAll(HIDDEN_UNICODE)) {
      if (m.index === 0 && m[0] === "\uFEFF") continue;
      const cp = m[0].codePointAt(0);
      const label = HIDDEN_NAMES[m[0]] || (cp >= 0xe0000 ? "TAG CHARACTER (invisible ASCII)" : `U+${cp.toString(16).toUpperCase()}`);
      push("sec/hidden-unicode", "error", `contains an invisible character (${label}) that can hide instructions from a human reviewer`, lineOf(content, m.index));
      break;
    }
    const isMarkdown = ext === ".md" || ext === ".mdx";
    const lines = content.split("\n");
    for (const p of SEC_PATTERNS) {
      const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g");
      for (const m of content.matchAll(re)) {
        const line = lineOf(content, m.index);
        const snippet = m[0].replace(/\s+/g, " ").slice(0, 80);
        const text = lines[line - 1] ?? "";
        const col = m.index - (content.lastIndexOf("\n", m.index - 1) + 1);
        if (p.rule === "sec/prompt-injection" && isQuotedMention(text, col)) {
          push(p.rule, "info", `quotes a prompt-injection phrase, apparently as an example: \`${snippet}\``, line);
        } else if (isMarkdown && isNegatedOrCautionary(text, col)) {
          push(p.rule, "info", `(negated or cautionary) ${p.msg}: \`${snippet}\``, line);
        } else if (p.severity === "warn" && !isMarkdown && isCodeComment(text)) {
          push(p.rule, "info", `(in a code comment) ${p.msg}: \`${snippet}\``, line);
        } else if (p.severity === "warn" && isTestFile(rel)) {
          push(p.rule, "info", `(in a test file) ${p.msg}: \`${snippet}\``, line);
        } else if (p.severity === "warn" && isMarkdown && (isDefensive(text) || insideQuotes(text, col))) {
          push(p.rule, "info", `(quoted or framed as something to block) ${p.msg}: \`${snippet}\``, line);
        } else {
          push(p.rule, p.severity, `${p.msg}: \`${snippet}\``, line);
        }
      }
    }
    // Typosquat-install check: scan every line for suspicious package names.
    for (let li = 0; li < lines.length; li++) {
      for (const pkg of parseInstallPackages(lines[li])) {
        const hit = suspiciousInstallMatch(pkg);
        if (hit) push("sec/suspicious-install", "warn", `installs \`${pkg}\`, which is 1\u20132 edits from \`${hit}\`; verify it is not a typosquat`, li + 1);
      }
    }
    if (isMarkdown) {
      for (const m of content.matchAll(/<!--([\s\S]*?)-->/g)) {
        const inner = m[1].trim();
        if (/^vet-ignore/.test(inner) || inner.length < 20) continue;
        if (/\b(ignore (all|any|the|previous|prior)|disregard|exfiltrat\w*|upload|curl|wget|system prompt|you must|you are now|do not tell|without telling|secretly)\b/i.test(inner))
          push("sec/hidden-instructions", "warn", "has an HTML comment addressed to the agent; it's invisible when rendered but the agent reads it", lineOf(content, m.index));
      }
    }
  }

  // allowed-tools that grant an unrestricted shell
  const tools = Array.isArray(fm["allowed-tools"]) ? fm["allowed-tools"].join(" ") : fm["allowed-tools"];
  if (typeof tools === "string" && /(^|[\s,])(Bash|PowerShell|Shell)(\(\s*\*?\s*(:\s*\*)?\s*\))?(?=$|[\s,])/.test(tools))
    add("sec/broad-allowed-tools", "warn", "allowed-tools pre-approves an unrestricted shell; scope it, e.g. Bash(git:*) Bash(npm test:*)");

  // Non-security rules can be fully silenced from SKILL.md itself.
  const own = suppressions(text);
  const kept = findings.filter((f) => f.rule.startsWith("sec/") || !(f.file === "SKILL.md" && ruleMatches(own.file, f.rule)));

  return {
    path: skillFile,
    dir: skillDir,
    name: name ?? basename(skillDir),
    description: description ?? "",
    frontmatter: fm,
    cost: {
      descriptionTokens: estimateTokens((description ?? "") + (whenToUse ? " " + whenToUse : "")),
      bodyTokens,
      bodyLines,
      resourceBytes,
      files: files.length,
    },
    findings: kept.sort(bySeverity),
  };
}

// True when the match sits inside quotes on its line, or the line frames it
// as an example of an attack ("e.g.", "untrusted", "injection").
// True when the line warns *against* what was matched, so the finding is a
// mention rather than an instruction. Deliberately narrow, because the scanned
// file controls this text: a "don't" elsewhere on the line is not enough.
//  - the line is marked as a bad example (❌, 🚫, ⛔, ✗, "Bad:", "Avoid:", ...)
//  - the match sits in an "even in/with/when ..." clause ("Even in --yolo mode, ...")
//  - a prohibition governs the match in the same clause ("Never run curl … | sh"),
//    but not "don't hesitate/worry/forget/mind ..."
const BAD_EXAMPLE_MARKER = /^[\s>*+-]*(?:\d+[.)]\s*)?(?:❌|🚫|⛔|✗|✘|(?:bad|avoid|wrong|don'?t|do not|never|anti-pattern)\s*:)/iu;
const CLAUSE_BREAK = /[.;:!?,]/g;

function isNegatedOrCautionary(line, col) {
  if (BAD_EXAMPLE_MARKER.test(line)) return true;
  const before = line.slice(0, col);
  let clauseStart = 0;
  for (const m of before.matchAll(CLAUSE_BREAK)) clauseStart = m.index + 1;
  const clause = before.slice(clauseStart);
  if (/\beven\s+(in|with|when|under|if)\b/i.test(clause)) return true;
  return /\b(don'?t|do\s+not|never|must\s+not|mustn'?t|should\s+not|shouldn'?t|avoid|no)\b(?!\s+(hesitate|worry|forget|mind|need|wait|matter|problem|longer)\b)[^.;:!?,]{0,40}$/i.test(
    clause,
  );
}

function insideQuotes(line, col) {
  const before = line.slice(0, col);
  return (before.match(/["“”]/g) || []).length % 2 === 1 || /['‘]\s*$/.test(before);
}

function isQuotedMention(line, col) {
  if (insideQuotes(line, col)) return true;
  if ((line.slice(0, col).match(/`/g) || []).length % 2 === 1) return true;
  return /\b(e\.g\.|for example|such as|untrusted|injection|looks like|treat (it|them|this) as data|malicious)\b/i.test(line);
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const isTestFile = (rel) => /(^|\/)(tests?|__tests__|fixtures?|spec)\/|\.(test|spec)\.[a-z]+$/i.test(rel);
const isDefensive = (line) =>
  /\b(block|blocks|blocked|deny|denied|reject|prevent|never|don't|do not|avoid|ssrf|allow-?list|block-?list|disallow|forbid|untrusted|attacker|malicious)\b/i.test(line);

const isCodeComment = (line) => /^\s*(\/\/|#(?!!)|\*|\/\*|--|;|rem\s|<!--)/i.test(line);

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Extracts package names from one install-command line, stopping at shell operators. */
function parseInstallPackages(line) {
  const m = line.match(INSTALL_CMD_RE);
  if (!m) return [];
  let rest = line.slice(m.index + m[0].length);
  const opIdx = rest.search(INSTALL_SHELL_OP_RE);
  if (opIdx !== -1) rest = rest.slice(0, opIdx);
  const pkgs = [];
  let skipNext = false;
  for (let tok of rest.trim().split(/\s+/).filter(Boolean)) {
    // Strip surrounding punctuation that isn't part of a package name (backticks, quotes, parens...).
    tok = tok.replace(/^[`'"(]+/, "").replace(/[`'".,;:!?)]+$/, "");
    if (!tok) continue;
    if (skipNext) { skipNext = false; continue; }
    if (INSTALL_FLAGS_WITH_VALUE.has(tok)) { skipNext = true; continue; }
    if (tok.startsWith("-")) continue;
    // Skip scoped packages (@scope/pkg), paths (contain / or .), and URLs (contain :).
    if (tok.startsWith("@") || /[\/.]/.test(tok) || tok.includes(":")) continue;
    // Strip extras ([security]), then version specifiers (@x, ==x, >=x, etc.).
    const name = tok.replace(/\[.*\]/, "").replace(/[@=<>~!].*$/, "").toLowerCase();
    if (name.length >= 5) pkgs.push(name);
  }
  return pkgs;
}

/**
 * Returns the popular package that `pkg` appears to be a typosquat of, or null.
 * Uses distance-1 for short popular names (<=5 chars) and distance 1-2 for longer ones.
 */
function suspiciousInstallMatch(pkg) {
  if (INSTALL_ALLOWLIST.has(pkg)) return null;
  for (const popular of POPULAR_PACKAGES) {
    if (pkg === popular) return null; // exact match — the real package
    const threshold = popular.length <= 5 ? 1 : 2;
    if (editDistance(pkg, popular) <= threshold) return popular;
  }
  return null;
}

function maskLinks(text) {
  return text.replace(/\[[^\]]*\]\([^)]*\)/g, (m) => " ".repeat(m.length));
}

const RANK = { error: 0, warn: 1, info: 2 };
function bySeverity(a, b) {
  return RANK[a.severity] - RANK[b.severity] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0);
}

// ---------------------------------------------------------------- cross-skill checks

const STOP = new Set(
  "a an the and or of to in on for with when use used using this that it its is are be as by from at into your you skill skills code any".split(" "),
);
const tokenize = (s) => new Set(s.toLowerCase().match(/[a-z][a-z0-9-]+/g)?.filter((w) => !STOP.has(w) && w.length > 2) ?? []);

export function crossSkillFindings(results) {
  const extra = [];
  // Same name in different skill roots is normal (one copy per agent), so
  // only skills that share a parent directory can collide.
  const byName = new Map();
  for (const r of results) {
    const key = dirname(r.dir) + "\0" + r.name;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(r);
  }
  for (const group of byName.values()) {
    const name = group[0].name;
    if (group.length < 2) continue;
    const distinct = new Set(group.map((g) => readFileSync(g.path, "utf8")));
    if (distinct.size === 1) continue; // identical copies for different agents are fine
    for (const g of group)
      extra.push({ skill: g, finding: { rule: "trigger/duplicate-name", severity: "warn", message: `another skill is also named "${name}" with different content; agents will load only one of them`, file: "SKILL.md" } });
  }
  const uniq = [...byName.values()].map((g) => g[0]);
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      if (uniq[i].name === uniq[j].name) continue; // per-agent copies of one skill
      const a = tokenize(uniq[i].description);
      const b = tokenize(uniq[j].description);
      if (a.size < 5 || b.size < 5) continue;
      const inter = [...a].filter((w) => b.has(w)).length;
      const jaccard = inter / (a.size + b.size - inter);
      if (jaccard >= 0.5) {
        extra.push({
          skill: uniq[i],
          finding: {
            rule: "trigger/overlap",
            severity: "warn",
            message: `description overlaps ${Math.round(jaccard * 100)}% with "${uniq[j].name}"; the agent may load the wrong one`,
            file: "SKILL.md",
          },
        });
      }
    }
  }
  return extra;
}
