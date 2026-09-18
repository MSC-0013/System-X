/**
 * I2 — Workload Bridge: internal types for workload compilation.
 *
 * These are compiler-internal. The public output is CanonicalOperationTrace
 * from @system-x/integration-contracts.
 */

/** A single compiled operation in the trace. */
export interface OperationTraceEntry {
  /** Monotonically increasing index within the trace (0-based). */
  sequence: number;
  /** Logical client ID (0-based). Each virtual client has its own stream. */
  logicalClientId: number;
  /** The operation type. */
  operation: 'PUT' | 'GET' | 'DELETE';
  /** The key to operate on. */
  key: string;
  /** Value for PUT operations; undefined otherwise. */
  value?: string;
  /** Relative offset from experiment start in microseconds. */
  scheduledOffsetUs: number;
}

/** Input to the workload compiler. */
export interface WorkloadCompilationRequest {
  /** Validated IntegratedWorkload from integration-contracts. */
  workload: WorkloadSpec;
  /** SHA-256 hex string of the canonical experiment spec. */
  experimentSpecHash: string;
  /** Master seed hex string. */
  masterSeed: string;
}

/** Minimal workload spec (mirrors IntegratedWorkload fields used here). */
export interface WorkloadSpec {
  clientCount: number;
  operationCount: number;
  durationMs: number;
  readFraction: number;
  deleteFraction: number;
  keyDistribution: 'UNIFORM' | 'ZIPFIAN';
  keySpaceSize: number;
  valueSize: number;
}

/** Result of compiling a workload. */
export interface WorkloadCompilationResult {
  /** The full ordered trace. */
  entries: OperationTraceEntry[];
  /** SHA-256 of the canonical JSON of entries (for integrity verification). */
  traceHash: string;
  /** Number of operations generated. */
  operationCount: number;
  /** Logical duration of the trace in microseconds (last scheduledOffsetUs). */
  traceDurationUs: number;
}
