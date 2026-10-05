# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `vet` rule `sec/chmod-777` (warn): flags world-writable `chmod 777` commands,
  including recursive variants, in skill bodies and scripts. Thanks @xyi74976-del (#22).
- `vet` rule `spec/license-missing` (info): reports absent or empty license declarations without
  failing a scan, including in strict mode. Thanks @xyi74976-del (#23).

### Changed

- CI runs unit tests on Node 18, 20, and 22 across Ubuntu, macOS, and Windows.
  Thanks @xyi74976-del (#31).

## [0.1.3] - 2026-10-04

### Added

- Urdu translation of the README (`README.ur.md`), linked from the top of `README.md`.
  Thanks @HarisShahnawaz.

### Fixed

- The vet command keeps nested SKILL.md resources inside their parent skill while continuing to
  scan them for security findings. A nested SKILL.md that has its own frontmatter is still checked
  as a sub-skill. Thanks @PandaHUN777 (#43).
- Security rules no longer report errors for Markdown lines that warn *against* the behavior: lines
  marked as bad examples (❌, 🚫, "Avoid:"), "even in `--yolo` mode, …" clauses, and matches
  governed by a prohibition ("Never run …"). These are reported as info. "Don't hesitate to …" and
  plain instructions stay errors. Found scanning microsoft/skills (#34).

## [0.1.2] - 2026-10-01

### Added

- First eval results, on Sonnet 5.5 and Haiku 4.5 (19 cases × 3 runs per arm, with and without
  the skills), in the README, with compact per-case evidence in `evals/published/`.
- `scripts/results-table.mjs` merges result files per model, shows how often each skill loaded,
  leaves out runs that errored (usage limits, expired logins), and saves evidence with `--save`.
- `skill-vet vet --installed` discovers Windsurf/Cascade, Kiro, Cline, and Amp skill directories; shared `.agents/skills` already covers Zed.
- `vet` rule `sec/sudo` (warn): flags `sudo` in skill bodies and scripts, since a skill that
  escalates privileges deserves a second look. Words that only contain it (`pseudo`, `sudoku`,
  `sudoers`) are not flagged.

### Removed

- Retired four skills that showed no measurable benefit on either model: `surgical`,
  `stdlib-first`, `answer-first`, and `secure-defaults`. They moved to `retired/` with their
  evals, so the plugin no longer loads them. Current models already behave this way without them.

### Fixed

- `handoff/csv-import-midway` grader `concrete-next-step` required the first next step to name a
  function to change, which failed the correct answer "re-run the tests first". It now accepts a
  specific command, file, or function. Found in the first Sonnet run (a spurious −13); re-run after the fix.

## [0.1.1] - 2026-09-30

### Added

- `skill-vet rules` now prints a header row (`RULE`, `SEVERITY`, `DESCRIPTION`), and
  `skill-vet rules --format json` prints the rules as JSON objects with `id`, `severity`, and
  `description`, for use in tooling.
- `vet` flag `--quiet` (`-q`): prints only findings, with no summary line or cost
  table, for cleaner use in scripts and CI logs.
- `vet` rule `sec/suspicious-install` (warn): flags `npm install`, `pip install`, and `cargo add`
  commands that name a package within edit distance 1–2 of a popular package (`requests`,
  `lodash`, `react`, etc.) but aren't that package. Uses no network and no new dependencies.
  Strips flags, version specifiers, and extras before comparing; stops at shell operators;
  allows known close neighbors (`preact`, `scapy`, `tslint`, `request`, `pandoc`, …).
  Popular names of four characters or fewer are not checked.

### Changed

- npm package renamed to `@menadirali/skill-vet` (the name `vetted` is taken on npm, and `skill-vet` is too close to an existing package). The command is still `skill-vet`.

### Fixed

- The README and two source comments still called the command `vetted`; they now say
  `skill-vet`. `--help` now lists the `-q` short form of `--quiet`. (Spotted by @Mevayaan1 in #35.)
- `sec/suspicious-install` no longer reads past the closing backtick of inline code, which flagged
  `pytest` as a typosquat of itself in lists like `` `npm test`, `pytest` ``.
- Fenced code blocks indented under a list item are now treated as code, so example links inside
  them no longer raise `spec/broken-reference`.

## [0.1.0] - 2026-09-29

### Added

- Nine skills rebuilt for current models: `prove-it`, `surgical`, `root-cause`,
  `bug-hunt-review`, `stdlib-first`, `grill`, `handoff`, `answer-first`, and
  `secure-defaults` (on probation).
- Eval suites for every skill in `claude plugin eval` format (18 cases,
  including trigger-precision cases).
- `vet`, a zero-dependency scanner with 37 rules across spec, trigger, style,
  cost, and security; text, JSON, Markdown, and GitHub annotation output;
  scanning of local paths, GitHub repos, and installed skills.
- GitHub Action (`uses: nadirali1350/vetted@v0`).
- Claude Code plugin and marketplace, plus Codex and Cursor plugin manifests.
