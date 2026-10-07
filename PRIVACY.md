# Privacy

## The `vetted` plugin (the skills in `skills/`)

The plugin is five Markdown instruction files. It has no code, hooks, connectors, or MCP
servers, so it collects, stores, and sends nothing.

- **No personal data** is read or stored by the plugin.
- **No network requests.** No skill contacts any service.
- **Nothing is retained.** There is no backend.
- **Files written:** the `handoff` skill asks the agent to write `HANDOFF.md` in your own
  project, and tells it to leave out secrets and personal data. That file stays on your machine.

What the agent does while following a skill is governed by the agent you use (for example,
Claude Code) and its own privacy terms.

## The `skill-vet` scanner (`cli/`, npm `@menadirali/skill-vet`)

`skill-vet` runs locally and has no telemetry.

- It reads the `SKILL.md` files and the files beside them in the folders you point it at.
- With `--installed`, it reads the skill folders your agents use (for example
  `~/.claude/skills`) and Claude Code's installed-plugins list.
- When you name a GitHub repository (`skill-vet vet owner/repo`), it runs `git clone` of that
  public repo into a temporary folder and deletes it afterwards. That is its only network access.
- Its security rules look for text such as `~/.ssh` or `~/.aws/credentials` inside skills, so
  it can warn you. It never opens those files.

## GitHub Actions in this repository

The `Evals` workflow uses a repository secret (`ANTHROPIC_API_KEY`) on GitHub's servers to run
the eval suite for maintainers. It isn't part of the plugin and never runs on a user's machine.

## Contact

Questions: open an issue at <https://github.com/Xnadir/vetted/issues>, or report
privately through [security advisories](https://github.com/Xnadir/vetted/security/advisories/new).
