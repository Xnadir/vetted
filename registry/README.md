# Registry: other people's skills, tested

Skills from other repositories, put through the same test as vetted's own skills: identical tasks run
with and without the skill on current models, and the difference is what the skill adds. The registry
stores a **pointer** to each skill (repository and pinned commit), never a copy, plus the test cases
and results.

## Results

<!-- registry:start -->
| Skill | Sonnet 5.5<br/>with → without (Δ) | Haiku 4.5<br/>with → without (Δ) | Skill loaded | Verdict | Vetted by |
| --- | ---: | ---: | ---: | --- | --- |
| [`verification-before-completion`](https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/verification-before-completion) · obra/superpowers | 100% → 100% (**0**) | 50% → 50% (**0**) | 4/6 · 0/3 | ✂️ no measurable effect | [@Xnadir](https://github.com/Xnadir) |
<!-- registry:end -->

Δ is the score with the skill minus the score without it, in points. "Skill loaded" is how often the
model chose to load the skill when it was available. A skill **helps** when it gains at least 10
points on a model, and **hurts** when it loses 5 or more and helps on no model.

**A result is evidence about these cases, not a grade for the skill.** A skill can do well at things
these cases don't test. Authors are welcome to propose cases, and results are re-run when skills change.

The `obra/superpowers` entry uses the same two cases as vetted's own
[`prove-it`](../skills/prove-it/SKILL.md), which has the same goal, so the two rows compare directly.

## Test a skill

You need Claude Code (logged in; the Pro plan or higher), Node 18 or later, and git. A run of two cases
costs well under a dollar of usage on Sonnet, and each result file records what it cost.

1. **Pick a skill.** Claim an open issue labeled
   [`registry`](https://github.com/Xnadir/vetted/labels/registry), or propose a skill in a new issue.
2. **Point to it.** Create `registry/<owner>/<repo>/<skill>/source.json`:

   ```json
   {
     "repo": "https://github.com/<owner>/<repo>",
     "ref": "<full 40-character commit SHA>",
     "path": "<folder that contains SKILL.md>",
     "license": "<SPDX id, e.g. MIT>"
   }
   ```

   Get the current commit with `git ls-remote https://github.com/<owner>/<repo> HEAD`.
3. **Write at least two eval cases** in `evals/<case-name>/`, following
   [Writing eval cases](../CONTRIBUTING.md#writing-eval-cases). Test what the skill says it does, phrase
   prompts the way a real user would, and include a `skill-fired` grader that matches the skill's name.
   Copy a case from the `obra/superpowers` entry to start. Cases that grant `Bash` need WSL2 on Windows.
4. **Run it:**

   ```bash
   node scripts/vet-external.mjs registry/<owner>/<repo>/<skill> --by <your-github-username>
   ```

   Add `--model claude-haiku-4-5` for a second model. The script fetches the skill at the pinned commit,
   scans it with skill-vet, runs the cases, saves `results/<date>-<model>-<you>.json`, and updates the
   table above.
5. **Open a pull request** with `source.json`, `evals/`, `results/`, and the updated table.

Your GitHub name goes in the "Vetted by" column and in the release notes.

### Rules

- **Pin a commit, and don't copy the skill into this repo.** The script fetches it when it runs.
- **Commit the result file as the script wrote it.** A maintainer re-runs at least one case before merging.
- **Keep the wording neutral:** "no measurable effect in these cases", never "this skill is bad".
- **Tell the author.** Link your pull request in an issue or discussion on the skill's repository, so they
  can respond or suggest better cases.
- **Safety:** the script refuses to run a skill that skill-vet flags with a security error, and it loads the
  skill on its own, without hooks, MCP servers, or other skills from its repository.
