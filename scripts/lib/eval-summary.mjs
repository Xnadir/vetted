// Shared by results-table.mjs (this repo's skills) and vet-external.mjs (the
// registry of third-party skills): turns cases from `claude plugin eval --json`
// output into the compact evidence format, and scores a skill from it.

/** True when a run of the case errored (usage limit, timeout). Its score would be fake. */
export const hasErroredRun = (c) =>
  [...(c.arms?.with ?? []), ...(c.arms?.without ?? [])].some((a) => a.error);

/** Compact evidence for one case: scores per arm, how often the skill loaded, and per-grader tallies. */
export function summarizeCase(c) {
  const loadedRuns = (c.arms?.with ?? []).map((a) => a.graders?.find((g) => g.name === "skill-fired")).filter(Boolean);
  const tally = {};
  for (const arm of ["with", "without"])
    for (const run of c.arms?.[arm] ?? [])
      for (const g of run.graders ?? []) {
        if (g.name === "skill-fired") continue;
        tally[g.name] ??= { with: [0, 0], without: [0, 0] };
        tally[g.name][arm][0] += g.passed ? 1 : 0;
        tally[g.name][arm][1] += 1;
      }
  return {
    runs: c.runsPerCase,
    with: c.aggregates?.score ?? null,
    without: c.aggregates?.scoreWithout ?? null,
    delta: c.aggregates?.delta ?? null,
    loaded: loadedRuns.length ? `${loadedRuns.filter((g) => g.passed).length}/${loadedRuns.length}` : null,
    errors: [...(c.arms?.with ?? []), ...(c.arms?.without ?? [])].filter((a) => a.error).length,
    graders: Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, { with: `${v.with[0]}/${v.with[1]}`, without: `${v.without[0]}/${v.without[1]}` }])),
  };
}

export const mean = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
export const pct = (x) => (x === null ? "–" : `${Math.round(x * 100)}%`);
export const signed = (x) => (x === null ? "–" : `${x > 0.004 ? "+" : ""}${Math.round(x * 100)}`);
/** "claude-sonnet-5-5" → "Sonnet 5.5" */
export const shortModel = (m) => m.replace(/^claude-/, "").replace(/-(\d)-(\d)$/, " $1.$2").replace(/^(\w)/, (c) => c.toUpperCase());
export const HELPS = 0.095; // +10 points, allowing for float error

/** Mean scores over a skill's cases, plus the combined skill-loaded count. */
export function skillStats(cases) {
  if (!cases.length) return null;
  const loaded = cases.map((c) => c.loaded).filter(Boolean);
  const [a, b] = loaded.reduce(([x, y], s) => [x + +s.split("/")[0], y + +s.split("/")[1]], [0, 0]);
  return { cases: cases.length, with: mean(cases.map((c) => c.with)), without: mean(cases.map((c) => c.without)), delta: mean(cases.map((c) => c.delta)), loaded: b ? `${a}/${b}` : "–" };
}

/** stats: [[model, skillStats | null], ...] → the verdict cell. */
export function verdict(stats) {
  const helped = stats.filter(([, s]) => s && s.delta !== null && s.delta >= HELPS).map(([m]) => shortModel(m));
  const hurt = stats.filter(([, s]) => s && s.delta !== null && s.delta <= -0.045).map(([m]) => shortModel(m));
  if (hurt.length && !helped.length) return `❌ hurts on ${hurt.join(", ")}`;
  if (helped.length === stats.length) return "✅ helps";
  if (helped.length) return `✅ helps on ${helped.join(", ")}`;
  return "✂️ no measurable effect";
}
