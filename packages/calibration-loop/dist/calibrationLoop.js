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
export async function runCalibrationCycle(integrationRunId, experimentSpecHash, normalizedResult, currentParameters, config = DEFAULT_CALIBRATION_CONFIG) {
    const paramMap = {};
    for (const p of currentParameters) {
        paramMap[p.name] = p.value;
    }
    // 1. Partition the QUORUM_CLIENT samples deterministically
    const allRealSamples = normalizedResult.samples
        .filter((s) => s.source === 'QUORUM_CLIENT')
        .slice()
        .sort((a, b) => (a.operationId < b.operationId ? -1 : 1));
    const n = allRealSamples.length;
    const splitIdx = Math.max(1, Math.floor(n * config.calibrationFraction));
    const calSamples = allRealSamples.slice(0, splitIdx);
    const valSamples = allRealSamples.slice(splitIdx);
    // 2. Build calibration request containing ONLY calibration partition (zero leakage)
    const realSummary = normalizedResult.summaries.find((s) => s.source === 'QUORUM_CLIENT');
    const request = buildCalibrationRequest(integrationRunId, experimentSpecHash, paramMap, calSamples, realSummary);
    // 3. Send ONLY calibration data to BLACKBOX-X optimizer
    const response = await requestBlackboxCalibration(request, config);
    // 4. SYSTEM-X evaluates calibrated parameters on the held-out validation partition
    const valLatencies = valSamples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const valP99Ms = valLatencies.length > 0
        ? valLatencies[Math.max(0, Math.ceil(0.99 * valLatencies.length) - 1)] ?? 0
        : 0;
    const diff = Math.abs(valP99Ms - response.predictedP99Ms);
    const validationP99MapePercent = valP99Ms > 0 ? (diff / valP99Ms) * 100 : 0;
    const validated = validationP99MapePercent <= 20.0;
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
        validationReport: {
            sampleCount: valSamples.length,
            validationP99Ms: valP99Ms,
            predictedP99Ms: response.predictedP99Ms,
            validationP99MapePercent,
            validated,
        },
    };
}
// ---------------------------------------------------------------------------
// Internal: build calibration request from calibration partition ONLY
// ---------------------------------------------------------------------------
function buildCalibrationRequest(integrationRunId, experimentSpecHash, parameters, calSamples, realSummary) {
    const calLatencies = calSamples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const nc = calLatencies.length;
    const p = (arr, pct) => arr[Math.max(0, Math.ceil((pct / 100) * arr.length) - 1)] ?? 0;
    const successCount = calSamples.filter((s) => s.success).length;
    const staleReadCount = calSamples.filter((s) => s.staleRead).length;
    const errorRate = nc > 0 ? (nc - successCount) / nc : 0;
    const staleReadRate = nc > 0 ? staleReadCount / nc : undefined;
    const p99Ms = p(calLatencies, 99);
    const sloBreachCount = calLatencies.filter((l) => l > p99Ms).length;
    return {
        integrationRunId,
        experimentSpecHash,
        parameters,
        empiricalLatencyQuantiles: {
            p50Ms: p(calLatencies, 50),
            p75Ms: p(calLatencies, 75),
            p90Ms: p(calLatencies, 90),
            p95Ms: p(calLatencies, 95),
            p99Ms,
            p999Ms: p(calLatencies, 99.9),
            minMs: calLatencies[0] ?? 0,
            maxMs: calLatencies[nc - 1] ?? 0,
            meanMs: nc > 0 ? calLatencies.reduce((s, v) => s + v, 0) / nc : 0,
        },
        empiricalCdfBuckets: buildEmpiricalCdf(calLatencies),
        targetThroughputOpsSec: realSummary?.throughputOpsSec ?? 0,
        errorRate,
        ...(staleReadRate !== undefined ? { staleReadRate } : {}),
        sloBreachCount,
        totalOperations: nc,
    };
}
/**
 * Build an empirical CDF from a sorted latency array.
 * Emits at most 20 buckets at key percentile boundaries.
 * Each bucket: [latencyMs, cumulativeFraction].
 */
function buildEmpiricalCdf(sorted) {
    if (sorted.length === 0)
        return [];
    const percentiles = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 99.9, 100];
    const buckets = [];
    const n = sorted.length;
    for (const pct of percentiles) {
        const idx = Math.max(0, Math.ceil((pct / 100) * n) - 1);
        const latencyMs = sorted[idx] ?? 0;
        const fraction = pct / 100;
        // Deduplicate: skip if same latency as previous bucket.
        const prev = buckets[buckets.length - 1];
        if (!prev || latencyMs !== prev[0]) {
            buckets.push([latencyMs, fraction]);
        }
    }
    return buckets;
}
//# sourceMappingURL=calibrationLoop.js.map