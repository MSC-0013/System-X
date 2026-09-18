/**
 * I4 — Result Normalizer: Statistics computation.
 *
 * Computes latency percentiles and throughput from a sorted sample array.
 */

/**
 * Computes the p-th percentile of a pre-sorted array (ascending).
 * Uses nearest-rank method.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0]!;
  if (p >= 100) return sorted[sorted.length - 1]!;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[rank - 1]!;
}

/**
 * Computes throughput in ops/sec given a list of Unix millisecond timestamps.
 * Uses the wall-clock span from first to last sample.
 */
export function computeThroughput(timestampsMs: number[]): number {
  if (timestampsMs.length < 2) return 0;
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  const spanMs = sorted[sorted.length - 1]! - sorted[0]!;
  if (spanMs <= 0) return 0;
  return (timestampsMs.length / spanMs) * 1000;
}

/**
 * Returns arithmetic mean or 0 if empty.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
