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
/**
 * Two-sample Kolmogorov-Smirnov test.
 *
 * @param a     First sample (latencies in ms). Need not be sorted.
 * @param b     Second sample (latencies in ms). Need not be sorted.
 * @param alpha Significance level (default 0.05).
 * @returns     KS statistic D, approximate p-value, and rejection decision.
 */
export declare function twoSampleKsTest(a: number[], b: number[], alpha?: number): KsTestResult;
/**
 * Wasserstein-1 distance between two 1D distributions.
 * For sorted arrays: W1 = (1/n) * sum |sorted_a[i] - sorted_b[i]| (equal-size)
 * or integrated absolute difference of ECDFs.
 */
export declare function wassersteinDistance(a: number[], b: number[]): WassersteinResult;
/**
 * Mean Absolute Percentage Error between actual and predicted values.
 * Avoids division by zero by skipping zeros in actual.
 */
export declare function computeMape(actual: number, predicted: number): MapeResult;
//# sourceMappingURL=statistics.d.ts.map