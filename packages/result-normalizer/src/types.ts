/**
 * I4 — Result Normalizer: types.
 *
 * Provides a unified error taxonomy and normalized metric model
 * for heterogeneous sources: BLACKBOX-X (simulation) and QUORUM LAB (real).
 */
import type { MetricSource, SemanticOutcomeCategory } from '@system-x/integration-contracts';

// ---------------------------------------------------------------------------
// Unified Error Taxonomy
// ---------------------------------------------------------------------------

/** Top-level error classes shared across both systems. */
export type UnifiedErrorClass =
  | 'NONE'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'OVERLOAD'
  | 'CONSISTENCY'
  | 'SAFETY'
  | 'INTERNAL'
  | 'UNKNOWN';

/** Normalized, source-attributed metric sample. */
export interface NormalizedSample {
  readonly operationId: string;
  readonly operationType: 'READ' | 'WRITE' | 'DELETE';
  readonly success: boolean;
  readonly source: MetricSource;
  /** Node or client identifier, if available. */
  readonly nodeId?: string;
  /** Standardized latency in milliseconds. */
  readonly latencyMs: number;
  /** Wall-clock timestamp in Unix milliseconds. */
  readonly timestampMs: number;
  readonly errorClass: UnifiedErrorClass;
  readonly semanticCategory?: SemanticOutcomeCategory;
  /** True if the read returned stale data. */
  readonly staleRead?: boolean;
  /** True if a causal anomaly was detected. */
  readonly causalAnomaly?: boolean;
  /** Original raw error code from the source system, for diagnostics. */
  readonly rawErrorCode?: string;
}

/** Per-source summary statistics. */
export interface SourceSummary {
  readonly source: MetricSource;
  readonly totalSamples: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly staleReadCount: number;
  readonly causalAnomalyCount: number;
  /** Latency percentiles in ms. */
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly throughputOpsSec: number;
  /** Error class breakdown: errorClass → count */
  readonly errorBreakdown: Readonly<Record<UnifiedErrorClass, number>>;
}

/** Fully normalized result set from one integration run. */
export interface NormalizedRunResult {
  readonly integrationRunId: string;
  readonly experimentSpecHash: string;
  /** All normalized samples, ordered by timestampMs. */
  readonly samples: readonly NormalizedSample[];
  /** Per-source aggregated summaries. */
  readonly summaries: readonly SourceSummary[];
}

/** Raw sample input — BLACKBOX-X simulation shape. */
export interface BlackboxRawSample {
  readonly operationId: string;
  readonly operationType: 'READ' | 'WRITE' | 'DELETE';
  readonly success: boolean;
  /** Simulation virtual time in microseconds. */
  readonly simulationTimeUs: number;
  /** Simulated latency in microseconds. */
  readonly latencyUs: number;
  readonly errorCode?: string;
  readonly semanticCategory?: SemanticOutcomeCategory;
}

/** Raw sample input — QUORUM LAB real shape. */
export interface QuorumRawSample {
  readonly operationId: string;
  readonly operationType: 'READ' | 'WRITE' | 'DELETE';
  readonly success: boolean;
  readonly nodeId?: string;
  /** Wall clock in Unix milliseconds. */
  readonly wallTimeMs: number;
  /** Real latency in microseconds. */
  readonly realElapsedUs: number;
  readonly errorCode?: string;
  readonly semanticCategory?: SemanticOutcomeCategory;
  readonly staleRead?: boolean;
  readonly causalAnomaly?: boolean;
}
