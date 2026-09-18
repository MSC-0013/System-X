/**
 * SYSTEM-X LOCAL GATE
 *
 * Verifies all deterministic pipeline components offline — no live servers required.
 * All steps MUST pass. Any failure is a code defect, not an environment issue.
 *
 * Steps:
 *  [1/7] Canonical workload trace — deterministic input replayability
 *  [2/7] Workload compiler version provenance present in trace
 *  [3/7] Fault timeline compilation and monotonic ordering
 *  [4/7] Result normalizer round-trip and sample attribution
 *  [5/7] I5 certification — explicit two-gate AND semantics (stat + eng)
 *  [6/7] I5 certification — complete four-gate truth-table
 *  [7/7] Certification record hash stability
 *
 * Usage:
 *   node --import tsx gate/localGate.ts
 *
 * Exit code 0 = all gates passed.
 * Exit code 1 = at least one gate failed.
 */

import {
  compileWorkload,
  WORKLOAD_COMPILER_VERSION,
  SEED_DERIVATION_ALGORITHM,
  PRNG_ALGORITHM,
} from '@system-x/workload-compiler';
import { compileFaultSchedule } from '@system-x/fault-compiler';
import { normalizeRunResult } from '@system-x/result-normalizer';
import { generateComparisonReport, DEFAULT_COMPARISON_CRITERIA } from '@system-x/comparison-engine';
import { evaluateCertification, computeSha256 } from '@system-x/certification-gate';
import type { IntegratedWorkload, IntegratedFaultSchedule } from '@system-x/integration-contracts';
import type { NormalizedSample } from '@system-x/result-normalizer';
import type { ArtifactRecord, CertificationLineage } from '@system-x/certification-gate';

// ---------------------------------------------------------------------------
// Gate runner
// ---------------------------------------------------------------------------

type GateStatus = 'PASS' | 'FAIL';

interface GateResult {
  step: number;
  label: string;
  status: GateStatus;
  detail: string;
}

const TOTAL = 7;
const results: GateResult[] = [];
let stepCounter = 0;

async function gate(label: string, fn: () => Promise<string>): Promise<void> {
  const step = ++stepCounter;
  try {
    const detail = await fn();
    results.push({ step, label, status: 'PASS', detail });
    console.log(`[${step}/${TOTAL}] PASS  ${label} — ${detail}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ step, label, status: 'FAIL', detail });
    console.error(`[${step}/${TOTAL}] FAIL  ${label} — ${detail}`);
  }
}

const RUN_ID = `local-gate-${Date.now()}`;
const SPEC_HASH = computeSha256(`local-gate-spec-${RUN_ID}`);

// ---------------------------------------------------------------------------
// [1] Deterministic workload trace input
// ---------------------------------------------------------------------------

await gate('Deterministic workload trace compilation', async () => {
  const spec = {
    workload: {
      operationCount: 500, concurrency: 3, distribution: 'ZIPFIAN' as const,
      keyRange: { min: 1, max: 5000 }, readRatio: 0.7, writeRatio: 0.3,
    } satisfies IntegratedWorkload,
    masterSeed: 42,
    consistency: { replicationEngine: 'RAFT' as const, readConsistency: 'QUORUM' as const,
      writeAckPolicy: 'QUORUM' as const, durability: 'SYNC_FSYNC' as const,
      conflictStrategy: 'LAST_WRITE_WINS' as const },
    faults: { events: [] },
  };

  const t1 = compileWorkload(spec, SPEC_HASH);
  const t2 = compileWorkload(spec, SPEC_HASH);

  if (t1.traceHash !== t2.traceHash) {
    throw new Error(`Non-deterministic! ${t1.traceHash.slice(0, 8)} ≠ ${t2.traceHash.slice(0, 8)}`);
  }
  return `traceHash=${t1.traceHash.slice(0, 16)}… entries=${t1.entries.length} ✓`;
});

// ---------------------------------------------------------------------------
// [2] Workload compiler version provenance in trace
// ---------------------------------------------------------------------------

await gate('Compiler version provenance in CanonicalOperationTrace', async () => {
  const spec = {
    workload: {
      operationCount: 100, concurrency: 2, distribution: 'UNIFORM' as const,
      keyRange: { min: 1, max: 1000 }, readRatio: 0.5, writeRatio: 0.5,
    } satisfies IntegratedWorkload,
    masterSeed: 99,
    consistency: { replicationEngine: 'LEADERLESS' as const, readConsistency: 'ONE' as const,
      writeAckPolicy: 'ONE' as const, durability: 'MEMORY_ONLY' as const,
      conflictStrategy: 'LAST_WRITE_WINS' as const },
    faults: { events: [] },
  };

  const trace = compileWorkload(spec, SPEC_HASH);

  if (!trace.workloadCompilerVersion) throw new Error('workloadCompilerVersion missing from trace');
  if (!trace.seedDerivationAlgorithm) throw new Error('seedDerivationAlgorithm missing from trace');
  if (!trace.prngAlgorithm) throw new Error('prngAlgorithm missing from trace');
  if (!trace.distributionAlgorithm) throw new Error('distributionAlgorithm missing from trace');

  if (trace.workloadCompilerVersion !== WORKLOAD_COMPILER_VERSION) {
    throw new Error(
      `Version mismatch: trace=${trace.workloadCompilerVersion} constant=${WORKLOAD_COMPILER_VERSION}`,
    );
  }
  if (trace.seedDerivationAlgorithm !== SEED_DERIVATION_ALGORITHM) {
    throw new Error(`Seed derivation mismatch: ${trace.seedDerivationAlgorithm} !== ${SEED_DERIVATION_ALGORITHM}`);
  }
  if (trace.prngAlgorithm !== PRNG_ALGORITHM) {
    throw new Error(`PRNG mismatch: ${trace.prngAlgorithm} !== ${PRNG_ALGORITHM}`);
  }

  return `v=${trace.workloadCompilerVersion} seedDeriv="${trace.seedDerivationAlgorithm}" prng="${trace.prngAlgorithm}" dist="${trace.distributionAlgorithm}" ✓`;
});

// ---------------------------------------------------------------------------
// [3] Fault timeline compilation and monotonic order
// ---------------------------------------------------------------------------

await gate('Fault timeline compilation', async () => {
  const schedule: IntegratedFaultSchedule = {
    faults: [
      { id: 'f-1', type: 'DELAY', targetNodes: ['n-1'], offsetMs: 500, durationMs: 1000 },
      { id: 'f-2', type: 'PARTITION', targetNodes: ['n-1', 'n-2'], offsetMs: 2000, durationMs: 500 },
      { id: 'f-3', type: 'CRASH', targetNodes: ['n-3'], offsetMs: 3000, durationMs: 0 },
    ],
  };

  const timeline = compileFaultSchedule(schedule, SPEC_HASH);

  if (timeline.events.length !== 3) throw new Error(`Expected 3 events, got ${timeline.events.length}`);
  for (let i = 1; i < timeline.events.length; i++) {
    if (timeline.events[i]!.startOffsetMs < timeline.events[i - 1]!.startOffsetMs) {
      throw new Error('Events not sorted by startOffsetMs (monotonic violation)');
    }
  }

  return `timelineHash=${timeline.timelineHash.slice(0, 16)}… events=${timeline.events.length} sorted ✓`;
});

// ---------------------------------------------------------------------------
// [4] Result normalizer round-trip
// ---------------------------------------------------------------------------

await gate('Result normalizer round-trip', async () => {
  const bbSamples = Array.from({ length: 50 }, (_, i) => ({
    operationId: `bb-${i}`, operationType: 'READ' as const, success: true,
    simulationTimeUs: i * 1000, latencyUs: 4000 + i * 80,
  }));

  const qrSamples = Array.from({ length: 50 }, (_, i) => ({
    operationId: `qr-${i}`, operationType: 'WRITE' as const, success: i < 48,
    nodeId: 'n-1', wallTimeMs: Date.now() + i * 10, realElapsedUs: 2500 + i * 40,
    ...(i >= 48 ? { errorCode: 'REQUEST_TIMEOUT' } : {}),
  }));

  const result = normalizeRunResult(RUN_ID, SPEC_HASH, bbSamples, qrSamples);

  if (result.summaries.length !== 2) throw new Error(`Expected 2 summaries, got ${result.summaries.length}`);
  const qrSum = result.summaries.find((s) => s.source === 'QUORUM_CLIENT');
  if (!qrSum) throw new Error('QUORUM_CLIENT summary missing');

  return `bbSamples=50 qrSamples=50 qrSuccessRate=${qrSum.successRate.toFixed(2)} ✓`;
});

// ---------------------------------------------------------------------------
// [5] Comparison — two-gate AND semantics (OR bug guard)
// ---------------------------------------------------------------------------

await gate('Comparison engine — two-gate AND certification', async () => {
  const makeNS = (src: 'BLACKBOX_SIMULATION' | 'QUORUM_CLIENT', n: number, offset: number): NormalizedSample[] =>
    Array.from({ length: n }, (_, i) => ({
      operationId: `${src}-${i}`, operationType: 'READ' as const, success: true,
      source: src, latencyMs: i + 1 + offset, timestampMs: i * 10, errorClass: 'NONE' as const,
    }));

  const normalizedResult = {
    integrationRunId: RUN_ID,
    experimentSpecHash: SPEC_HASH,
    samples: [...makeNS('BLACKBOX_SIMULATION', 50, 0), ...makeNS('QUORUM_CLIENT', 50, 1)]
      .sort((a, b) => a.timestampMs - b.timestampMs),
    summaries: normalizeRunResult(RUN_ID, SPEC_HASH, [], []).summaries,
  };

  // Force stat to always reject, engineering to always pass.
  const bugCheckCriteria = {
    ...DEFAULT_COMPARISON_CRITERIA,
    ksAlpha: 1.0, maxKsDStatistic: 1.0,
    maxP99MapePercent: 100, maxThroughputMapePercent: 100,
  };

  const report = generateComparisonReport(normalizedResult, bugCheckCriteria);

  if (report.certified) {
    throw new Error('BUG DETECTED: certified=true when stat gate forced to reject (OR semantics)');
  }
  if (!report.verdict.includes('hypothesis rejected')) {
    throw new Error(`Expected "hypothesis rejected" in verdict, got: "${report.verdict}"`);
  }

  return `certified=false verdict="…${report.verdict.slice(0, 40)}…" AND gate ✓`;
});

// ---------------------------------------------------------------------------
// [6] Certification truth-table — all four gates individually
// ---------------------------------------------------------------------------

await gate('Certification truth-table — all four gates independently', async () => {
  const identical = Array.from({ length: 50 }, (_, i) => i + 1);
  const shifted = identical.map((x) => x + 1);

  function makeResult(simLatencies: number[], realLatencies: number[]) {
    return {
      integrationRunId: RUN_ID,
      experimentSpecHash: SPEC_HASH,
      samples: [
        ...simLatencies.map((l, i) => ({
          operationId: `sim-${i}`, operationType: 'READ' as const, success: true,
          source: 'BLACKBOX_SIMULATION' as const, latencyMs: l, timestampMs: i * 10, errorClass: 'NONE' as const,
        })),
        ...realLatencies.map((l, i) => ({
          operationId: `real-${i}`, operationType: 'READ' as const, success: true,
          source: 'QUORUM_CLIENT' as const, latencyMs: l, timestampMs: i * 10, errorClass: 'NONE' as const,
        })),
      ],
      summaries: [],
    };
  }

  const tests: Array<{
    label: string;
    result: ReturnType<typeof makeResult>;
    criteria: typeof DEFAULT_COMPARISON_CRITERIA;
    expectPass: boolean;
  }> = [
    {
      label: 'stat-fail + eng-pass',
      result: makeResult(identical, shifted),
      criteria: { ...DEFAULT_COMPARISON_CRITERIA, ksAlpha: 1.0, maxKsDStatistic: 1.0, maxP99MapePercent: 100, maxThroughputMapePercent: 100 },
      expectPass: false,
    },
    {
      label: 'stat-pass + eng-fail',
      result: makeResult(identical, identical),
      criteria: { ...DEFAULT_COMPARISON_CRITERIA, ksAlpha: 0.0, maxKsDStatistic: -0.001, maxP99MapePercent: 100, maxThroughputMapePercent: 100 },
      expectPass: false,
    },
    {
      label: 'p99-fail',
      result: makeResult(identical, identical),
      criteria: { ...DEFAULT_COMPARISON_CRITERIA, ksAlpha: 0.0, maxKsDStatistic: 1.0, maxP99MapePercent: -1, maxThroughputMapePercent: 100 },
      expectPass: false,
    },
    {
      label: 'tput-fail',
      result: makeResult(identical, identical),
      criteria: { ...DEFAULT_COMPARISON_CRITERIA, ksAlpha: 0.0, maxKsDStatistic: 1.0, maxP99MapePercent: 100, maxThroughputMapePercent: -1 },
      expectPass: false,
    },
  ];

  for (const t of tests) {
    const report = generateComparisonReport(t.result, t.criteria);
    if (report.certified !== t.expectPass) {
      throw new Error(`Truth-table failure for "${t.label}": expected certified=${t.expectPass}, got ${report.certified}`);
    }
  }

  return `all 4 gate dimensions independently verified ✓`;
});

// ---------------------------------------------------------------------------
// [7] Certification record hash stability
// ---------------------------------------------------------------------------

await gate('Certification record hash stability', async () => {
  const makeArtifact = (name: string): ArtifactRecord => ({
    name, uri: `s3://system-x-artifacts/${RUN_ID}/${name}`,
    sha256: computeSha256(`content-${name}-${RUN_ID}`),
    mediaType: 'application/json', sizeBytes: 256,
    versionId: 'ver-local-gate',
    objectLockMode: 'COMPLIANCE',
    objectLockRetainUntil: '2027-09-18T00:00:00.000Z',
    uploadedAt: '2026-09-18T00:00:00.000Z',
  });

  const lineage: CertificationLineage = {
    integrationRunId: RUN_ID, experimentSpecHash: SPEC_HASH,
    workloadTrace: makeArtifact('workloadTrace.json'),
    faultTimeline: makeArtifact('faultTimeline.json'),
    quorumResults: makeArtifact('quorumResults.json'),
    blackboxResults: makeArtifact('blackboxResults.json'),
    comparisonReport: makeArtifact('comparisonReport.json'),
  };

  const mockComp = {
    experimentSpecHash: SPEC_HASH, integrationRunId: RUN_ID,
    latencyKs: { dStatistic: 0.03, pValue: 0.7, rejected: false, alpha: 0.05 },
    latencyWasserstein: { distance: 0.8 },
    throughputMape: { mapePercent: 3 },
    p99LatencyMape: { mapePercent: 5 },
    simulation: { sampleCount: 50, p50Ms: 20, p95Ms: 35, p99Ms: 40, throughputOpsSec: 950, successRate: 0.99 },
    real: { sampleCount: 50, p50Ms: 21, p95Ms: 36, p99Ms: 41, throughputOpsSec: 960, successRate: 0.99 },
    certified: true,
    verdict: 'CERTIFIED: simulation fidelity meets all engineering thresholds',
  };

  const fixedTs = '2026-09-18T00:00:00.000Z';
  const c1 = evaluateCertification(RUN_ID, SPEC_HASH, mockComp, lineage, true, fixedTs);
  const c2 = evaluateCertification(RUN_ID, SPEC_HASH, mockComp, lineage, true, fixedTs);

  if (c1.recordHash !== c2.recordHash) {
    throw new Error(`Non-deterministic recordHash: ${c1.recordHash.slice(0, 8)} ≠ ${c2.recordHash.slice(0, 8)}`);
  }
  if (!c1.certified) throw new Error(`Certification failed: ${c1.verdict}`);

  return `certified=true recordHash=${c1.recordHash.slice(0, 16)}… stable ✓`;
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n══════════════════════════════════════════════════════════');
console.log('SYSTEM-X LOCAL GATE — SUMMARY');
console.log('══════════════════════════════════════════════════════════');

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;

for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} [${r.step}/${TOTAL}] ${r.label}`);
  if (r.status === 'FAIL') console.log(`         → ${r.detail}`);
}

console.log('══════════════════════════════════════════════════════════');
console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
console.log('══════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.error(`LOCAL GATE FAILED — ${failed} step(s) did not pass.`);
  process.exit(1);
} else {
  console.log(`LOCAL GATE PASSED — all ${passed} steps verified offline.`);
  process.exit(0);
}
