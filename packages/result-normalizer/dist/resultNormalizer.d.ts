/**
 * I4 — Result Normalizer: Main normalizer.
 *
 * Ingests raw metric samples from BLACKBOX-X and QUORUM LAB,
 * normalizes them into a unified NormalizedRunResult.
 *
 * Key guarantees:
 *  - Source attribution is preserved per sample.
 *  - Error codes are translated via the unified taxonomy.
 *  - Latency is always in milliseconds (converting from µs where needed).
 *  - Output samples are sorted by timestampMs.
 *  - Per-source summaries are computed with percentiles and throughput.
 */
import type { NormalizedSample, NormalizedRunResult, BlackboxRawSample, QuorumRawSample } from './types.js';
/**
 * Normalize a batch of BLACKBOX-X simulation samples.
 * simulationTimeUs is treated as the timestamp (converted to ms).
 * latencyUs is converted to ms.
 */
export declare function normalizeBlackboxSamples(samples: BlackboxRawSample[]): NormalizedSample[];
/**
 * Normalize a batch of QUORUM LAB real samples.
 * wallTimeMs is used as the timestamp.
 * realElapsedUs is converted to ms.
 */
export declare function normalizeQuorumSamples(samples: QuorumRawSample[]): NormalizedSample[];
/**
 * Normalize and combine samples from both systems into a NormalizedRunResult.
 *
 * @param integrationRunId   Correlation ID for this run.
 * @param experimentSpecHash SHA-256 of the canonical experiment spec.
 * @param blackboxSamples    Raw samples from BLACKBOX-X.
 * @param quorumSamples      Raw samples from QUORUM LAB.
 */
export declare function normalizeRunResult(integrationRunId: string, experimentSpecHash: string, blackboxSamples: BlackboxRawSample[], quorumSamples: QuorumRawSample[]): NormalizedRunResult;
//# sourceMappingURL=resultNormalizer.d.ts.map