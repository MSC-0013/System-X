import { describe, it, expect } from 'vitest';
import {
  twoSampleKsTest,
  wassersteinDistance,
  computeMape,
  generateComparisonReport,
  DEFAULT_COMPARISON_CRITERIA,
} from '../src/index.js';
import type { NormalizedRunResult } from '@system-x/result-normalizer';
import type { NormalizedSample } from '@system-x/result-normalizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSample(
  id: string,
  source: NormalizedSample['source'],
  latencyMs: number,
  timestampMs: number,
  success = true,
): NormalizedSample {
  return {
    operationId: id,
    operationType: 'READ',
    success,
    source,
    latencyMs,
    timestampMs,
    errorClass: success ? 'NONE' : 'TIMEOUT',
  };
}

function makeNormalizedResult(
  simLatencies: number[],
  realLatencies: number[],
): NormalizedRunResult {
  const simSamples = simLatencies.map((l, i) =>
    makeSample(`sim-${i}`, 'BLACKBOX_SIMULATION', l, i * 10),
  );
  const realSamples = realLatencies.map((l, i) =>
    makeSample(`real-${i}`, 'QUORUM_CLIENT', l, i * 10),
  );

  const allSamples = [...simSamples, ...realSamples].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );

  const buildSummary = (samples: NormalizedSample[], source: NormalizedSample['source']) => {
    const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const n = latencies.length;
    return {
      source,
      totalSamples: n,
      successCount: n,
      failureCount: 0,
      successRate: 1,
      staleReadCount: 0,
      causalAnomalyCount: 0,
      p50Ms: latencies[Math.floor(n * 0.5)] ?? 0,
      p90Ms: latencies[Math.floor(n * 0.9)] ?? 0,
      p95Ms: latencies[Math.floor(n * 0.95)] ?? 0,
      p99Ms: latencies[Math.floor(n * 0.99)] ?? 0,
      minMs: latencies[0] ?? 0,
      maxMs: latencies[n - 1] ?? 0,
      meanMs: latencies.reduce((s, v) => s + v, 0) / n,
      throughputOpsSec: n > 0 ? 100 : 0,
      errorBreakdown: {
        NONE: n, TIMEOUT: 0, NETWORK: 0, OVERLOAD: 0,
        CONSISTENCY: 0, SAFETY: 0, INTERNAL: 0, UNKNOWN: 0,
      },
    };
  };

  return {
    integrationRunId: 'run-test-i5',
    experimentSpecHash: 'c'.repeat(64),
    samples: allSamples,
    summaries: [
      buildSummary(simSamples, 'BLACKBOX_SIMULATION'),
      buildSummary(realSamples, 'QUORUM_CLIENT'),
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('I5: Comparison Engine', () => {
  // ---- KS test ----
  it('KS test: identical distributions have D near 0 and high p-value', () => {
    const d1 = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = twoSampleKsTest(d1, [...d1]);
    expect(result.dStatistic).toBe(0);
    expect(result.pValue).toBeCloseTo(1, 1);
    expect(result.rejected).toBe(false);
  });

  it('KS test: clearly different distributions are rejected', () => {
    const low = Array.from({ length: 100 }, () => 1);   // all 1ms
    const high = Array.from({ length: 100 }, () => 100); // all 100ms
    const result = twoSampleKsTest(low, high);
    expect(result.dStatistic).toBeGreaterThan(0.9);
    expect(result.rejected).toBe(true);
  });

  it('KS test: empty samples return D=0 and not rejected', () => {
    const result = twoSampleKsTest([], []);
    expect(result.dStatistic).toBe(0);
    expect(result.rejected).toBe(false);
  });

  // ---- Wasserstein ----
  it('Wasserstein: identical distributions have distance 0', () => {
    const d = [1, 2, 3, 4, 5];
    const result = wassersteinDistance(d, [...d]);
    expect(result.distance).toBe(0);
  });

  it('Wasserstein: constant offset yields that offset as distance', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [11, 12, 13, 14, 15]; // shifted by 10
    const result = wassersteinDistance(a, b);
    expect(result.distance).toBeCloseTo(10, 1);
  });

  it('Wasserstein: empty arrays return 0', () => {
    expect(wassersteinDistance([], []).distance).toBe(0);
  });

  // ---- MAPE ----
  it('MAPE: identical values yield 0%', () => {
    expect(computeMape(100, 100).mapePercent).toBe(0);
  });

  it('MAPE: 10% difference yields 10%', () => {
    expect(computeMape(100, 90).mapePercent).toBeCloseTo(10, 5);
  });

  it('MAPE: actual=0 and predicted=0 yields 0%', () => {
    expect(computeMape(0, 0).mapePercent).toBe(0);
  });

  // ---- Full report ----
  it('certified when distributions are identical', () => {
    const latencies = Array.from({ length: 100 }, (_, i) => 10 + i * 0.1);
    const result = makeNormalizedResult(latencies, [...latencies]);
    const report = generateComparisonReport(result, DEFAULT_COMPARISON_CRITERIA);
    expect(report.certified).toBe(true);
    expect(report.verdict).toContain('CERTIFIED');
  });

  it('not certified when distributions are very different', () => {
    const simLatencies = Array.from({ length: 100 }, () => 5);
    const realLatencies = Array.from({ length: 100 }, () => 500);
    const result = makeNormalizedResult(simLatencies, realLatencies);
    const report = generateComparisonReport(result, DEFAULT_COMPARISON_CRITERIA);
    expect(report.certified).toBe(false);
    expect(report.verdict).toContain('NOT CERTIFIED');
  });

  it('not certified when stat test fails even if D_KS is below engineering threshold (OR bug guard)', () => {
    // This is the EXACT scenario the review identified.
    // We construct distributions where stat test rejects (small p) but D_KS is tiny.
    // With large samples, even a small D_KS can be statistically significant.
    // Force the situation: use strict alpha=1.0 (always reject stat gate),
    // but engineering maxKsDStatistic = 1.0 (always passes engineering gate).
    // Result must be NOT CERTIFIED — both gates must pass independently.
    const a = Array.from({ length: 50 }, (_, i) => i + 1);
    const b = Array.from({ length: 50 }, (_, i) => i + 2); // slight shift
    const result = makeNormalizedResult(a, b);

    const strictCriteria = {
      ...DEFAULT_COMPARISON_CRITERIA,
      ksAlpha: 1.0,           // forces statistical rejection always
      maxKsDStatistic: 1.0,   // engineering gate always passes
      maxP99MapePercent: 100, // disable MAPE gates
      maxThroughputMapePercent: 100,
    };

    const report = generateComparisonReport(result, strictCriteria);
    // Statistical gate fails (alpha=1.0 always rejects), engineering passes.
    // The OLD code would have returned certified=true (OR semantics).
    // The CORRECT code must return certified=false (AND semantics).
    expect(report.certified).toBe(false);
    expect(report.verdict).toContain('hypothesis rejected');
  });

  it('not certified when engineering D_KS exceeds threshold even if stat test passes', () => {
    // Force stat gate to always pass (alpha=0.0), engineering gate to always fail.
    const a = Array.from({ length: 10 }, (_, i) => i + 1);
    const b = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = makeNormalizedResult(a, b);

    const lenientStatCriteria = {
      ...DEFAULT_COMPARISON_CRITERIA,
      ksAlpha: 0.0,              // stat test never rejects
      maxKsDStatistic: -0.001,   // engineering gate impossible to pass (D_KS always >= 0)
      maxP99MapePercent: 100,
      maxThroughputMapePercent: 100,
    };

    const report = generateComparisonReport(result, lenientStatCriteria);
    // Engineering gate fails (maxKsDStatistic=-0.001), stat passes.
    expect(report.certified).toBe(false);
    expect(report.verdict).toContain('engineering max');
  });

  it('report contains correct metadata', () => {
    const latencies = Array.from({ length: 50 }, (_, i) => 10 + i);
    const result = makeNormalizedResult(latencies, latencies);
    const report = generateComparisonReport(result);
    expect(report.integrationRunId).toBe('run-test-i5');
    expect(report.experimentSpecHash).toBe('c'.repeat(64));
    expect(report.simulation.sampleCount).toBe(50);
    expect(report.real.sampleCount).toBe(50);
  });

  // ---- Complete certification truth-table (all four gates) ----
  // Certified = StatPass AND EngPass AND P99Pass AND ThroughputPass
  // Each gate is independently tested to prove no dimension is redundant.

  it('truth-table: stat PASS + eng PASS + p99 FAIL + tput PASS → NOT CERTIFIED', () => {
    const latencies = Array.from({ length: 50 }, (_, i) => i + 1);
    const result = makeNormalizedResult(latencies, [...latencies]);

    const criteria = {
      ...DEFAULT_COMPARISON_CRITERIA,
      ksAlpha: 0.0,               // stat never rejects
      maxKsDStatistic: 1.0,       // eng always passes
      maxP99MapePercent: -1,      // p99 impossible to pass
      maxThroughputMapePercent: 100,
    };

    const report = generateComparisonReport(result, criteria);
    expect(report.certified).toBe(false);
    expect(report.verdict).toContain('p99');
  });

  it('truth-table: stat PASS + eng PASS + p99 PASS + tput FAIL → NOT CERTIFIED', () => {
    const latencies = Array.from({ length: 50 }, (_, i) => i + 1);
    const result = makeNormalizedResult(latencies, [...latencies]);

    const criteria = {
      ...DEFAULT_COMPARISON_CRITERIA,
      ksAlpha: 0.0,               // stat never rejects
      maxKsDStatistic: 1.0,       // eng always passes
      maxP99MapePercent: 100,     // p99 always passes
      maxThroughputMapePercent: -1, // throughput impossible to pass
    };

    const report = generateComparisonReport(result, criteria);
    expect(report.certified).toBe(false);
    expect(report.verdict).toContain('throughput');
  });
});
