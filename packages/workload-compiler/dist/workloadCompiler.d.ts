/**
 * I2 — Workload Bridge: Main Compiler.
 *
 * Takes an IntegratedExperiment spec + experimentSpecHash + masterSeed and
 * produces a CanonicalOperationTrace with a stable traceHash.
 *
 * Guarantee: For any two calls with identical arguments, the output is
 * bit-for-bit identical (deterministic replay invariant).
 *
 * IMPORTANT: Pure function — NO I/O performed here.
 */
import type { IntegratedExperiment, CanonicalOperationTrace } from '@system-x/integration-contracts';
/**
 * Compile an IntegratedExperiment workload into a CanonicalOperationTrace.
 *
 * @param spec             The full experiment specification.
 * @param experimentSpecHash  SHA-256 of the canonical experiment spec (from I0).
 * @returns                CanonicalOperationTrace ready to pass to the QUORUM adapter.
 */
/**
 * Workload compiler version — bump when any of these change:
 *   - PRNG algorithm or seed derivation
 *   - Zipf/Uniform generator logic
 *   - Key encoding scheme
 *   - Operation scheduling model
 *
 * Replay identity: same spec + masterSeed + WORKLOAD_COMPILER_VERSION = same trace.
 */
export declare const WORKLOAD_COMPILER_VERSION = "1.0.0";
export declare const SEED_DERIVATION_ALGORITHM = "fnv1a64+splitmix64-v1";
export declare const PRNG_ALGORITHM = "mulberry32-v1";
export declare function compileWorkload(spec: IntegratedExperiment, experimentSpecHash: string): CanonicalOperationTrace;
//# sourceMappingURL=workloadCompiler.d.ts.map