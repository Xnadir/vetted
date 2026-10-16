#!/usr/bin/env bash
# Seeds the workspace for this case. Runs only with --scaffold.
set -euo pipefail
mkdir -p src
cat > src/stats.js <<'FIXTURE_EOF'
function mean(xs) {
  var sum = 0;
  for (var i = 0; i < xs.length; i++) sum += xs[i];
  return sum / xs.length;
}
function variance(xs) {
  var m = mean(xs);
  var s = 0;
  for (var i = 0; i < xs.length; i++) s += (xs[i] - m) * (xs[i] - m);
  return s / xs.length;
}
module.exports = { mean, variance };
FIXTURE_EOF
mkdir -p test
cat > test/stats.test.js <<'FIXTURE_EOF'
const assert = require("node:assert");
const { mean, variance } = require("../src/stats");
assert.strictEqual(mean([1, 2, 3]), 2);
assert.strictEqual(variance([1, 2, 3, 4]), 1.25);
console.log("ok");
FIXTURE_EOF
