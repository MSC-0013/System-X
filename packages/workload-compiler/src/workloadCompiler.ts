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
import type { IntegratedExperiment, CanonicalOperationTrace, OperationTraceEntry } from '@system-x/integration-contracts';
import { computeTraceHash } from '@system-x/integration-contracts';
import { generateOperationTrace } from './operationTraceGenerator.js';
import type { WorkloadSpec } from './types.js';

/**
 * Compile an IntegratedExperiment workload into a CanonicalOperationTrace.
 *
 * @param spec             The full experiment specification.
 * @param experimentSpecHash  SHA-256 of the canonical experiment spec (from I0).
 * @returns                CanonicalOperationTrace ready to pass to the QUORUM adapter.
 */
export function compileWorkload(
  spec: IntegratedExperiment,
  experimentSpecHash: string,
): CanonicalOperationTrace {
  const { workload, masterSeed } = spec;

  // Map IntegratedWorkload to the compiler's WorkloadSpec shape.
  const compiledSpec: WorkloadSpec = {
    clientCount: workload.concurrency,
    operationCount: workload.operationCount,
    durationMs: estimateDurationMs(workload),
    readFraction: workload.readRatio,
    deleteFraction: Math.max(0, 1 - workload.readRatio - workload.writeRatio),
    keyDistribution: workload.distribution === 'ZIPFIAN' ? 'ZIPFIAN' : 'UNIFORM',
    keySpaceSize: workload.keyRange.max - workload.keyRange.min,
    valueSize: workload.valueSizeBytes ?? 64,
  };

  // Generate the trace entries (pure, deterministic).
  const rawEntries = generateOperationTrace(
    compiledSpec,
    experimentSpecHash,
    masterSeed,
  );

  // Convert to the canonical contract shape.
  const entries: readonly OperationTraceEntry[] = rawEntries.map((e) => ({
    sequence: e.sequence,
    logicalClientId: e.logicalClientId,
    operation: e.operation,
    key: e.key,
    ...(e.value !== undefined ? { value: e.value } : {}),
    scheduledOffsetUs: e.scheduledOffsetUs,
  }));

  const traceHash = computeTraceHash(entries);

  return {
    contractVersion: '1.0.0',
    experimentSpecHash,
    traceHash,
    masterSeed,
    entries,
  };
}

/**
 * Estimate total experiment duration in milliseconds.
 * If the workload has a target throughput, we derive duration from operationCount.
 * Otherwise we default to 30 seconds.
 */
function estimateDurationMs(workload: IntegratedExperiment['workload']): number {
  if (workload.targetThroughputOpsSec && workload.targetThroughputOpsSec > 0) {
    const durationSec = workload.operationCount / workload.targetThroughputOpsSec;
    return Math.ceil(durationSec * 1000);
  }
  // Fallback: 30 seconds.
  return 30_000;
}
