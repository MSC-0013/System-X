import { describe, it, expect } from 'vitest';
import {
  canonicalJsonStringify,
  computeExperimentSpecHash,
  computeTraceHash,
  deriveStreamSeed,
  createMulberry32,
  validateIntegratedExperiment,
  assertValidIntegratedExperiment,
  validateOperationTraceEntry,
  evaluateKsCertification,
  mapNativeErrorToSemanticOutcome,
  type IntegratedExperiment,
  type OperationTraceEntry
} from '../src/index.js';

describe('Canonical Contracts & Invariants (Milestone I0)', () => {
  const baseSpec: IntegratedExperiment = {
    id: 'exp-systemx-001',
    name: 'Quorum vs Simulation Baseline',
    contractVersion: '1.0.0',
    masterSeed: 1337,
    workload: {
      operationCount: 1000,
      concurrency: 16,
      distribution: 'ZIPFIAN',
      zipfianTheta: 0.99,
      keyRange: { min: 0, max: 10000 },
      readRatio: 0.8,
      writeRatio: 0.2,
      targetThroughputOpsSec: 250,
      valueSizeBytes: 256
    },
    consistency: {
      replicationEngine: 'LEADERLESS',
      readConsistency: 'QUORUM',
      writeAckPolicy: 'QUORUM',
      durability: 'BATCHED_FSYNC',
      conflictStrategy: 'LAST_WRITE_WINS'
    },
    faultSchedule: {
      faults: [
        {
          id: 'fault-part-1',
          type: 'PARTITION',
          targetNodes: ['node-2'],
          offsetMs: 5000,
          durationMs: 3000
        }
      ]
    },
    slo: {
      targetP99Ms: 50,
      targetP95Ms: 25,
      targetP50Ms: 10,
      maxErrorRate: 0.01,
      maxStaleReadRate: 0.0,
      minThroughputOpsSec: 200
    }
  };

  describe('1. Canonical Serialization & Hash Invariance', () => {
    it('produces identical canonical JSON strings regardless of property order', () => {
      const objA = { b: 2, a: 1, c: { z: 100, y: 50 } };
      const objB = { a: 1, c: { y: 50, z: 100 }, b: 2 };

      expect(canonicalJsonStringify(objA)).toBe(canonicalJsonStringify(objB));
      expect(canonicalJsonStringify(objA)).toBe('{"a":1,"b":2,"c":{"y":50,"z":100}}');
    });

    it('computes identical experimentSpecHash when top-level and nested keys are permuted', () => {
      const permutedSpec: IntegratedExperiment = {
        name: 'Quorum vs Simulation Baseline',
        slo: {
          maxErrorRate: 0.01,
          targetP99Ms: 50,
          minThroughputOpsSec: 200,
          maxStaleReadRate: 0.0,
          targetP50Ms: 10,
          targetP95Ms: 25
        },
        workload: {
          keyRange: { max: 10000, min: 0 },
          distribution: 'ZIPFIAN',
          writeRatio: 0.2,
          operationCount: 1000,
          concurrency: 16,
          readRatio: 0.8,
          zipfianTheta: 0.99,
          valueSizeBytes: 256,
          targetThroughputOpsSec: 250
        },
        masterSeed: 1337,
        id: 'exp-systemx-001',
        consistency: {
          conflictStrategy: 'LAST_WRITE_WINS',
          readConsistency: 'QUORUM',
          replicationEngine: 'LEADERLESS',
          durability: 'BATCHED_FSYNC',
          writeAckPolicy: 'QUORUM'
        },
        contractVersion: '1.0.0',
        faultSchedule: {
          faults: [
            {
              durationMs: 3000,
              offsetMs: 5000,
              id: 'fault-part-1',
              type: 'PARTITION',
              targetNodes: ['node-2']
            }
          ]
        }
      };

      const hashA = computeExperimentSpecHash(baseSpec);
      const hashB = computeExperimentSpecHash(permutedSpec);

      expect(hashA).toHaveLength(64);
      expect(hashA).toBe(hashB);
    });

    it('produces distinct hash when any operational parameter changes', () => {
      const hashBase = computeExperimentSpecHash(baseSpec);

      const modifiedWorkload: IntegratedExperiment = {
        ...baseSpec,
        workload: { ...baseSpec.workload, operationCount: 1001 }
      };
      expect(computeExperimentSpecHash(modifiedWorkload)).not.toBe(hashBase);

      const modifiedMasterSeed: IntegratedExperiment = {
        ...baseSpec,
        masterSeed: 1338
      };
      expect(computeExperimentSpecHash(modifiedMasterSeed)).not.toBe(hashBase);

      const modifiedConsistency: IntegratedExperiment = {
        ...baseSpec,
        consistency: { ...baseSpec.consistency, readConsistency: 'ALL' }
      };
      expect(computeExperimentSpecHash(modifiedConsistency)).not.toBe(hashBase);
    });
  });

  describe('2. Deterministic Seed Derivation & PRNG', () => {
    it('derives identical 32-bit seeds for identical spec hash, master seed, and stream name', () => {
      const specHash = computeExperimentSpecHash(baseSpec);
      const seed1 = deriveStreamSeed(specHash, 1337, 'workload:trace');
      const seed2 = deriveStreamSeed(specHash, 1337, 'workload:trace');

      expect(seed1).toBe(seed2);
      expect(seed1).toBeGreaterThanOrEqual(0);
      expect(seed1).toBeLessThanOrEqual(0xffffffff);
    });

    it('derives distinct seeds for distinct stream names', () => {
      const specHash = computeExperimentSpecHash(baseSpec);
      const seedWorkload = deriveStreamSeed(specHash, 1337, 'workload:trace');
      const seedFault = deriveStreamSeed(specHash, 1337, 'fault:schedule');
      const seedClient0 = deriveStreamSeed(specHash, 1337, 'client:worker:0');

      expect(seedWorkload).not.toBe(seedFault);
      expect(seedWorkload).not.toBe(seedClient0);
    });

    it('Mulberry32 produces identical sequence of 1000 pseudo-random values', () => {
      const seed = 4294967;
      const rng1 = createMulberry32(seed);
      const rng2 = createMulberry32(seed);

      const seq1: number[] = [];
      const seq2: number[] = [];

      for (let i = 0; i < 1000; i++) {
        seq1.push(rng1());
        seq2.push(rng2());
      }

      expect(seq1).toEqual(seq2);
      expect(seq1[0]).toBeGreaterThanOrEqual(0);
      expect(seq1[0]).toBeLessThan(1);
    });
  });

  describe('3. First-Class Operation Trace Artifact', () => {
    const traceEntries: OperationTraceEntry[] = [
      { sequence: 0, logicalClientId: 0, operation: 'PUT', key: 'user:100', value: 'v1', scheduledOffsetUs: 0 },
      { sequence: 1, logicalClientId: 1, operation: 'GET', key: 'user:100', scheduledOffsetUs: 150 },
      { sequence: 2, logicalClientId: 0, operation: 'DELETE', key: 'user:100', scheduledOffsetUs: 300 }
    ];

    it('computes deterministic 64-char traceHash for identical entries', () => {
      const hash1 = computeTraceHash(traceEntries);
      const hash2 = computeTraceHash([...traceEntries]);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
    });

    it('computes distinct traceHash when operation order or client id changes', () => {
      const hashBase = computeTraceHash(traceEntries);
      const reordered: OperationTraceEntry[] = [
        traceEntries[1]!,
        traceEntries[0]!,
        traceEntries[2]!
      ];

      expect(computeTraceHash(reordered)).not.toBe(hashBase);
    });

    it('validates operation trace entries correctly', () => {
      expect(validateOperationTraceEntry(traceEntries[0]!)).toHaveLength(0);

      const invalidEntry: OperationTraceEntry = {
        sequence: -1,
        logicalClientId: -2,
        operation: 'INVALID' as any,
        key: '',
        scheduledOffsetUs: -10
      };
      const errors = validateOperationTraceEntry(invalidEntry);
      expect(errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('4. Validation Rules, Bounds & Vocabulary', () => {
    it('passes for a well-formed IntegratedExperiment with CUSTOM_MERGE', () => {
      const customMergeSpec: IntegratedExperiment = {
        ...baseSpec,
        consistency: {
          ...baseSpec.consistency,
          conflictStrategy: 'CUSTOM_MERGE'
        }
      };
      const result = validateIntegratedExperiment(customMergeSpec);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(() => assertValidIntegratedExperiment(customMergeSpec)).not.toThrow();
    });

    it('fails when readRatio and writeRatio do not sum to 1.0', () => {
      const invalid = {
        ...baseSpec,
        workload: { ...baseSpec.workload, readRatio: 0.5, writeRatio: 0.2 }
      };
      const result = validateIntegratedExperiment(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('must equal 1.0'))).toBe(true);
      expect(() => assertValidIntegratedExperiment(invalid)).toThrow('must equal 1.0');
    });

    it('validates discrete process faults: CRASH, RESTART, RECOVER', () => {
      const processFaultSpec: IntegratedExperiment = {
        ...baseSpec,
        faultSchedule: {
          faults: [
            {
              id: 'fault-crash-1',
              type: 'CRASH',
              targetNodes: ['node-1'],
              offsetMs: 1000,
              durationMs: 1
            },
            {
              id: 'fault-restart-1',
              type: 'RESTART',
              targetNodes: ['node-1'],
              offsetMs: 3000,
              durationMs: 1,
              parameters: { recoveryTimeoutMs: 5000 }
            },
            {
              id: 'fault-recover-1',
              type: 'RECOVER',
              targetNodes: ['node-1'],
              offsetMs: 3500,
              durationMs: 1
            }
          ]
        }
      };
      const result = validateIntegratedExperiment(processFaultSpec);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when fault schedule has invalid durations or targetNodes', () => {
      const invalid = {
        ...baseSpec,
        faultSchedule: {
          faults: [
            {
              id: 'fault-bad',
              type: 'PARTITION' as const,
              targetNodes: [],
              offsetMs: -10,
              durationMs: 0
            }
          ]
        }
      };
      const result = validateIntegratedExperiment(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('targetNodes must be a non-empty array'))).toBe(true);
      expect(result.errors.some((e) => e.includes('offsetMs must be >= 0'))).toBe(true);
      expect(result.errors.some((e) => e.includes('durationMs must be > 0'))).toBe(true);
    });
  });

  describe('5. KS Certification Evaluation (Statistical vs Engineering Thresholds)', () => {
    it('passes certification when hypothesis accepted and all engineering limits satisfied', () => {
      const evaluation = evaluateKsCertification(0.45, 0.03, 0.08, 0.05);

      expect(evaluation.passed).toBe(true);
      expect(evaluation.hypothesisAccepted).toBe(true);
      expect(evaluation.dKsWithinEngineeringLimit).toBe(true);
      expect(evaluation.p99MapeWithinLimit).toBe(true);
      expect(evaluation.throughputMapeWithinLimit).toBe(true);
      expect(evaluation.reason).toBeUndefined();
    });

    it('fails certification when p-value is below significance level alpha', () => {
      const evaluation = evaluateKsCertification(0.01, 0.03, 0.08, 0.05);

      expect(evaluation.passed).toBe(false);
      expect(evaluation.hypothesisAccepted).toBe(false);
      expect(evaluation.reason).toContain('KS p-value');
    });

    it('fails certification when engineering D_ks threshold is exceeded even if p-value is large', () => {
      const evaluation = evaluateKsCertification(0.20, 0.08, 0.08, 0.05);

      expect(evaluation.passed).toBe(false);
      expect(evaluation.dKsWithinEngineeringLimit).toBe(false);
      expect(evaluation.reason).toContain('KS statistic D');
    });

    it('fails certification when p99 tail MAPE exceeds threshold', () => {
      const evaluation = evaluateKsCertification(0.50, 0.02, 0.25, 0.05);

      expect(evaluation.passed).toBe(false);
      expect(evaluation.p99MapeWithinLimit).toBe(false);
      expect(evaluation.reason).toContain('p99 MAPE');
    });
  });

  describe('6. Semantic Error Mapping Taxonomy', () => {
    it('correctly maps distributed consensus errors to unified taxonomy', () => {
      expect(mapNativeErrorToSemanticOutcome('STATUS_CODE_FENCED')).toBe('LEADERSHIP_SAFETY_FAILURE');
      expect(mapNativeErrorToSemanticOutcome('NotLeaderError')).toBe('ROUTING_RETRYABLE_FAILURE');
      expect(mapNativeErrorToSemanticOutcome('UnsafeLeaderError')).toBe('COORDINATION_LEASE_EXPIRED');
      expect(mapNativeErrorToSemanticOutcome('QuorumWriteError')).toBe('WRITE_AVAILABILITY_FAILURE');
      expect(mapNativeErrorToSemanticOutcome('STATUS_CODE_STALE_MEMBERSHIP')).toBe('MEMBERSHIP_SAFETY_FAILURE');
      expect(mapNativeErrorToSemanticOutcome('CAUSAL_ANOMALY')).toBe('CONSISTENCY_REQUIREMENT_FAILURE');
      expect(mapNativeErrorToSemanticOutcome('STORAGE_CORRUPTION')).toBe('INTERNAL_STORAGE_FAILURE');
      expect(mapNativeErrorToSemanticOutcome(undefined)).toBe('SUCCESS');
    });
  });
});
