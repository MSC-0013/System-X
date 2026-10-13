/**
 * I4 — Result Normalizer: Statistics computation.
 *
 * Computes latency percentiles and throughput from a sorted sample array.
 */
/**
 * Computes the p-th percentile of a pre-sorted array (ascending).
 * Uses nearest-rank method.
 */
export declare function percentile(sorted: number[], p: number): number;
/**
 * Computes throughput in ops/sec given a list of Unix millisecond timestamps.
 * Uses the wall-clock span from first to last sample.
 */
export declare function computeThroughput(timestampsMs: number[]): number;
/**
 * Returns arithmetic mean or 0 if empty.
 */
export declare function mean(values: number[]): number;
//# sourceMappingURL=statistics.d.ts.map