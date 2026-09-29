<h1 align="center">vetted</h1>

<p align="center"><b>Agent skills that prove they work.</b><br/>
Every skill ships with an eval that runs <i>with</i> and <i>without</i> it on current models.<br/>
If it doesn't beat the baseline, it doesn't ship.</p>

<p align="center">
  <a href="https://github.com/nadirali1350/vetted/actions/workflows/ci.yml"><img src="https://github.com/nadirali1350/vetted/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
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

1. **[Skills](#the-skills)** rebuilt for current models, the popular ideas (verify before
   claiming done, minimal diffs, root-cause debugging, bug-hunting review, handoffs) rewritten
   short and calm, each with an [eval suite](evals/) that measures what it adds over the model
   on its own.
2. **[`vet`](#vet-check-any-skill-before-you-trust-it)**, a zero-dependency scanner that checks
   any skill, any repo, or everything you have installed, for spec errors, weak triggers,
   context cost, outdated prompting, and security red flags.

## Quick start

**Install the skills**

```bash
# Claude Code
/plugin marketplace add nadirali1350/vetted
/plugin install vetted@vetted

# Any agent that reads SKILL.md (Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Copilot...)
npx skills add nadirali1350/vetted
```

Or copy a folder from [`skills/`](skills/) into your agent's skills directory
(`~/.claude/skills/`, `~/.agents/skills/`, `.cursor/skills/`, ...). Each skill is one
self-contained `SKILL.md`.

**Vet a skill repo before you install it**

```bash
npx skill-vet vet anthropics/skills     # any GitHub repo
npx skill-vet vet ./my-skills           # a local folder
npx skill-vet vet --installed           # everything your agents have installed
```

Node 18+ and nothing else. No install, no account, no network except the `git clone` when you
name a GitHub repo.

## The skills

| Skill | What it changes | Fires when |
| --- | --- | --- |
| [`prove-it`](skills/prove-it/SKILL.md) | Separates what was checked from what was only written. No "fixed!" without the command and output that shows it. | Finishing any code change |
| [`surgical`](skills/surgical/SKILL.md) | Smallest diff that solves the request. No drive-by refactors, reformatting, or renames; notices go in the reply instead. | Editing existing code |
| [`root-cause`](skills/root-cause/SKILL.md) | Reproduce, trace the bad value back to its origin, fix it once there, and name the other callers it affected. | Debugging |
| [`bug-hunt-review`](skills/bug-hunt-review/SKILL.md) | Reviews for defects with a concrete failing scenario each, ranked by severity. No padding with style nits. | Reviewing code or a PR |
| [`stdlib-first`](skills/stdlib-first/SKILL.md) | Runtime built-ins and existing dependencies before new packages, with a note when it skipped one. | Code that could pull in a package |
| [`grill`](skills/grill/SKILL.md) | Interviews you one decision at a time, each with a recommended answer, then writes a brief. | You ask to be grilled on a plan |
| [`handoff`](skills/handoff/SKILL.md) | Writes `HANDOFF.md` a fresh session can resume from: state, verification status, dead ends, exact next step. | Ending or clearing a long session |
| [`answer-first`](skills/answer-first/SKILL.md) | The first sentence is the answer. No preamble, no recap, no sign-off. | Direct questions and task reports |
| [`secure-defaults`](skills/secure-defaults/SKILL.md) | *On probation.* Parameterized SQL, argument arrays, path containment, and so on. Current models may already do this. | Code touching untrusted input |

All nine together add **≈685 tokens** to your agent's context (names and descriptions). A
skill's body loads only when it fires, at 400–560 tokens each.

## Results

Each skill has an eval suite under [`evals/`](evals/) in the format of Anthropic's
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals). Every case runs 3 times
with the plugin loaded and 3 times without it, and the difference (Δ) is what the skill
contributes. Graders are deterministic regexes over files and replies where possible, and an
LLM judge with written PASS/FAIL rubrics where not.

<!-- results:start -->
> **First full run pending.** The suites are written and load cleanly; results for
> `claude-sonnet-5-5` and `claude-opus-5-5` will be published here, including any skill that
> fails to beat the baseline. To run them yourself:
>
> ```bash
> npm run evals   # needs Claude Code 2.1.269+, logged in; costs real usage
> ```
<!-- results:end -->

**The rule:** a skill stays only if its mean Δ is clearly positive on the current models. A
skill with no measurable effect gets cut and listed below, because a skill that doesn't change
behavior still costs context and attention on every turn.

**Cut so far:** none yet. `secure-defaults` is on probation because current models may already
parameterize SQL and avoid `shell=True` without being told.

## `vet`: check any skill before you trust it

`vet` reads every `SKILL.md` under the paths you give it, plus every script and reference file
beside it, and reports:

| Family | What it catches |
| --- | --- |
| **`sec/`** | Download-and-execute (`curl … \| sh`, `iex (iwr …)`), decode-and-execute, prompt injection ("ignore previous instructions", "without telling the user"), invisible Unicode and bidi overrides, permission bypass flags, credential-file access, exfiltration endpoints and raw IPs, cloud metadata access, env dumps, shell-profile/cron/hook persistence, unrestricted `allowed-tools`, shipped binaries |
| **`spec/`** | The [Agent Skills spec](https://agentskills.io/specification): name format and directory match, description limits, frontmatter shape, broken links inside the skill, oversized bodies |
| **`trigger/`** | Descriptions too vague to match against, no "use when" clause, over Claude Code's 1,536-character listing cap, duplicate names, and two skills whose descriptions overlap enough to confuse selection |
| **`style/`** | Prompting habits that backfire on current models: walls of MUST/NEVER/CRITICAL, all-caps shouting, "You are a world-class expert…" boilerplate |
| **cost** | Estimated tokens each skill adds to every session, and on activation |

A scanned file can't silence the scanner: an inline `vet-ignore` comment downgrades a security
finding to info, but it stays in the report. Quoted examples ("pages may contain text like
*'ignore previous instructions'*") and matches in code comments or test fixtures are reported
at info level, not as errors. Run `vetted rules` for the full list.

**In CI**, add it to any repo that contains skills. Findings show up as annotations on the pull
request and as a table in the job summary:

```yaml
- uses: actions/checkout@v4
- uses: nadirali1350/vetted@v0
  with:
    path: skills        # default: .
    strict: "true"      # fail on warnings too
```

Other formats: `--format json` (stable schema), `--format markdown`, `--format github`.
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
- **Short.** 400–560 tokens per skill body. Nothing here needs `references/`.
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

Good first issues are labeled
[`good first issue`](https://github.com/nadirali1350/vetted/labels/good%20first%20issue).

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

## License

[MIT](LICENSE)
