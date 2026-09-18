/**
 * I6 — Calibration Loop: Main orchestrator.
 *
 * Runs the calibration loop:
 *  1. Extract observed real metrics from ComparisonReport (I5 output).
 *  2. Send calibration request to BLACKBOX-X POST /v1/calibration/runs.
 *  3. Return CalibrationResult with updated parameters.
 *
 * The coordinate-descent optimization itself runs inside BLACKBOX-X.
 * SYSTEM-X's role is to: pass the real-system targets → receive calibrated params.
 * Sovereignty rule: no @blackbox-x/* imports.
 */
import type { ComparisonReport } from '@system-x/comparison-engine';
import type {
  BlackboxCalibrationRequest,
  CalibrationLoopConfig,
  CalibrationResult,
  SimulationParameter,
} from './types.js';
import { DEFAULT_CALIBRATION_CONFIG } from './types.js';
import { requestBlackboxCalibration } from './blackboxClient.js';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run a calibration cycle against BLACKBOX-X.
 *
 * @param integrationRunId   Correlation ID.
 * @param experimentSpecHash Reproducibility identity hash.
 * @param comparison         ComparisonReport from I5 (contains real-system metrics).
 * @param currentParameters  Current simulation parameters to calibrate from.
 * @param config             BLACKBOX-X connection config.
 */
export async function runCalibrationCycle(
  integrationRunId: string,
  experimentSpecHash: string,
  comparison: ComparisonReport,
  currentParameters: SimulationParameter[],
  config: CalibrationLoopConfig = DEFAULT_CALIBRATION_CONFIG,
): Promise<CalibrationResult> {
  const paramMap: Record<string, number> = {};
  for (const p of currentParameters) {
    paramMap[p.name] = p.value;
  }

  const request: BlackboxCalibrationRequest = {
    integrationRunId,
    experimentSpecHash,
    parameters: paramMap,
    targetP99Ms: comparison.real.p99Ms,
    targetThroughputOpsSec: comparison.real.throughputOpsSec,
  };

  const response = await requestBlackboxCalibration(request, config);

  return {
    integrationRunId,
    experimentSpecHash,
    blackboxRunId: response.runId,
    calibratedParameters: response.calibratedParameters,
    converged: response.converged,
    iterations: response.iterations,
    p99MapePercent: response.p99MapePercent,
    throughputMapePercent: response.throughputMapePercent,
    predictedP99Ms: response.predictedP99Ms,
    predictedThroughputOpsSec: response.predictedThroughputOpsSec,
  };
}
