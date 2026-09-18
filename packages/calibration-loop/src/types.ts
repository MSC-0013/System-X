/**
 * I6 — Calibration Loop: types.
 *
 * Defines the parameter space, calibration request/response shapes,
 * and coordinate-descent state for tuning BLACKBOX-X simulation parameters
 * to match QUORUM LAB real measurements.
 *
 * Sovereignty rule: BLACKBOX-X is called via HTTP REST only.
 * No @blackbox-x/* package imports anywhere in SYSTEM-X.
 */

/** A single named simulation parameter and its current/candidate value. */
export interface SimulationParameter {
  readonly name: string;
  /** Current value. */
  readonly value: number;
  /** Lower bound for optimization. */
  readonly min: number;
  /** Upper bound for optimization. */
  readonly max: number;
  /** Step size for coordinate descent. */
  readonly step: number;
}

/** Calibration request sent to BLACKBOX-X POST /v1/calibration/runs. */
export interface BlackboxCalibrationRequest {
  /** Correlation ID from SYSTEM-X. */
  readonly integrationRunId: string;
  /** Experiment spec hash for reproducibility identity. */
  readonly experimentSpecHash: string;
  /** Parameters to calibrate. */
  readonly parameters: Record<string, number>;
  /** Observed real-system p99 latency in ms (target to match). */
  readonly targetP99Ms: number;
  /** Observed real-system throughput in ops/sec (target to match). */
  readonly targetThroughputOpsSec: number;
}

/** Response from BLACKBOX-X POST /v1/calibration/runs. */
export interface BlackboxCalibrationResponse {
  /** BLACKBOX-X assigned run ID. */
  readonly runId: string;
  /** Final calibrated parameter values. */
  readonly calibratedParameters: Record<string, number>;
  /** Predicted p99 latency with calibrated parameters (ms). */
  readonly predictedP99Ms: number;
  /** Predicted throughput with calibrated parameters (ops/sec). */
  readonly predictedThroughputOpsSec: number;
  /** MAPE of p99 latency after calibration (percent). */
  readonly p99MapePercent: number;
  /** MAPE of throughput after calibration (percent). */
  readonly throughputMapePercent: number;
  /** Whether calibration converged to the thresholds. */
  readonly converged: boolean;
  /** Number of iterations performed. */
  readonly iterations: number;
}

/** Result of one full calibration loop run in SYSTEM-X. */
export interface CalibrationResult {
  readonly integrationRunId: string;
  readonly experimentSpecHash: string;
  readonly blackboxRunId: string;
  readonly calibratedParameters: Record<string, number>;
  readonly converged: boolean;
  readonly iterations: number;
  readonly p99MapePercent: number;
  readonly throughputMapePercent: number;
  readonly predictedP99Ms: number;
  readonly predictedThroughputOpsSec: number;
}

/** Configuration for the SYSTEM-X calibration loop client. */
export interface CalibrationLoopConfig {
  /** BLACKBOX-X base URL. Example: 'http://localhost:3001' */
  readonly blackboxBaseUrl: string;
  /** Maximum wait time per calibration HTTP call (ms). */
  readonly requestTimeoutMs: number;
  /** Maximum retry count on 429/503. */
  readonly maxRetries: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationLoopConfig = {
  blackboxBaseUrl: 'http://localhost:3001',
  requestTimeoutMs: 60_000,
  maxRetries: 3,
};
