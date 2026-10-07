---
type: llm
focus:
  source: file
  path: 'HANDOFF.md'
arm: both
---

PASS if the handoff preserves the completed tokenizer change, the regression tests,
the constraint against new runtime dependencies, and the fact that both test
commands passed after the last code change. It should preserve the clean working
tree and merged PR state accurately, and identify the regex-only approach as a
discarded attempt rather than unfinished work.

FAIL if it contradicts those facts, reports earlier verification as missing, or
treats the discarded approach as current code. Exact counts, commit hashes, and
section titles are not required.
