// One definition of "within budget", for the run that measures and for the
// candidate that judges.
//
// There were two. `report-bundle-size.mjs` compared the numbers against the
// budgets it had just written down; the release candidate looked at whether the
// file existed. `performance.mjs` compared three values against the baseline;
// the candidate compared two and left the frame statistics out of the verdict
// entirely. Since both reports are written before their own check runs — on
// purpose, a failed measurement is still a measurement — a run that failed left
// a file behind that the candidate read as a pass.
//
// This module imports nothing so it can run directly under node:test.

/** How much worse than the baseline is still the same app on a busier phone. */
export const PERFORMANCE_MARGIN = { coldStartMs: 1.35, jankyPercent: 1.6, memoryMb: 1.30 };

export function bundleSizeVerdict(report) {
  if (!report || typeof report.jsBytes !== 'number' || typeof report.totalBytes !== 'number') {
    return { status: 'MISSING', reasons: ['no size report'] };
  }
  const budgets = report.budgets ?? {};
  const reasons = [];
  if (typeof budgets.maxJsBytes !== 'number' || typeof budgets.maxTotalBytes !== 'number') {
    return { status: 'MISSING', reasons: ['the report carries no budgets to compare against'] };
  }
  if (report.jsBytes > budgets.maxJsBytes) reasons.push(`JS/Hermes ${mib(report.jsBytes)} MiB over the ${mib(budgets.maxJsBytes)} MiB budget`);
  if (report.totalBytes > budgets.maxTotalBytes) reasons.push(`export ${mib(report.totalBytes)} MiB over the ${mib(budgets.maxTotalBytes)} MiB budget`);
  return { status: reasons.length ? 'FAIL' : 'PASS', reasons };
}

export function performanceVerdict(measurement, baseline, margin = PERFORMANCE_MARGIN) {
  if (!measurement || !baseline) return { status: 'MISSING', reasons: ['no measurement or no baseline'] };
  const reasons = [];
  for (const [key, unit] of [['coldStartMs', ' ms'], ['jankyPercent', '%'], ['memoryMb', ' MB']]) {
    const before = baseline[key];
    const now = measurement[key];
    // A value the run could not read is not a pass: -1 is what the parsers
    // write when the phone answered with something unexpected.
    if (typeof before !== 'number' || typeof now !== 'number' || now < 0) {
      reasons.push(`${key} was not measured`);
      continue;
    }
    if (now > before * margin[key]) {
      reasons.push(`${key}: ${before}${unit} → ${now}${unit} (more than ${Math.round((margin[key] - 1) * 100)}% worse)`);
    }
  }
  return { status: reasons.length ? 'FAIL' : 'PASS', reasons };
}

function mib(bytes) {
  return (bytes / 1048576).toFixed(2);
}
