/**
 * I5 — Simulation ↔ Real Comparison: Main comparison engine.
 *
 * Takes NormalizedRunResult (from I4) and produces a ComparisonReport.
 * The comparison is between BLACKBOX_SIMULATION source and QUORUM_CLIENT source.
 *
 * IMPORTANT: Pure function — NO I/O performed here.
 * The BLACKBOX-X API is called via HTTP in I6 (calibration loop), not here.
 */
import type { NormalizedRunResult, SourceSummary } from '@system-x/result-normalizer';
import { percentile } from '@system-x/result-normalizer';
import type { ComparisonReport, ComparisonCriteria } from './types.js';
import { DEFAULT_COMPARISON_CRITERIA } from './types.js';
import { twoSampleKsTest, wassersteinDistance, computeMape } from './statistics.js';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a full ComparisonReport from a NormalizedRunResult.
 *
 * @param result    The normalized run result (I4 output).
 * @param criteria  Certification thresholds (defaults to DEFAULT_COMPARISON_CRITERIA).
 */
export function generateComparisonReport(
  result: NormalizedRunResult,
  criteria: ComparisonCriteria = DEFAULT_COMPARISON_CRITERIA,
): ComparisonReport {
  const simSummary = result.summaries.find((s) => s.source === 'BLACKBOX_SIMULATION');
  const realSummary = result.summaries.find((s) => s.source === 'QUORUM_CLIENT');

  const simLatencies = result.samples
    .filter((s) => s.source === 'BLACKBOX_SIMULATION')
    .map((s) => s.latencyMs);

  const realLatencies = result.samples
    .filter((s) => s.source === 'QUORUM_CLIENT')
    .map((s) => s.latencyMs);

  // KS test on latency distributions.
  const latencyKs = twoSampleKsTest(simLatencies, realLatencies, criteria.ksAlpha);

  // Wasserstein distance.
  const latencyWasserstein = wassersteinDistance(simLatencies, realLatencies);

  // MAPE on p99 latency and throughput.
  const simP99 = simSummary?.p99Ms ?? 0;
  const realP99 = realSummary?.p99Ms ?? 0;
  const p99LatencyMape = computeMape(realP99, simP99);

  const simThroughput = simSummary?.throughputOpsSec ?? 0;
  const realThroughput = realSummary?.throughputOpsSec ?? 0;
  const throughputMape = computeMape(realThroughput, simThroughput);

  // Certification decision.
  const ksPass =
    !latencyKs.rejected || latencyKs.dStatistic <= criteria.maxKsDStatistic;
  const p99Pass = p99LatencyMape.mapePercent <= criteria.maxP99MapePercent;
  const tputPass = throughputMape.mapePercent <= criteria.maxThroughputMapePercent;
  const certified = ksPass && p99Pass && tputPass;

  const reasons: string[] = [];
  if (!ksPass) reasons.push(`KS D=${latencyKs.dStatistic.toFixed(3)} exceeds max=${criteria.maxKsDStatistic}`);
  if (!p99Pass) reasons.push(`p99 MAPE=${p99LatencyMape.mapePercent.toFixed(1)}% exceeds max=${criteria.maxP99MapePercent}%`);
  if (!tputPass) reasons.push(`throughput MAPE=${throughputMape.mapePercent.toFixed(1)}% exceeds max=${criteria.maxThroughputMapePercent}%`);

  const verdict = certified
    ? 'CERTIFIED: simulation fidelity meets all engineering thresholds'
    : `NOT CERTIFIED: ${reasons.join('; ')}`;

  return {
    experimentSpecHash: result.experimentSpecHash,
    integrationRunId: result.integrationRunId,
    latencyKs,
    latencyWasserstein,
    throughputMape,
    p99LatencyMape,
    simulation: buildSummaryView(simSummary, simLatencies),
    real: buildSummaryView(realSummary, realLatencies),
    certified,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildSummaryView(
  summary: SourceSummary | undefined,
  latencies: number[],
): ComparisonReport['simulation'] {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    sampleCount: summary?.totalSamples ?? 0,
    p50Ms: summary?.p50Ms ?? percentile(sorted, 50),
    p95Ms: summary?.p95Ms ?? percentile(sorted, 95),
    p99Ms: summary?.p99Ms ?? percentile(sorted, 99),
    throughputOpsSec: summary?.throughputOpsSec ?? 0,
    successRate: summary?.successRate ?? 0,
  };
}
