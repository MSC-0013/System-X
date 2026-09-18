import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CalibrationLoopConfig, SimulationParameter } from '../src/types.js';
import { BlackboxApiError, requestBlackboxCalibration } from '../src/blackboxClient.js';
import { runCalibrationCycle } from '../src/calibrationLoop.js';
import type { NormalizedRunResult, NormalizedSample } from '@system-x/result-normalizer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG: CalibrationLoopConfig = {
  blackboxBaseUrl: 'http://localhost:3001',
  requestTimeoutMs: 5000,
  maxRetries: 0, // 0 retries keeps tests fast (no real sleep)
  calibrationFraction: 0.7,
};

const PARAMS: SimulationParameter[] = [
  { name: 'networkLatencyMs', value: 5, min: 0, max: 100, step: 1 },
  { name: 'cpuUtilization', value: 0.5, min: 0, max: 1, step: 0.05 },
];

function makeSample(
  id: string,
  latencyMs: number,
  timestampMs: number,
  success = true,
): NormalizedSample {
  return {
    operationId: id,
    operationType: 'READ',
    success,
    source: 'QUORUM_CLIENT',
    latencyMs,
    timestampMs,
    errorClass: success ? 'NONE' : 'TIMEOUT',
  };
}

function makeNormalizedResult(
  quorumLatencies: number[] = Array.from({ length: 50 }, (_, i) => 10 + i * 0.5),
): NormalizedRunResult {
  const baseMs = 1_700_000_000_000;
  const samples = quorumLatencies.map((l, i) =>
    makeSample(`q-${i}`, l, baseMs + i * 20),
  );

  const sorted = [...quorumLatencies].sort((a, b) => a - b);
  const n = sorted.length;
  const p = (pct: number) => sorted[Math.max(0, Math.ceil((pct / 100) * n) - 1)] ?? 0;

  return {
    integrationRunId: 'run-cal-001',
    experimentSpecHash: 'e'.repeat(64),
    samples,
    summaries: [
      {
        source: 'QUORUM_CLIENT',
        totalSamples: n,
        successCount: n,
        failureCount: 0,
        successRate: 1,
        staleReadCount: 0,
        causalAnomalyCount: 0,
        p50Ms: p(50),
        p90Ms: p(90),
        p95Ms: p(95),
        p99Ms: p(99),
        minMs: sorted[0] ?? 0,
        maxMs: sorted[n - 1] ?? 0,
        meanMs: sorted.reduce((s, v) => s + v, 0) / n,
        throughputOpsSec: 980,
        errorBreakdown: {
          NONE: n, TIMEOUT: 0, NETWORK: 0, OVERLOAD: 0,
          CONSISTENCY: 0, SAFETY: 0, INTERNAL: 0, UNKNOWN: 0,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests: blackboxClient (with fetch mock)
// ---------------------------------------------------------------------------

describe('I6: Calibration Loop — blackboxClient', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns calibration response on 200', async () => {
    const mockResponse = {
      runId: 'bbx-cal-001',
      calibratedParameters: { networkLatencyMs: 7, cpuUtilization: 0.6 },
      predictedP99Ms: 52,
      predictedThroughputOpsSec: 1010,
      p99MapePercent: 4,
      throughputMapePercent: 1,
      converged: true,
      iterations: 12,
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      status: 200,
      json: async () => mockResponse,
    }));

    const result = await requestBlackboxCalibration(
      {
        integrationRunId: 'run-001',
        experimentSpecHash: 'e'.repeat(64),
        parameters: { networkLatencyMs: 5 },
        empiricalLatencyQuantiles: {
          p50Ms: 20, p75Ms: 25, p90Ms: 30, p95Ms: 35,
          p99Ms: 45, p999Ms: 60, minMs: 5, maxMs: 80, meanMs: 22,
        },
        empiricalCdfBuckets: [[5, 0.01], [20, 0.5], [45, 0.99]],
        targetThroughputOpsSec: 1000,
        errorRate: 0.01,
        sloBreachCount: 1,
        totalOperations: 100,
      },
      CONFIG,
    );

    expect(result.converged).toBe(true);
    expect(result.calibratedParameters.networkLatencyMs).toBe(7);
    expect(result.iterations).toBe(12);
  });

  it('throws BlackboxApiError (non-retryable) on 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      status: 400,
      text: async () => 'Bad request',
    }));

    await expect(
      requestBlackboxCalibration(
        {
          integrationRunId: 'run-002',
          experimentSpecHash: 'e'.repeat(64),
          parameters: {},
          empiricalLatencyQuantiles: {
            p50Ms: 20, p75Ms: 25, p90Ms: 30, p95Ms: 35,
            p99Ms: 45, p999Ms: 60, minMs: 5, maxMs: 80, meanMs: 22,
          },
          empiricalCdfBuckets: [],
          targetThroughputOpsSec: 1000,
          errorRate: 0,
          sloBreachCount: 0,
          totalOperations: 100,
        },
        CONFIG,
      ),
    ).rejects.toThrow(BlackboxApiError);
  });

  it('throws after maxRetries on 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 503,
      text: async () => 'Unavailable',
    }));

    await expect(
      requestBlackboxCalibration(
        {
          integrationRunId: 'run-003',
          experimentSpecHash: 'e'.repeat(64),
          parameters: {},
          empiricalLatencyQuantiles: {
            p50Ms: 10, p75Ms: 15, p90Ms: 20, p95Ms: 25,
            p99Ms: 30, p999Ms: 40, minMs: 2, maxMs: 50, meanMs: 12,
          },
          empiricalCdfBuckets: [],
          targetThroughputOpsSec: 500,
          errorRate: 0,
          sloBreachCount: 0,
          totalOperations: 50,
        },
        CONFIG,
      ),
    ).rejects.toThrow(BlackboxApiError);
  });
});

// ---------------------------------------------------------------------------
// Tests: runCalibrationCycle
// ---------------------------------------------------------------------------

describe('I6: Calibration Loop — runCalibrationCycle', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends empirical CDF buckets (not just p99 scalar) to BLACKBOX-X', async () => {
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        json: async () => ({
          runId: 'bbx-run-001',
          calibratedParameters: {},
          predictedP99Ms: 30,
          predictedThroughputOpsSec: 980,
          p99MapePercent: 2,
          throughputMapePercent: 1,
          converged: true,
          iterations: 5,
        }),
      };
    }));

    const result = makeNormalizedResult();
    await runCalibrationCycle('run-001', 'f'.repeat(64), result, PARAMS, CONFIG);

    // Must contain full empirical distribution, not just scalars.
    expect(capturedBody.empiricalCdfBuckets).toBeDefined();
    expect(capturedBody.empiricalLatencyQuantiles).toBeDefined();
    expect(Array.isArray(capturedBody.empiricalCdfBuckets)).toBe(true);

    // CDF buckets must be non-empty for non-trivial input.
    const buckets = capturedBody.empiricalCdfBuckets as unknown[][];
    expect(buckets.length).toBeGreaterThan(0);
  });

  it('sends errorRate and sloBreachCount to BLACKBOX-X', async () => {
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        json: async () => ({
          runId: 'bbx-run-002',
          calibratedParameters: {},
          predictedP99Ms: 30,
          predictedThroughputOpsSec: 980,
          p99MapePercent: 3,
          throughputMapePercent: 2,
          converged: true,
          iterations: 8,
        }),
      };
    }));

    const result = makeNormalizedResult();
    await runCalibrationCycle('run-002', 'g'.repeat(64), result, PARAMS, CONFIG);

    expect(typeof capturedBody.errorRate).toBe('number');
    expect(typeof capturedBody.sloBreachCount).toBe('number');
    expect(typeof capturedBody.totalOperations).toBe('number');
  });

  it('returns CalibrationResult with blackboxRunId and converged flag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        runId: 'bbx-123',
        calibratedParameters: { networkLatencyMs: 8 },
        predictedP99Ms: 51,
        predictedThroughputOpsSec: 1005,
        p99MapePercent: 3,
        throughputMapePercent: 2,
        converged: true,
        iterations: 10,
      }),
    }));

    const result = await runCalibrationCycle(
      'run-003',
      'h'.repeat(64),
      makeNormalizedResult(),
      PARAMS,
      CONFIG,
    );

    expect(result.blackboxRunId).toBe('bbx-123');
    expect(result.converged).toBe(true);
    expect(result.integrationRunId).toBe('run-003');
    expect(result.calibratedParameters).toEqual({ networkLatencyMs: 8 });
  });

  it('sends separate calibration and validation partitions (no overfitting leakage)', async () => {
    let capturedBody: Record<string, unknown> = {};

    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        status: 200,
        json: async () => ({
          runId: 'bbx-run-004',
          calibratedParameters: {},
          predictedP99Ms: 30,
          predictedThroughputOpsSec: 980,
          p99MapePercent: 2,
          throughputMapePercent: 1,
          converged: true,
          iterations: 5,
        }),
      };
    }));

    // 50 samples. With fraction=0.7: cal=35, val=15
    const result = makeNormalizedResult(Array.from({ length: 50 }, (_, i) => 10 + i * 0.5));
    await runCalibrationCycle('run-004', 'k'.repeat(64), result, PARAMS, CONFIG);

    const calCount = capturedBody.calibrationSampleCount as number;
    const valCount = capturedBody.validationSampleCount as number;
    const totalOps = capturedBody.totalOperations as number;

    // Both partitions must exist.
    expect(capturedBody.validationCdfBuckets).toBeDefined();
    expect(Array.isArray(capturedBody.validationCdfBuckets)).toBe(true);

    // Partition sizes must sum to total.
    expect(calCount + valCount).toBe(50);
    expect(totalOps).toBe(calCount); // totalOperations = calibration partition size

    // Validation must be non-empty (not same data as calibration).
    const valBuckets = capturedBody.validationCdfBuckets as unknown[][];
    expect(valBuckets.length).toBeGreaterThan(0);

    // The two partition CDF objects must be distinct references/content.
    const calJson = JSON.stringify(capturedBody.empiricalCdfBuckets);
    const valJson = JSON.stringify(capturedBody.validationCdfBuckets);
    // For 50 samples with a 0.7/0.3 split they may differ slightly; at minimum
    // the split boundaries must differ from each other or lengths must differ.
    expect(calCount).not.toBe(valCount); // 35 ≠ 15
    expect(calJson).not.toBe(valJson);   // different distribution slices
  });
});
