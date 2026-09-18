import { describe, it, expect } from 'vitest';
import {
  normalizeRunResult,
  normalizeBlackboxSamples,
  normalizeQuorumSamples,
  classifyBlackboxError,
  classifyQuorumError,
  percentile,
  computeThroughput,
} from '../src/index.js';
import type { BlackboxRawSample, QuorumRawSample } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = 'run-test-001';
const SPEC_HASH = 'b'.repeat(64);

function makeBlackboxSamples(count: number, successRate = 1.0): BlackboxRawSample[] {
  return Array.from({ length: count }, (_, i) => ({
    operationId: `bb-op-${i}`,
    operationType: i % 3 === 0 ? 'WRITE' : i % 3 === 1 ? 'READ' : 'DELETE',
    success: Math.random() < successRate || i < Math.floor(count * successRate),
    simulationTimeUs: i * 1000,
    latencyUs: 500 + i * 10,
    ...(i >= Math.floor(count * successRate) ? { errorCode: 'SIM_TIMEOUT' } : {}),
  })) as BlackboxRawSample[];
}

function makeQuorumSamples(count: number, successRate = 1.0): QuorumRawSample[] {
  const baseMs = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    operationId: `qr-op-${i}`,
    operationType: i % 2 === 0 ? 'WRITE' : 'READ',
    success: i < Math.floor(count * successRate),
    nodeId: `node-${(i % 3) + 1}`,
    wallTimeMs: baseMs + i * 10,
    realElapsedUs: 1000 + i * 20,
    ...(i >= Math.floor(count * successRate) ? { errorCode: 'REQUEST_TIMEOUT' } : {}),
  })) as QuorumRawSample[];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('I4: Result Normalizer', () => {
  // ---- Error taxonomy ----
  it('classifyQuorumError maps known codes correctly', () => {
    expect(classifyQuorumError('REQUEST_TIMEOUT')).toBe('TIMEOUT');
    expect(classifyQuorumError('LEADER_UNAVAILABLE')).toBe('NETWORK');
    expect(classifyQuorumError('SPLIT_BRAIN')).toBe('SAFETY');
    expect(classifyQuorumError('STALE_READ')).toBe('CONSISTENCY');
    expect(classifyQuorumError(undefined)).toBe('NONE');
    expect(classifyQuorumError('TOTALLY_UNKNOWN_CODE')).toBe('UNKNOWN');
  });

  it('classifyBlackboxError maps known codes correctly', () => {
    expect(classifyBlackboxError('SIM_TIMEOUT')).toBe('TIMEOUT');
    expect(classifyBlackboxError('SIM_NETWORK_FAILURE')).toBe('NETWORK');
    expect(classifyBlackboxError(undefined)).toBe('NONE');
    expect(classifyBlackboxError('BOGUS')).toBe('UNKNOWN');
  });

  // ---- Statistics ----
  it('percentile returns correct values', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 99)).toBe(10);
    expect(percentile(sorted, 0)).toBe(1);
  });

  it('computeThroughput returns 0 for empty or single-element arrays', () => {
    expect(computeThroughput([])).toBe(0);
    expect(computeThroughput([1000])).toBe(0);
  });

  it('computeThroughput computes correct ops/sec for known input', () => {
    // 10 ops with timestamps [0, 100, ..., 900] → span = 900ms → 10/0.9s ≈ 11.1 ops/sec
    const timestamps = Array.from({ length: 10 }, (_, i) => i * 100);
    const tps = computeThroughput(timestamps);
    expect(tps).toBeCloseTo(11.11, 1);
  });

  // ---- Normalization ----
  it('normalizeBlackboxSamples converts latencyUs to latencyMs', () => {
    const samples: BlackboxRawSample[] = [{
      operationId: 'op-1',
      operationType: 'READ',
      success: true,
      simulationTimeUs: 2000,
      latencyUs: 5000,
    }];
    const normalized = normalizeBlackboxSamples(samples);
    expect(normalized[0]!.latencyMs).toBe(5);
    expect(normalized[0]!.timestampMs).toBe(2);
    expect(normalized[0]!.source).toBe('BLACKBOX_SIMULATION');
    expect(normalized[0]!.errorClass).toBe('NONE');
  });

  it('normalizeQuorumSamples converts realElapsedUs to latencyMs', () => {
    const samples: QuorumRawSample[] = [{
      operationId: 'op-2',
      operationType: 'WRITE',
      success: false,
      nodeId: 'node-1',
      wallTimeMs: 1234567890,
      realElapsedUs: 3000,
      errorCode: 'REQUEST_TIMEOUT',
    }];
    const normalized = normalizeQuorumSamples(samples);
    expect(normalized[0]!.latencyMs).toBe(3);
    expect(normalized[0]!.errorClass).toBe('TIMEOUT');
    expect(normalized[0]!.source).toBe('QUORUM_CLIENT');
    expect(normalized[0]!.rawErrorCode).toBe('REQUEST_TIMEOUT');
  });

  // ---- normalizeRunResult ----
  it('produces samples sorted by timestampMs', () => {
    const bb = makeBlackboxSamples(50);
    const qr = makeQuorumSamples(50);
    const result = normalizeRunResult(RUN_ID, SPEC_HASH, bb, qr);

    for (let i = 1; i < result.samples.length; i++) {
      expect(result.samples[i]!.timestampMs).toBeGreaterThanOrEqual(
        result.samples[i - 1]!.timestampMs,
      );
    }
  });

  it('summaries contain one entry per source', () => {
    const bb = makeBlackboxSamples(30);
    const qr = makeQuorumSamples(30);
    const result = normalizeRunResult(RUN_ID, SPEC_HASH, bb, qr);

    const sources = result.summaries.map((s) => s.source);
    expect(sources).toContain('BLACKBOX_SIMULATION');
    expect(sources).toContain('QUORUM_CLIENT');
  });

  it('summary totalSamples equals input count per source', () => {
    const bb = makeBlackboxSamples(40);
    const qr = makeQuorumSamples(25);
    const result = normalizeRunResult(RUN_ID, SPEC_HASH, bb, qr);

    const bbSummary = result.summaries.find((s) => s.source === 'BLACKBOX_SIMULATION');
    const qrSummary = result.summaries.find((s) => s.source === 'QUORUM_CLIENT');
    expect(bbSummary?.totalSamples).toBe(40);
    expect(qrSummary?.totalSamples).toBe(25);
  });

  it('integrationRunId and experimentSpecHash are propagated', () => {
    const result = normalizeRunResult(RUN_ID, SPEC_HASH, [], []);
    expect(result.integrationRunId).toBe(RUN_ID);
    expect(result.experimentSpecHash).toBe(SPEC_HASH);
  });

  it('successRate = successCount / totalSamples in summary', () => {
    const bb = makeBlackboxSamples(10, 0.8);
    const result = normalizeRunResult(RUN_ID, SPEC_HASH, bb, []);
    const summary = result.summaries.find((s) => s.source === 'BLACKBOX_SIMULATION');
    expect(summary?.successRate).toBeCloseTo(summary!.successCount / summary!.totalSamples, 5);
  });
});
