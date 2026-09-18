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
 * @param normalizedResult   Full NormalizedRunResult from I4 (raw samples for distribution).
 * @param currentParameters  Current simulation parameters to calibrate from.
 * @param config             BLACKBOX-X connection config.
 */
export async function runCalibrationCycle(
  integrationRunId: string,
  experimentSpecHash: string,
  normalizedResult: NormalizedRunResult,
  currentParameters: SimulationParameter[],
  config: CalibrationLoopConfig = DEFAULT_CALIBRATION_CONFIG,
): Promise<CalibrationResult> {
  const paramMap: Record<string, number> = {};
  for (const p of currentParameters) {
    paramMap[p.name] = p.value;
  }

  const request = buildCalibrationRequest(
    integrationRunId,
    experimentSpecHash,
    paramMap,
    normalizedResult,
  );

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

// ---------------------------------------------------------------------------
// Internal: build the enriched calibration request from raw samples
// ---------------------------------------------------------------------------

function buildCalibrationRequest(
  integrationRunId: string,
  experimentSpecHash: string,
  parameters: Record<string, number>,
  result: NormalizedRunResult,
): BlackboxCalibrationRequest {
  // Extract QUORUM_CLIENT samples for the empirical distribution.
  const realSamples = result.samples.filter((s) => s.source === 'QUORUM_CLIENT');
  const realSummary = result.summaries.find((s) => s.source === 'QUORUM_CLIENT');

  const latencies = realSamples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const n = latencies.length;

  // Build empirical CDF histogram from sorted latencies.
  // We emit ~20 representative percentile buckets for shape fidelity.
  const cdfBuckets = buildEmpiricalCdf(latencies);

  // Quantile extraction.
  const p = (pct: number) => latencies[Math.max(0, Math.ceil((pct / 100) * n) - 1)] ?? 0;

  const successCount = realSamples.filter((s) => s.success).length;
  const staleReadCount = realSamples.filter((s) => s.staleRead).length;
  const errorRate = n > 0 ? (n - successCount) / n : 0;
  const staleReadRate = n > 0 ? staleReadCount / n : undefined;

  // SLO breaches: operations where p99Ms is exceeded.
  const p99Ms = p(99);
  const sloBreachCount = latencies.filter((l) => l > p99Ms).length;

  return {
    integrationRunId,
    experimentSpecHash,
    parameters,
    empiricalLatencyQuantiles: {
      p50Ms: p(50),
      p75Ms: p(75),
      p90Ms: p(90),
      p95Ms: p(95),
      p99Ms,
      p999Ms: p(99.9),
      minMs: latencies[0] ?? 0,
      maxMs: latencies[n - 1] ?? 0,
      meanMs: n > 0 ? latencies.reduce((s, v) => s + v, 0) / n : 0,
    },
    empiricalCdfBuckets: cdfBuckets,
    targetThroughputOpsSec: realSummary?.throughputOpsSec ?? 0,
    errorRate,
    ...(staleReadRate !== undefined ? { staleReadRate } : {}),
    sloBreachCount,
    totalOperations: n,
  };
}

/**
 * Build an empirical CDF from a sorted latency array.
 * Emits at most 20 buckets at key percentile boundaries.
 * Each bucket: [latencyMs, cumulativeFraction].
 */
function buildEmpiricalCdf(
  sorted: number[],
): ReadonlyArray<readonly [number, number]> {
  if (sorted.length === 0) return [];

  const percentiles = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 99.9, 100];
  const buckets: Array<readonly [number, number]> = [];
  const n = sorted.length;

  for (const pct of percentiles) {
    const idx = Math.max(0, Math.ceil((pct / 100) * n) - 1);
    const latencyMs = sorted[idx] ?? 0;
    const fraction = pct / 100;
    // Deduplicate: skip if same latency as previous bucket.
    const prev = buckets[buckets.length - 1];
    if (!prev || latencyMs !== prev[0]) {
      buckets.push([latencyMs, fraction] as const);
    }
  }

  return buckets;
}
