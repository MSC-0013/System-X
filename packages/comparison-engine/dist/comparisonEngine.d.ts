/**
 * I5 — Simulation ↔ Real Comparison: Main comparison engine.
 *
 * Takes NormalizedRunResult (from I4) and produces a ComparisonReport.
 * The comparison is between BLACKBOX_SIMULATION source and QUORUM_CLIENT source.
 *
 * IMPORTANT: Pure function — NO I/O performed here.
 * The BLACKBOX-X API is called via HTTP in I6 (calibration loop), not here.
 */
import type { NormalizedRunResult } from '@system-x/result-normalizer';
import type { ComparisonReport, ComparisonCriteria } from './types.js';
/**
 * Generate a full ComparisonReport from a NormalizedRunResult.
 *
 * @param result    The normalized run result (I4 output).
 * @param criteria  Certification thresholds (defaults to DEFAULT_COMPARISON_CRITERIA).
 */
export declare function generateComparisonReport(result: NormalizedRunResult, criteria?: ComparisonCriteria): ComparisonReport;
//# sourceMappingURL=comparisonEngine.d.ts.map