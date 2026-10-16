# Contributing to vetted

Thanks for helping. This project has one rule that shapes everything else: **a skill earns its
place with evidence.** A pull request that adds or changes a skill comes with eval cases, and it's
judged on what those cases show.

## Ways to contribute

| You want to... | Do this | Size |
| --- | --- | --- |
| Report a skill that misbehaves | Open an issue with the prompt, what happened, and what you expected. Better: add it as an eval case. | Small |
| Add an eval case | Add a directory under `evals/<skill>/`. See [Writing eval cases](#writing-eval-cases). | Small |
| Report a `vet` false positive or miss | Open an issue with the smallest skill that shows it. | Small |
| Add or improve a `vet` rule | Edit `cli/lib/rules.mjs` and add a test in `cli/test/rules.test.mjs`. | Medium |
| Test someone else's skill | Add an entry to the [registry](registry/README.md): a pointer to the skill, two eval cases, and the result of one command. Needs Claude Code. | Medium |
| Improve a skill's wording | Change `skills/<name>/SKILL.md` and show the eval result before and after. | Medium |
| Propose a new skill | Open an issue first, then a PR with the skill and at least two eval cases. | Large |

## Setup

```bash
git clone https://github.com/Xnadir/vetted
cd vetted
npm test                     # vet's unit tests, Node 18+, no install step
node cli/vet.mjs vet skills  # check the skills
```

Nothing to install: `vet` has zero dependencies, and the skills are Markdown.

To run evals you need [Claude Code](https://code.claude.com) 2.1.269 or later, logged in. Evals
make real model calls against your plan or API key.

```bash
# one case, one run, with-arm only: cheap, for iterating
claude plugin eval . --case claims-fix-without-shell --runs 1 --ablation none \
  --trust-plugin --scaffold --allow-tools Write Edit --no-publish

# the full comparison for one skill
claude plugin eval . --tag prove-it --trust-plugin --scaffold --allow-tools Write Edit --no-publish
```

On Windows, evals that grant `Bash` need WSL2, since the eval sandbox has no native Windows
backend. The current suites only grant `Read`, `Write`, and `Edit`, so they run anywhere.

## Writing a skill

Copy [`templates/SKILL.template.md`](templates/SKILL.template.md) to `skills/<name>/SKILL.md`, and [`templates/eval-case/`](templates/eval-case/) to `evals/<name>/<case>/`. A skill here is:

- **One job.** If the description needs "and also", it's two skills.
- **Short.** Aim for 300–600 tokens of body. `vet` warns over ~5,000, but you won't get close.
- **Calm.** State each rule once, with the reason next to it. No walls of MUST/NEVER. Current
  models follow instructions closely, and emphasis makes them over-apply rules.
- **Triggered by its description.** First what it does, then "Use when ...", in the third person.
- **Portable.** Frontmatter from the [open spec](https://agentskills.io/specification): `name`,
  `description`, `license`. Claude Code-only fields only when they're needed.
- **Inert.** No scripts, hooks, or network access in this repo's skills. If a skill truly needs a
  script, open an issue first.

Then run `node cli/vet.mjs vet skills --strict`. It must pass.

## Writing eval cases

Each case is a directory: `evals/<skill>/<case-name>/`.

```
evals/prove-it/refactor-report/
├── prompt.md        # frontmatter: limits and tools; body: what the user types
├── case.yaml        # only if the case needs fixture files (scaffold_script)
├── fixture.sh       # creates the files the task starts from
└── graders/
    ├── kept-behavior.md   # did the task get done?
    ├── honest-status.md   # did the skill's behavior show up?
    └── skill-fired.md     # indicator only; excluded from the score
```

Good cases:

- **Phrase the prompt like a real user**, without naming the skill. The eval should tell us
  whether the skill triggers on natural requests.
- **Grade outcomes, not wording.** "The unrelated lines are byte-for-byte unchanged" is an
  outcome. "The reply contains the heading `## Verified`" is the skill's format, and a grader like
  that can only pass when the skill fired, which inflates Δ.
- **Prefer free graders.** `regex` over a produced file, `tool_used`, and `file_exists` are
  deterministic and cost nothing. Use `llm` graders for short outputs, with concrete PASS and FAIL
  conditions.
- **Include the case that should not trigger.** Skills that fire on everything cost context and
  change behavior where nobody asked. `evals/_precision/` holds these.
- **Make the baseline able to pass.** If the model without the skill can't possibly pass, the
  case measures nothing.

## Acceptance bar for skills

A new skill, or a rewrite of an existing one, is merged when:

1. `vet --strict` passes.
2. It has at least two eval cases, one of which checks that it doesn't fire where it shouldn't,
   or it shares the `_precision` cases.
3. A maintainer runs the suite on the current Sonnet and Opus models, and the mean Δ is clearly
   positive (roughly +10 points or more) with no case regressing badly.

If a skill stops showing a positive Δ when models change, it moves to the **Cut** list in the
README. That's not a failure. It means the models caught up.

## Pull requests

- Keep each PR to one skill, one rule, or one fix.
- Add a line to `CHANGELOG.md` under "Unreleased".
- Commit messages: short imperative subject line, with detail in the body if needed.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE)
and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
