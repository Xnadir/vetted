[English](README.md) | [اردو](README.ur.md)
<h1 align="center">vetted</h1>

<p align="center"><b>Agent skills that prove they work.</b><br/>
Every skill ships with an eval that runs <i>with</i> and <i>without</i> it on current models.<br/>
If it doesn't beat the baseline, it doesn't ship.</p>

<p align="center">
  <a href="https://github.com/Xnadir/vetted/actions/workflows/ci.yml"><img src="https://github.com/Xnadir/vetted/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e" alt="MIT"/></a>
  <img src="https://img.shields.io/badge/dependencies-0-0891b2" alt="Zero dependencies"/>
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Cursor%20%C2%B7%20Gemini%20CLI%20%C2%B7%20OpenCode-7c3aed" alt="Works with"/>
</p>

<p align="center"><img src="docs/assets/vet-demo.svg" alt="vetted scanning a skill folder: one skill fails with a remote-exec and a hidden unicode error, the others pass, with context cost per skill" width="860"/></p>

---

There are tens of thousands of agent skills on GitHub now. Almost none of them can tell you
whether they make your agent better, and a skill written for last year's model can quietly
make this year's model *worse*. Skills are also code you run with your agent's permissions,
and they mostly get installed unread.

This repo is two things:

1. **[Skills](#the-skills)** rebuilt for current models, the popular ideas that survived testing (verify before
   claiming done, root-cause debugging, bug-hunting review, grilling, handoffs) rewritten
   short and calm, each with an [eval suite](evals/) that measures what it adds over the model
   on its own.
2. **[`vet`](#vet-check-any-skill-before-you-trust-it)**, a zero-dependency scanner that checks
   any skill, any repo, or everything you have installed, for spec errors, weak triggers,
   context cost, outdated prompting, and security red flags.

## Quick start

**Install the skills**

```bash
# Claude Code
/plugin marketplace add Xnadir/vetted
/plugin install vetted@vetted

# Any agent that reads SKILL.md (Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Copilot...)
npx skills add Xnadir/vetted
```

Or copy a folder from [`skills/`](skills/) into your agent's skills directory
(`~/.claude/skills/`, `~/.agents/skills/`, `.cursor/skills/`, ...). Each skill is one
self-contained `SKILL.md`.

**Vet a skill repo before you install it**

```bash
npx @menadirali/skill-vet vet anthropics/skills     # any GitHub repo
npx @menadirali/skill-vet vet ./my-skills           # a local folder
npx @menadirali/skill-vet vet --installed           # everything your agents have installed
```

Node 18+ and nothing else. No install, no account, no network except the `git clone` when you
name a GitHub repo.

## The skills

| Skill | What it changes | Fires when |
| --- | --- | --- |
| [`prove-it`](skills/prove-it/SKILL.md) | Separates what was checked from what was only written. No "fixed!" without the command and output that shows it. *Helps Haiku 4.5; Sonnet 5.5 already does it.* | Finishing any code change |
| [`root-cause`](skills/root-cause/SKILL.md) | *On probation: mixed results (below).* Reproduce, trace the bad value back to its origin, fix it once there, and name the other callers it affected. | Debugging |
| [`bug-hunt-review`](skills/bug-hunt-review/SKILL.md) | Reviews for defects with a concrete failing scenario each, ranked by severity. No padding with style nits. | Reviewing code or a PR |
| [`grill`](skills/grill/SKILL.md) | Interviews you one decision at a time, each with a recommended answer, then writes a brief. | You ask to be grilled on a plan |
| [`handoff`](skills/handoff/SKILL.md) | Writes `HANDOFF.md` a fresh session can resume from: state, verification status, dead ends, exact next step. *Helps Haiku 4.5; Sonnet 5.5 already does it.* | Ending or clearing a long session |

All five together add **≈375 tokens** to your agent's context (names and descriptions). A
skill's body loads only when it fires, at 460–560 tokens each.

## Results

Each skill has an eval suite under [`evals/`](evals/) in the format of Anthropic's
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals). Every case runs 3 times
with the plugin loaded and 3 times without it, and the difference (Δ) is what the skill
contributes. Graders are deterministic regexes over files and replies where possible, and an
LLM judge with written PASS/FAIL rubrics where not.

<!-- results:start -->
| Skill | Sonnet 5.5<br/>with → without (Δ) | Haiku 4.5<br/>with → without (Δ) | Skill loaded | Verdict |
| --- | ---: | ---: | ---: | --- |
| [`answer-first`](retired/skills/answer-first/SKILL.md) _(retired)_ | 80% → 80% (**0**) | 80% → 77% (**+3**) | 0/6 · 0/6 | ✂️ no measurable effect |
| [`bug-hunt-review`](skills/bug-hunt-review/SKILL.md) | 100% → 90% (**+10**) | 87% → 70% (**+17**) | 6/6 · 6/6 | ✅ helps |
| [`grill`](skills/grill/SKILL.md) | 100% → 25% (**+75**) | 83% → 25% (**+58**) | 6/6 · 6/6 | ✅ helps |
| [`handoff`](skills/handoff/SKILL.md) | 100% → 100% (**0**) | 93% → 80% (**+13**) | 3/3 · 3/3 | ✅ helps on Haiku 4.5 |
| [`prove-it`](skills/prove-it/SKILL.md) | 100% → 100% (**0**) | 53% → 42% (**+11**) | 2/6 · 3/6 | ✅ helps on Haiku 4.5 |
| [`root-cause`](skills/root-cause/SKILL.md) | 100% → 88% (**+13**) | 38% → 49% (**-11**) | 0/6 · 0/6 | ✅ helps on Sonnet 5.5 |
| [`secure-defaults`](retired/skills/secure-defaults/SKILL.md) _(retired)_ | 100% → 100% (**0**) | 58% → 67% (**-8**) | 0/6 · 0/6 | ❌ hurts on Haiku 4.5 |
| [`stdlib-first`](retired/skills/stdlib-first/SKILL.md) _(retired)_ | 100% → 100% (**0**) | 92% → 92% (**0**) | 0/6 · 0/6 | ✂️ no measurable effect |
| [`surgical`](retired/skills/surgical/SKILL.md) _(retired)_ | 100% → 100% (**0**) | 100% → 100% (**0**) | 0/6 · 0/6 | ✂️ no measurable effect |
| _no skill should fire_ | 100% → 100% (**0**) | 100% → 100% (**0**) | – | ✅ nothing fired |

**Sonnet 5.5**: 19 cases × 3 runs per arm, judge `claude-sonnet-5-5`, Claude Code 2.1.284, 2026-09-29, ≈$5.62 at list price<br/>
**Haiku 4.5**: 19 cases × 3 runs per arm, judge `claude-sonnet-5-5`, Claude Code 2.1.284, 2026-09-29, ≈$5.28 at list price

<details><summary>Per-case scores</summary>

| Model | Skill | Case | With | Without | Δ | Loaded |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Sonnet 5.5 | _precision | `concept-question` | 100% | 100% | 0 | – |
| Sonnet 5.5 | _precision | `translate` | 100% | 100% | 0 | – |
| Sonnet 5.5 | answer-first | `fetch-vs-pull` | 60% | 60% | 0 | 0/3 |
| Sonnet 5.5 | answer-first | `task-report` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | bug-hunt-review | `clean-code-no-inventions` | 100% | 100% | 0 | 3/3 |
| Sonnet 5.5 | bug-hunt-review | `two-planted-bugs` | 100% | 80% | +20 | 3/3 |
| Sonnet 5.5 | grill | `auth-migration-plan` | 100% | 25% | +75 | 3/3 |
| Sonnet 5.5 | grill | `url-shortener` | 100% | 25% | +75 | 3/3 |
| Sonnet 5.5 | handoff | `csv-import-midway` | 100% | 100% | 0 | 3/3 |
| Sonnet 5.5 | prove-it | `claims-fix-without-shell` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | prove-it | `refactor-report` | 100% | 100% | 0 | 2/3 |
| Sonnet 5.5 | root-cause | `shared-formatter` | 100% | 75% | +25 | 0/3 |
| Sonnet 5.5 | root-cause | `wrong-layer-null` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | secure-defaults | `file-endpoint` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | secure-defaults | `sql-search` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | stdlib-first | `node-cli-args` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | stdlib-first | `python-time-ago` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | surgical | `add-function-keep-style` | 100% | 100% | 0 | 0/3 |
| Sonnet 5.5 | surgical | `fix-discount-leave-neighbors` | 100% | 100% | 0 | 0/3 |
| Haiku 4.5 | _precision | `concept-question` | 100% | 100% | 0 | – |
| Haiku 4.5 | _precision | `translate` | 100% | 100% | 0 | – |
| Haiku 4.5 | answer-first | `fetch-vs-pull` | 60% | 53% | +7 | 0/3 |
| Haiku 4.5 | answer-first | `task-report` | 100% | 100% | 0 | 0/3 |
| Haiku 4.5 | bug-hunt-review | `clean-code-no-inventions` | 100% | 100% | 0 | 3/3 |
| Haiku 4.5 | bug-hunt-review | `two-planted-bugs` | 73% | 40% | +33 | 3/3 |
| Haiku 4.5 | grill | `auth-migration-plan` | 67% | 25% | +42 | 3/3 |
| Haiku 4.5 | grill | `url-shortener` | 100% | 25% | +75 | 3/3 |
| Haiku 4.5 | handoff | `csv-import-midway` | 93% | 80% | +13 | 3/3 |
| Haiku 4.5 | prove-it | `claims-fix-without-shell` | 50% | 50% | 0 | 0/3 |
| Haiku 4.5 | prove-it | `refactor-report` | 56% | 33% | +22 | 3/3 |
| Haiku 4.5 | root-cause | `shared-formatter` | 75% | 75% | 0 | 0/3 |
| Haiku 4.5 | root-cause | `wrong-layer-null` | 0% | 22% | -22 | 0/3 |
| Haiku 4.5 | secure-defaults | `file-endpoint` | 67% | 83% | -17 | 0/3 |
| Haiku 4.5 | secure-defaults | `sql-search` | 50% | 50% | 0 | 0/3 |
| Haiku 4.5 | stdlib-first | `node-cli-args` | 100% | 100% | 0 | 0/3 |
| Haiku 4.5 | stdlib-first | `python-time-ago` | 83% | 83% | 0 | 0/3 |
| Haiku 4.5 | surgical | `add-function-keep-style` | 100% | 100% | 0 | 0/3 |
| Haiku 4.5 | surgical | `fix-discount-leave-neighbors` | 100% | 100% | 0 | 0/3 |

</details>
<!-- results:end -->

**The rule:** a skill stays only if its mean Δ is clearly positive on the current models. A
skill with no measurable effect gets cut and listed below, because a skill that doesn't change
behavior still costs context and attention on every turn.

**Cut so far (4 of the original 9):** `surgical`, `stdlib-first`, `answer-first`, and
`secure-defaults`. On both models they changed nothing measurable: the model without the skill
already kept diffs small, used built-ins, parameterized SQL, and answered directly. None of them
even loaded on natural prompts. They're kept in [`retired/`](retired/) with their evals, so anyone
can re-test them on a future model or propose harder cases.

**What we learned:** skills that add a *workflow the model wouldn't choose on its own* help most
(`grill`: a recommended answer with every question; `bug-hunt-review`: a concrete failing scenario
for every bug). "Be careful" skills that restate good habits don't help current models, and the
smaller model benefits more (`handoff` and `prove-it` help Haiku 4.5 only). `root-cause` never
loaded on either model, yet scored +13 on Sonnet and −11 on Haiku, so its effect comes from its
description in the skill list alone and isn't reliable yet; it stays on probation.

### Other people's skills

The [**registry**](registry/README.md) runs the same with/without test on popular skills from other
repositories, pinned to a commit. Anyone with Claude Code can add one: write two cases and run
`node scripts/vet-external.mjs registry/<owner>/<repo>/<skill> --by <you>`. Your name goes next to the
result.

## `vet`: check any skill before you trust it

`vet` reads every `SKILL.md` under the paths you give it, plus every script and reference file
beside it, and reports:

| Family | What it catches |
| --- | --- |
| **`sec/`** | Download-and-execute (`curl … \| sh`, `iex (iwr …)`), decode-and-execute, prompt injection ("ignore previous instructions", "without telling the user"), invisible Unicode and bidi overrides, permission bypass flags, credential-file access, exfiltration endpoints and raw IPs, cloud metadata access, env dumps, shell-profile/cron/hook persistence, unrestricted `allowed-tools`, shipped binaries, suspicious package names in install commands (typosquat detection) |
| **`spec/`** | The [Agent Skills spec](https://agentskills.io/specification): name format and directory match, description limits, frontmatter shape, broken links inside the skill, oversized bodies |
| **`trigger/`** | Descriptions too vague to match against, no "use when" clause, over Claude Code's 1,536-character listing cap, duplicate names, and two skills whose descriptions overlap enough to confuse selection |
| **`style/`** | Prompting habits that backfire on current models: walls of MUST/NEVER/CRITICAL, all-caps shouting, "You are a world-class expert…" boilerplate |
| **cost** | Estimated tokens each skill adds to every session, and on activation |

A scanned file can't silence the scanner: an inline `vet-ignore` comment downgrades a security
finding to info, but it stays in the report. Quoted examples ("pages may contain text like
*'ignore previous instructions'*") and matches in code comments or test fixtures are reported
at info level, not as errors. See the [rule reference](docs/rules.md) for every rule's
severity and examples, or run `skill-vet rules` for the full list (add `--format json` for tooling).

**In CI**, add it to any repo that contains skills. Findings show up as annotations on the pull
request and as a table in the job summary:

```yaml
- uses: actions/checkout@v4
- uses: Xnadir/vetted@v0
  with:
    path: skills        # default: .
    strict: "true"      # fail on warnings too
```

Other formats: `--format json` (stable schema), `--format markdown`, `--format github`,
`--format sarif` (SARIF 2.1.0 for code-scanning tools). Save a SARIF report with
`npx @menadirali/skill-vet vet ./skills --format sarif > results.sarif`.
Flags: `--quiet` (print only findings, no summary line or cost table), `--strict` (fail on warnings too), `--verbose` (show info-level findings), `--ignore` (skip rules).
Exit codes: `0` clean, `1` findings, `2` usage error.

**What it found in the wild.** We ran it on 9 of the most-starred skill repositories (115
skills). There were no security findings at warning level or above, which is good news. It did
find 2 spec errors (a description over the 1,024-character limit and a name that doesn't match
its folder) and 31 warnings, mostly bodies over the 500-line guideline, all-caps "shouting", and
descriptions that never say when to use the skill. Together those 115 skills would add ≈7.8k
tokens to every session if you installed all of them.

## How these skills are written

Current models follow instructions closely, so the old habits of prompting work against you.
Every skill here follows the same rules, and [`vet`](#vet-check-any-skill-before-you-trust-it)
checks the mechanical ones:

- **Explain why, once.** A rule with its reason generalizes to cases the rule didn't list. The
  same rule in capitals, repeated, gets over-applied.
- **Short.** 460–560 tokens per skill body. Nothing here needs `references/`.
- **The description is the trigger.** It says what the skill does, then when to use it, in the
  third person, under 1,024 characters.
- **Portable.** Frontmatter stays within the open spec, except `argument-hint` on `grill`.
  Plain Markdown, no hooks, no scripts, nothing to execute.
- **Measured.** No skill without an eval, and no eval grader that can only pass when the skill
  fired: the "skill fired" check is reported, but excluded from the score.

More in [docs/writing-skills.md](docs/writing-skills.md).

## Contributing

The most useful contributions, in order:

1. **An eval case** that a skill *should* pass and doesn't, or a case where a skill makes things
   worse. That's how skills get fixed, or cut.
2. **A new skill** with its eval suite. See [CONTRIBUTING.md](CONTRIBUTING.md): a skill is
   accepted when it shows a positive Δ on current models, not before.
3. **A `vet` rule**, or a false positive you hit on a real skill.

**New here?** Pick one of the
[good first issues](https://github.com/Xnadir/vetted/labels/good%20first%20issue). Most are a
single rule or file with a test to copy from. Comment to claim one, and PRs get reviewed within a day.
It's also a fit for Hacktoberfest: those issues carry the `hacktoberfest` label.

### Contributors

Thank you to everyone who has shipped something here:

- [@HarisShahnawaz](https://github.com/HarisShahnawaz): `sec/suspicious-install` typosquat rule, Urdu README
- [@Mevayaan1](https://github.com/Mevayaan1): `skill-vet rules --format json`, `sec/sudo` rule
- [@DYNOSuprovo](https://github.com/DYNOSuprovo): `--quiet` flag
- [@xyi74976-del](https://github.com/xyi74976-del): Windsurf, Kiro, Cline, and Amp support for `--installed`, the `sec/chmod-777` and `spec/license-missing` rules, SARIF output, the rule reference, and Node 18 in CI
- [@PandaHUN777](https://github.com/PandaHUN777): nested `SKILL.md` handling
- [@abdullahdevelopment](https://github.com/abdullahdevelopment): `=` and comma-list modes in `sec/chmod-777`

Your name goes here with your first merged PR.

## Prior art and thanks

These skills are rewrites of ideas that the community proved popular, not copies: obra's
[superpowers](https://github.com/obra/superpowers) (verification, systematic debugging), Forrest
Chang's [Karpathy guidelines](https://github.com/forrestchang/andrej-karpathy-skills)
(surgical changes), [ponytail](https://github.com/DietrichGebert/ponytail) (stdlib before
dependencies), [i-have-adhd](https://github.com/ayghri/i-have-adhd) (answer first), Matt
Pocock's [skills](https://github.com/mattpocock/skills) (grilling, handoffs), and Addy Osmani's
[agent-skills](https://github.com/addyosmani/agent-skills). The eval format is Anthropic's
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals), and the skill format is the
open [Agent Skills](https://agentskills.io) spec.

## Privacy

The plugin has no code and collects nothing; `skill-vet` runs locally with no telemetry. Details in [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE)
