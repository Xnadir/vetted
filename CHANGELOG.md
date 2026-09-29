# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- npm package renamed to `skill-vet` (the name `vetted` is taken on npm).

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
