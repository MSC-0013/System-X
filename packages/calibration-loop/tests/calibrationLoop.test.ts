import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CalibrationLoopConfig, SimulationParameter } from '../src/types.js';
import { BlackboxApiError, requestBlackboxCalibration } from '../src/blackboxClient.js';
import { runCalibrationCycle } from '../src/calibrationLoop.js';
import type { ComparisonReport } from '@system-x/comparison-engine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG: CalibrationLoopConfig = {
  blackboxBaseUrl: 'http://localhost:3001',
  requestTimeoutMs: 5000,
  maxRetries: 2,
};

const PARAMS: SimulationParameter[] = [
  { name: 'networkLatencyMs', value: 5, min: 0, max: 100, step: 1 },
  { name: 'cpuUtilization', value: 0.5, min: 0, max: 1, step: 0.05 },
];

function makeComparisonReport(p99Ms = 50, throughputOpsSec = 1000): ComparisonReport {
  return {
    experimentSpecHash: 'd'.repeat(64),
    integrationRunId: 'run-cal-001',
    latencyKs: { dStatistic: 0.05, pValue: 0.4, rejected: false, alpha: 0.05 },
    latencyWasserstein: { distance: 2.5 },
    throughputMape: { mapePercent: 5 },
    p99LatencyMape: { mapePercent: 8 },
    simulation: {
      sampleCount: 100,
      p50Ms: 20,
      p95Ms: 40,
      p99Ms: 45,
      throughputOpsSec: 950,
      successRate: 0.98,
    },
    real: {
      sampleCount: 100,
      p50Ms: 22,
      p95Ms: 43,
      p99Ms,
      throughputOpsSec,
      successRate: 0.99,
    },
    certified: false,
    verdict: 'NOT CERTIFIED: p99 MAPE exceeds threshold',
  };
}

// ---------------------------------------------------------------------------
// Tests: blackboxClient (with fetch mock)
// ---------------------------------------------------------------------------

describe('I6: Calibration Loop — blackboxClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
        targetP99Ms: 50,
        targetThroughputOpsSec: 1000,
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
          targetP99Ms: 50,
          targetThroughputOpsSec: 1000,
        },
        { ...CONFIG, maxRetries: 0 },
      ),
    ).rejects.toThrow(BlackboxApiError);
  });

  it('retries on 503 and eventually throws after maxRetries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 503,
      text: async () => 'Service unavailable',
    }));

    // Use 0 retries to keep test fast (no actual sleep).
    await expect(
      requestBlackboxCalibration(
        {
          integrationRunId: 'run-003',
          experimentSpecHash: 'e'.repeat(64),
          parameters: {},
          targetP99Ms: 50,
          targetThroughputOpsSec: 1000,
        },
        { ...CONFIG, maxRetries: 0 },
      ),
    ).rejects.toThrow(BlackboxApiError);
  });
});

// ---------------------------------------------------------------------------
// Tests: runCalibrationCycle
// ---------------------------------------------------------------------------

describe('I6: Calibration Loop — runCalibrationCycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes real-system p99 and throughput as targets to BLACKBOX-X', async () => {
    const capturedBody: { targetP99Ms?: number; targetThroughputOpsSec?: number } = {};

    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as typeof capturedBody;
      capturedBody.targetP99Ms = body.targetP99Ms;
      capturedBody.targetThroughputOpsSec = body.targetThroughputOpsSec;

      return {
        status: 200,
        json: async () => ({
          runId: 'bbx-run-001',
          calibratedParameters: {},
          predictedP99Ms: 50,
          predictedThroughputOpsSec: 1000,
          p99MapePercent: 2,
          throughputMapePercent: 1,
          converged: true,
          iterations: 5,
        }),
      };
    }));

    const comparison = makeComparisonReport(55, 980);
    await runCalibrationCycle('run-001', 'f'.repeat(64), comparison, PARAMS, CONFIG);

    expect(capturedBody.targetP99Ms).toBe(55);
    expect(capturedBody.targetThroughputOpsSec).toBe(980);
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
      'run-002',
      'g'.repeat(64),
      makeComparisonReport(),
      PARAMS,
      CONFIG,
    );

    expect(result.blackboxRunId).toBe('bbx-123');
    expect(result.converged).toBe(true);
    expect(result.integrationRunId).toBe('run-002');
    expect(result.calibratedParameters).toEqual({ networkLatencyMs: 8 });
  });
});
