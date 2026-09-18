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

/** Calibration request sent to BLACKBOX-X POST /v1/calibration/runs.
 *
 * Carries the full empirical distribution shape from QUORUM LAB, not just
 * summary statistics. This feeds BLACKBOX-X's multi-objective calibration
 * function (D_KS + MAPE + p99 error + breach penalty) with the same
 * distribution-level signal it uses internally in M6.
 */
export interface BlackboxCalibrationRequest {
  /** Correlation ID from SYSTEM-X. */
  readonly integrationRunId: string;
  /** Experiment spec hash for reproducibility identity. */
  readonly experimentSpecHash: string;
  /** Parameters to calibrate. */
  readonly parameters: Record<string, number>;

  // ---------------------------------------------------------------------------
  // Empirical distribution — richer than scalars alone.
  // BLACKBOX uses KS + MAPE + p99 error + breach penalty, so it needs shape.
  // ---------------------------------------------------------------------------

  /** Latency percentiles from QUORUM LAB (ms). */
  readonly empiricalLatencyQuantiles: {
    readonly p50Ms: number;
    readonly p75Ms: number;
    readonly p90Ms: number;
    readonly p95Ms: number;
    readonly p99Ms: number;
    readonly p999Ms: number;
    readonly minMs: number;
    readonly maxMs: number;
    readonly meanMs: number;
  };

  /**
   * Empirical CDF histogram — bucket boundary (ms) → cumulative fraction [0,1].
   * Gives BLACKBOX the distribution shape for KS-test fitting.
   * Example: [[1,0.01],[5,0.10],[10,0.50],[20,0.90],[50,0.99],[100,1.0]]
   */
  readonly empiricalCdfBuckets: ReadonlyArray<readonly [number, number]>;

  /** Observed real-system throughput in ops/sec. */
  readonly targetThroughputOpsSec: number;

  /** Operation error rate [0,1]. */
  readonly errorRate: number;

  /** Stale read rate [0,1] (relevant for eventual/causal consistency modes). */
  readonly staleReadRate?: number;

  /** Number of SLO breaches (operations exceeding targetP99Ms). */
  readonly sloBreachCount: number;

  /** Total operation count in the calibration partition. */
  readonly totalOperations: number;

  // ---------------------------------------------------------------------------
  // Held-out validation partition — prevents calibration overfitting.
  //
  // SYSTEM-X splits the QUORUM_CLIENT sample set:
  //   [0, calibrationFraction) → calibration partition (sent as empiricalCdfBuckets)
  //   [calibrationFraction, 1] → validation partition (sent as validationCdfBuckets)
  //
  // BLACKBOX-X MUST evaluate its calibrated model on validationCdfBuckets,
  // not on the same data it calibrated against. This mirrors M6's held-out
  // validation step and prevents apparent convergence on overfit statistics.
  // ---------------------------------------------------------------------------

  /**
   * Held-out validation partition CDF — bucket boundary (ms) → cumulative fraction.
   * Must be derived from a DIFFERENT sample set than empiricalCdfBuckets.
   */
  readonly validationCdfBuckets: ReadonlyArray<readonly [number, number]>;

  /** Number of samples in the calibration partition. */
  readonly calibrationSampleCount: number;

  /** Number of samples in the held-out validation partition. */
  readonly validationSampleCount: number;
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
  /**
   * Fraction of QUORUM_CLIENT samples used for calibration [0,1].
   * The remainder forms the held-out validation partition.
   * Must be in range (0, 1). Default: 0.7 (70% calibration, 30% validation).
   *
   * IMPORTANT: If totalSamples < 10 the split is still applied but both
   * partitions may be very small. Minimum recommended sample count: 50.
   */
  readonly calibrationFraction: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationLoopConfig = {
  blackboxBaseUrl: 'http://localhost:3001',
  requestTimeoutMs: 60_000,
  maxRetries: 3,
  calibrationFraction: 0.7,
};
