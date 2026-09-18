import { describe, it, expect } from 'vitest';
import {
  canonicalJsonStringify,
  computeExperimentSpecHash,
  deriveStreamSeed,
  createMulberry32,
  validateIntegratedExperiment,
  assertValidIntegratedExperiment,
  mapNativeErrorToSemanticOutcome,
  type IntegratedExperiment
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
      // Reconstruct with identical data but completely scrambled key insertion order
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

  describe('3. Validation Rules & Bounds', () => {
    it('passes for a well-formed IntegratedExperiment', () => {
      const result = validateIntegratedExperiment(baseSpec);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(() => assertValidIntegratedExperiment(baseSpec)).not.toThrow();
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

    it('fails when zipfian distribution lacks valid theta', () => {
      const invalid = {
        ...baseSpec,
        workload: { ...baseSpec.workload, zipfianTheta: 0.05 }
      };
      const result = validateIntegratedExperiment(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('zipfianTheta must be between 0.1 and 2.0'))).toBe(true);
    });

    it('fails when keyRange min > max', () => {
      const invalid = {
        ...baseSpec,
        workload: { ...baseSpec.workload, keyRange: { min: 500, max: 100 } }
      };
      const result = validateIntegratedExperiment(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('cannot be less than keyRange.min'))).toBe(true);
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

    it('fails when SLO error rate is out of bounds', () => {
      const invalid = {
        ...baseSpec,
        slo: {
          targetP99Ms: -5,
          maxErrorRate: 1.5
        }
      };
      const result = validateIntegratedExperiment(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('targetP99Ms must be > 0'))).toBe(true);
      expect(result.errors.some((e) => e.includes('maxErrorRate must be between 0.0 and 1.0'))).toBe(true);
    });
  });

  describe('4. Semantic Error Mapping Taxonomy', () => {
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
