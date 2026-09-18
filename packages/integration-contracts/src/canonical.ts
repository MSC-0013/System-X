import { createHash } from 'node:crypto';
import type { IntegratedExperiment, OperationTraceEntry } from './types.js';

/**
 * Deterministically serializes any JavaScript value to a canonical JSON string.
 * All object keys at all nesting depths are sorted alphabetically.
 * Undefined values are omitted.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const serializedElements = value.map((elem) => canonicalJsonStringify(elem));
    return `[${serializedElements.join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const pairs: string[] = [];

  for (const key of sortedKeys) {
    const val = record[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }

  return `{${pairs.join(',')}}`;
}

/**
 * Normalizes an IntegratedExperiment specification to its canonical semantic representation.
 * Metadata and top-level decorative names can be preserved or normalized, but the semantic core
 * (contractVersion, masterSeed, workload, consistency, faultSchedule, slo) dictates the hash.
 */
export function normalizeExperimentSpec(spec: IntegratedExperiment): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    contractVersion: spec.contractVersion,
    masterSeed: spec.masterSeed,
    workload: {
      operationCount: spec.workload.operationCount,
      concurrency: spec.workload.concurrency,
      distribution: spec.workload.distribution,
      zipfianTheta: spec.workload.zipfianTheta,
      keyRange: {
        min: spec.workload.keyRange.min,
        max: spec.workload.keyRange.max
      },
      readRatio: spec.workload.readRatio,
      writeRatio: spec.workload.writeRatio,
      targetThroughputOpsSec: spec.workload.targetThroughputOpsSec,
      valueSizeBytes: spec.workload.valueSizeBytes
    },
    consistency: {
      replicationEngine: spec.consistency.replicationEngine,
      readConsistency: spec.consistency.readConsistency,
      writeAckPolicy: spec.consistency.writeAckPolicy,
      durability: spec.consistency.durability,
      conflictStrategy: spec.consistency.conflictStrategy
    }
  };

  if (spec.faultSchedule) {
    normalized['faultSchedule'] = {
      faults: spec.faultSchedule.faults.map((f) => ({
        id: f.id,
        type: f.type,
        targetNodes: [...f.targetNodes].sort(),
        offsetMs: f.offsetMs,
        durationMs: f.durationMs,
        parameters: f.parameters ? { ...f.parameters } : undefined
      }))
    };
  }

  if (spec.slo) {
    normalized['slo'] = {
      targetP99Ms: spec.slo.targetP99Ms,
      targetP95Ms: spec.slo.targetP95Ms,
      targetP50Ms: spec.slo.targetP50Ms,
      maxErrorRate: spec.slo.maxErrorRate,
      maxStaleReadRate: spec.slo.maxStaleReadRate,
      minThroughputOpsSec: spec.slo.minThroughputOpsSec
    };
  }

  return normalized;
}

/**
 * Computes the 64-character SHA-256 canonical hash of an IntegratedExperiment.
 * Invariant: Any two specifications with identical parameters (regardless of key insertion order)
 * produce the exact same experimentSpecHash.
 */
export function computeExperimentSpecHash(spec: IntegratedExperiment): string {
  const normalized = normalizeExperimentSpec(spec);
  const canonicalJson = canonicalJsonStringify(normalized);
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

/**
 * Computes the 64-character SHA-256 canonical hash of an operation trace artifact.
 * Invariant: Identical sequence of trace entries produces the identical traceHash.
 */
export function computeTraceHash(entries: readonly OperationTraceEntry[]): string {
  const canonicalJson = canonicalJsonStringify(entries);
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
