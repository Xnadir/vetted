---
type: llm
weight: 2
focus:
  source: file
  path: 'HANDOFF.md'
arm: both
---

PASS if the handoff makes clear that the task is complete and verified, with no
remaining work. It must not turn completed testing, committing, pushing, merging,
review, or release into a pending action, or introduce a new required improvement.
A next-steps section saying there is nothing left to do is acceptable; a heading
alone is not evidence of invented work.

FAIL if it leaves the task incomplete or unverified, invents an outstanding
obligation, or directs the next session to perform work that is already done.
Do not require specific headings or phrasing.
