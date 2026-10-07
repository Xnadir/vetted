---
type: llm
weight: 1
focus:
  source: file
  path: 'src/stats.js'
---

PASS if mean and variance still compute the arithmetic mean and the population variance (divide by n) and are still exported, using const/let instead of var.
FAIL if the behavior changed (for example sample variance with n - 1) or an export is missing.
