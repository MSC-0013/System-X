/**
 * I5 — Simulation ↔ Real Comparison: Statistical tests.
 *
 * Implements:
 *  - Two-sample Kolmogorov-Smirnov (KS) test
 *  - Wasserstein-1 (Earth Mover's Distance)
 *  - Mean Absolute Percentage Error (MAPE)
 *
 * All functions are pure — no I/O, no side effects.
 */
import type { KsTestResult, WassersteinResult, MapeResult } from './types.js';

// ---------------------------------------------------------------------------
// Two-sample KS test
// ---------------------------------------------------------------------------

/**
 * Two-sample Kolmogorov-Smirnov test.
 *
 * @param a     First sample (latencies in ms). Need not be sorted.
 * @param b     Second sample (latencies in ms). Need not be sorted.
 * @param alpha Significance level (default 0.05).
 * @returns     KS statistic D, approximate p-value, and rejection decision.
 */
export function twoSampleKsTest(
  a: number[],
  b: number[],
  alpha: number = 0.05,
): KsTestResult {
  if (a.length === 0 || b.length === 0) {
    return { dStatistic: 0, pValue: 1, rejected: false, alpha };
  }

  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  const n1 = sortedA.length;
  const n2 = sortedB.length;

  // Merge all values and compute ECDFs.
  const allValues = [...new Set([...sortedA, ...sortedB])].sort((x, y) => x - y);

  let maxDiff = 0;
  let ia = 0;
  let ib = 0;

  for (const v of allValues) {
    while (ia < n1 && sortedA[ia]! <= v) ia++;
    while (ib < n2 && sortedB[ib]! <= v) ib++;
    const diff = Math.abs(ia / n1 - ib / n2);
    if (diff > maxDiff) maxDiff = diff;
  }

  // Kolmogorov distribution approximation for p-value.
  const t = maxDiff * Math.sqrt((n1 * n2) / (n1 + n2));
  const pValue = kolmogorovPValue(t);

  return {
    dStatistic: maxDiff,
    pValue,
    rejected: pValue < alpha,
    alpha,
  };
}

/**
 * Approximate p-value from the Kolmogorov distribution using a series expansion.
 * Valid for t > 0.
 */
function kolmogorovPValue(t: number): number {
  if (t <= 0) return 1;
  if (t > 4) return 0;

  // Two-sided KS p-value: P(K > t) = 2 * sum_{k=1}^{inf} (-1)^{k+1} * exp(-2*k^2*t^2)
  let sum = 0;
  for (let k = 1; k <= 100; k++) {
    const term = Math.pow(-1, k + 1) * Math.exp(-2 * k * k * t * t);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
  }
  return Math.max(0, Math.min(1, 2 * sum));
}

// ---------------------------------------------------------------------------
// Wasserstein-1 (Earth Mover's Distance)
// ---------------------------------------------------------------------------

/**
 * Wasserstein-1 distance between two 1D distributions.
 * For sorted arrays: W1 = (1/n) * sum |sorted_a[i] - sorted_b[i]| (equal-size)
 * or integrated absolute difference of ECDFs.
 */
export function wassersteinDistance(a: number[], b: number[]): WassersteinResult {
  if (a.length === 0 || b.length === 0) {
    return { distance: 0 };
  }

  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);

  // Interpolate both to common quantile positions.
  const n = Math.max(sortedA.length, sortedB.length);
  let totalDistance = 0;

  for (let i = 0; i < n; i++) {
    const qa = interpolateQuantile(sortedA, i / (n - 1));
    const qb = interpolateQuantile(sortedB, i / (n - 1));
    totalDistance += Math.abs(qa - qb);
  }

  return { distance: totalDistance / n };
}

function interpolateQuantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (idx - lo) * (sorted[hi]! - sorted[lo]!);
}

// ---------------------------------------------------------------------------
// MAPE
// ---------------------------------------------------------------------------

/**
 * Mean Absolute Percentage Error between actual and predicted values.
 * Avoids division by zero by skipping zeros in actual.
 */
export function computeMape(actual: number, predicted: number): MapeResult {
  if (actual === 0) {
    return { mapePercent: predicted === 0 ? 0 : 100 };
  }
  const mapePercent = (Math.abs(actual - predicted) / Math.abs(actual)) * 100;
  return { mapePercent };
}
