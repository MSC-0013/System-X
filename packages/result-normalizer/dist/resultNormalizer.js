import { classifyBlackboxError, classifyQuorumError } from './errorTaxonomy.js';
import { percentile, computeThroughput, mean } from './statistics.js';
// ---------------------------------------------------------------------------
// Ingestion: BLACKBOX-X samples
// ---------------------------------------------------------------------------
/**
 * Normalize a batch of BLACKBOX-X simulation samples.
 * simulationTimeUs is treated as the timestamp (converted to ms).
 * latencyUs is converted to ms.
 */
export function normalizeBlackboxSamples(samples) {
    return samples.map((s) => ({
        operationId: s.operationId,
        operationType: s.operationType,
        success: s.success,
        source: 'BLACKBOX_SIMULATION',
        latencyMs: s.latencyUs / 1000,
        timestampMs: s.simulationTimeUs / 1000,
        errorClass: s.success ? 'NONE' : classifyBlackboxError(s.errorCode),
        ...(s.semanticCategory !== undefined ? { semanticCategory: s.semanticCategory } : {}),
        ...(s.errorCode !== undefined ? { rawErrorCode: s.errorCode } : {}),
    }));
}
// ---------------------------------------------------------------------------
// Ingestion: QUORUM LAB samples
// ---------------------------------------------------------------------------
/**
 * Normalize a batch of QUORUM LAB real samples.
 * wallTimeMs is used as the timestamp.
 * realElapsedUs is converted to ms.
 */
export function normalizeQuorumSamples(samples) {
    return samples.map((s) => ({
        operationId: s.operationId,
        operationType: s.operationType,
        success: s.success,
        source: 'QUORUM_CLIENT',
        ...(s.nodeId !== undefined ? { nodeId: s.nodeId } : {}),
        latencyMs: s.realElapsedUs / 1000,
        timestampMs: s.wallTimeMs,
        errorClass: s.success ? 'NONE' : classifyQuorumError(s.errorCode),
        ...(s.semanticCategory !== undefined ? { semanticCategory: s.semanticCategory } : {}),
        ...(s.staleRead !== undefined ? { staleRead: s.staleRead } : {}),
        ...(s.causalAnomaly !== undefined ? { causalAnomaly: s.causalAnomaly } : {}),
        ...(s.errorCode !== undefined ? { rawErrorCode: s.errorCode } : {}),
    }));
}
// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
/**
 * Build a SourceSummary from a set of NormalizedSamples belonging to one source.
 */
function buildSourceSummary(samples) {
    if (samples.length === 0) {
        throw new Error('Cannot build summary from empty samples');
    }
    const source = samples[0].source;
    const successCount = samples.filter((s) => s.success).length;
    const failureCount = samples.length - successCount;
    const staleReadCount = samples.filter((s) => s.staleRead).length;
    const causalAnomalyCount = samples.filter((s) => s.causalAnomaly).length;
    const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const timestamps = samples.map((s) => s.timestampMs);
    // Error breakdown
    const errorBreakdown = {
        NONE: 0, TIMEOUT: 0, NETWORK: 0, OVERLOAD: 0,
        CONSISTENCY: 0, SAFETY: 0, INTERNAL: 0, UNKNOWN: 0,
    };
    for (const s of samples) {
        errorBreakdown[s.errorClass] = (errorBreakdown[s.errorClass] ?? 0) + 1;
    }
    return {
        source,
        totalSamples: samples.length,
        successCount,
        failureCount,
        successRate: successCount / samples.length,
        staleReadCount,
        causalAnomalyCount,
        p50Ms: percentile(latencies, 50),
        p90Ms: percentile(latencies, 90),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        minMs: latencies[0] ?? 0,
        maxMs: latencies[latencies.length - 1] ?? 0,
        meanMs: mean(latencies),
        throughputOpsSec: computeThroughput(timestamps),
        errorBreakdown,
    };
}
// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * Normalize and combine samples from both systems into a NormalizedRunResult.
 *
 * @param integrationRunId   Correlation ID for this run.
 * @param experimentSpecHash SHA-256 of the canonical experiment spec.
 * @param blackboxSamples    Raw samples from BLACKBOX-X.
 * @param quorumSamples      Raw samples from QUORUM LAB.
 */
export function normalizeRunResult(integrationRunId, experimentSpecHash, blackboxSamples, quorumSamples) {
    const normalized = [
        ...normalizeBlackboxSamples(blackboxSamples),
        ...normalizeQuorumSamples(quorumSamples),
    ];
    // Sort by timestampMs for a unified timeline.
    normalized.sort((a, b) => a.timestampMs - b.timestampMs);
    // Build per-source summaries.
    const bySource = new Map();
    for (const s of normalized) {
        const list = bySource.get(s.source) ?? [];
        list.push(s);
        bySource.set(s.source, list);
    }
    const summaries = [];
    for (const samples of bySource.values()) {
        summaries.push(buildSourceSummary(samples));
    }
    return {
        integrationRunId,
        experimentSpecHash,
        samples: normalized,
        summaries,
    };
}
//# sourceMappingURL=resultNormalizer.js.map