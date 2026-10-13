import type { IntegratedExperiment, OperationTraceEntry } from './types.js';
/**
 * Deterministically serializes any JavaScript value to a canonical JSON string.
 * All object keys at all nesting depths are sorted alphabetically.
 * Undefined values are omitted.
 */
export declare function canonicalJsonStringify(value: unknown): string;
/**
 * Normalizes an IntegratedExperiment specification to its canonical semantic representation.
 * Metadata and top-level decorative names can be preserved or normalized, but the semantic core
 * (contractVersion, masterSeed, workload, consistency, faultSchedule, slo) dictates the hash.
 */
export declare function normalizeExperimentSpec(spec: IntegratedExperiment): Record<string, unknown>;
/**
 * Computes the 64-character SHA-256 canonical hash of an IntegratedExperiment.
 * Invariant: Any two specifications with identical parameters (regardless of key insertion order)
 * produce the exact same experimentSpecHash.
 */
export declare function computeExperimentSpecHash(spec: IntegratedExperiment): string;
/**
 * Computes the 64-character SHA-256 canonical hash of an operation trace artifact.
 * Invariant: Identical sequence of trace entries produces the identical traceHash.
 */
export declare function computeTraceHash(entries: readonly OperationTraceEntry[]): string;
//# sourceMappingURL=canonical.d.ts.map