# Writing skills for current models

Most skills on GitHub were written for models that needed shouting at. The models changed. These
notes explain the choices behind every skill in this repo, and what `vet` checks for.

## 1. The description is the trigger

At startup, an agent loads only the `name` and `description` of every installed skill. The body
loads later, if the agent decides the description matches the task. So:

- **Lead with what it does**, in the third person: "Separates what was checked from what was
  only written…". The description sits inside the agent's own context, so "I can help you…"
  reads oddly there.
- **Then say when:** "Use when finishing a code change, bug fix, or refactor…". Name the
  situations, file types, and phrases a user would actually say. `vet` warns about descriptions
  with no "when".
- **Stay short.** The spec caps descriptions at 1,024 characters. Claude Code caps the combined
  `description` and `when_to_use` at 1,536 in its listing, and when many skills are installed it
  drops descriptions of the least-used skills to fit a budget. Every installed skill costs
  context on every turn, whether it fires or not.
- **Don't overlap.** Two skills with similar descriptions compete, and the agent may load the
  wrong one. `vet` flags pairs above 50% word overlap.

## 2. Explain why, once

> "NEVER use `shell=True`. NEVER. This is CRITICAL."

versus

> "Pass arguments as a list (`subprocess.run([...])`): with `shell=True`, a filename like
> `; rm -rf ~` becomes a second command."

Current models take instructions literally and weigh emphasis heavily. A rule in capitals gets
applied in places it doesn't belong, for example refusing `shell=True` for a hard-coded command
with no input at all. A rule with its reason gets applied where the reason holds. `vet` flags six
or more all-caps directives in one skill, and heavy all-caps text generally.

Persona lines like "You are a world-class senior engineer" also add little. Describe the task,
the constraints, and what good output looks like.

## 3. Short beats complete

The spec recommends keeping bodies under 5,000 tokens and 500 lines. The skills here run
400–560 tokens. Evidence from [SkillsBench](https://huggingface.co/papers/2602.12670) points the
same way: focused skills beat comprehensive documentation. When a skill does need more,
progressive disclosure is the tool: keep `SKILL.md` to the procedure and put details in
`references/`, linked one level deep, so they only load when needed.

## 4. Say what not to do, and when not to apply it

Every skill here ends with its limits: `root-cause` says when patching the symptom is right, and
`answer-first` says what to keep even though it adds length. Without limits, a model applies a
skill everywhere, and a skill that fires on everything becomes noise.

## 5. Measure it

A skill is a prompt, and whether a prompt helps depends on the model reading it. The only way to
know is to run the same requests with and without it:

- Write prompts the way users phrase requests, without naming the skill.
- Grade outcomes: files produced, lines left alone, claims made. Don't grade the skill's own
  formatting, or you'll measure compliance instead of value.
- Run each case several times. Agents are non-deterministic, and one run tells you little.
- Keep a case where the skill should **not** fire.

`claude plugin eval` does the with/without comparison and reports Δ. See
[CONTRIBUTING.md](../CONTRIBUTING.md#writing-eval-cases) for how cases are laid out here.

## 6. Treat skills as code

A skill runs with your agent's permissions. It can tell the agent to run scripts, fetch URLs,
and read files, and people install skills without reading them. Before installing a skill:

```bash
npx skill-vet vet owner/repo
```

`vet` looks for download-and-execute, hidden Unicode, prompt injection, credential access,
exfiltration endpoints, and persistence. It's a static check that catches the obvious and the
careless. It can't prove a skill is safe, so read the scripts of anything you install.
