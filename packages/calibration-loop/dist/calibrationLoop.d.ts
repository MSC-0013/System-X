/**
 * I6 — Calibration Loop: Main orchestrator.
 *
 * Runs the calibration loop:
 *  1. Extract the full empirical distribution from NormalizedRunResult (I4).
 *  2. Build a rich BlackboxCalibrationRequest with quantiles + CDF histogram.
 *  3. Send to BLACKBOX-X POST /v1/calibration/runs.
 *  4. Return CalibrationResult with calibrated parameters.
 *
 * The coordinate-descent optimization itself runs inside BLACKBOX-X.
 * SYSTEM-X passes distribution shape (not just scalar p99 + throughput) so
 * BLACKBOX can run KS + MAPE + breach-penalty objective on real shape data.
 *
 * Sovereignty rule: no @blackbox-x/* imports.
 */
import type { NormalizedRunResult } from '@system-x/result-normalizer';
import type { CalibrationLoopConfig, CalibrationResult, SimulationParameter } from './types.js';
/**
 * Run a calibration cycle against BLACKBOX-X.
 *
 * @param integrationRunId   Correlation ID.
 * @param experimentSpecHash Reproducibility identity hash.
 * @param normalizedResult   Full NormalizedRunResult from I4 (raw samples for distribution).
 * @param currentParameters  Current simulation parameters to calibrate from.
 * @param config             BLACKBOX-X connection config.
 */
export declare function runCalibrationCycle(integrationRunId: string, experimentSpecHash: string, normalizedResult: NormalizedRunResult, currentParameters: SimulationParameter[], config?: CalibrationLoopConfig): Promise<CalibrationResult>;
//# sourceMappingURL=calibrationLoop.d.ts.map