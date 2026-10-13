/**
 * I5 — Simulation ↔ Real Comparison: types.
 */
/** KS-test result. */
export interface KsTestResult {
    /** Two-sample KS statistic D (max CDF deviation). */
    readonly dStatistic: number;
    /** Approximate p-value (two-sided). */
    readonly pValue: number;
    /** Null hypothesis (distributions are the same) rejected at alpha. */
    readonly rejected: boolean;
    /** Alpha level used for the hypothesis test. */
    readonly alpha: number;
}
/** Earth Mover's Distance (Wasserstein-1) result. */
export interface WassersteinResult {
    /** Wasserstein-1 distance in the latency unit (ms). */
    readonly distance: number;
}
/** MAPE (Mean Absolute Percentage Error) result. */
export interface MapeResult {
    /** MAPE in percent [0, 100]. */
    readonly mapePercent: number;
}
/** Full comparison report between simulation and real. */
export interface ComparisonReport {
    readonly experimentSpecHash: string;
    readonly integrationRunId: string;
    /** Latency distribution comparison (p99 arrays). */
    readonly latencyKs: KsTestResult;
    readonly latencyWasserstein: WassersteinResult;
    /** Throughput comparison. */
    readonly throughputMape: MapeResult;
    /** p99 latency comparison. */
    readonly p99LatencyMape: MapeResult;
    /** Raw values used for the comparison. */
    readonly simulation: {
        readonly sampleCount: number;
        readonly p50Ms: number;
        readonly p95Ms: number;
        readonly p99Ms: number;
        readonly throughputOpsSec: number;
        readonly successRate: number;
    };
    readonly real: {
        readonly sampleCount: number;
        readonly p50Ms: number;
        readonly p95Ms: number;
        readonly p99Ms: number;
        readonly throughputOpsSec: number;
        readonly successRate: number;
    };
    /** Whether the comparison passes certification criteria. */
    readonly certified: boolean;
    /** Summary of why certified or not. */
    readonly verdict: string;
}
/** Thresholds for passing comparison certification. */
export interface ComparisonCriteria {
    /** KS test alpha level. */
    readonly ksAlpha: number;
    /** Maximum KS D-statistic (engineering bound, independent of sample size). */
    readonly maxKsDStatistic: number;
    /** Maximum p99 MAPE in percent. */
    readonly maxP99MapePercent: number;
    /** Maximum throughput MAPE in percent. */
    readonly maxThroughputMapePercent: number;
}
export declare const DEFAULT_COMPARISON_CRITERIA: ComparisonCriteria;
//# sourceMappingURL=types.d.ts.map