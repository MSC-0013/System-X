import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runRealDemo } from '../../gate/runRealDemo.js';
import { referenceDistances, referenceMetrics } from './reference.mjs';
import { evaluateCertification } from '../../packages/certification-gate/src/certificationGate.js';

const dir = process.argv[2];
process.env.SYSTEM_X_ARTIFACTS_DIR = join(dir, 'artifacts');
await mkdir(process.env.SYSTEM_X_ARTIFACTS_DIR, { recursive: true });
const rows = [];
let metrics;
function check(featureId, expected, observed, pass, result) {
  rows.push({ featureId, expected, observed, result: result ?? (pass ? 'PASS' : 'FAIL'),
    seed: 1337, runtimeMode: 'LOCAL-FALLBACK' });
}
try {
  const summary = await runRealDemo();
  const artifact = join(process.env.SYSTEM_X_ARTIFACTS_DIR, summary.runId);
  const get = async filename => JSON.parse(await readFile(join(artifact, filename), 'utf8'));
  const realSamples = await get('telemetry/quorum.json');
  const simulatedSamples = await get('telemetry/blackbox.json');
  const comparison = await get('comparison.json');
  const normalized = await get('telemetry/normalized.json');
  const cert = await get('certification.json');
  const gateEvidence = await get('gates.json');
  const trace = await get('workload/trace.json');
  const schedule = await get('faults/timeline.json');
  const real = referenceMetrics(realSamples, s => s.realElapsedUs / 1000, s => s.wallTimeMs);
  const modeled = referenceMetrics(simulatedSamples, s => s.latencyUs / 1000, s => s.simulationTimeUs / 1000);
  const distances = referenceDistances(simulatedSamples.map(s => s.latencyUs / 1000), realSamples.map(s => s.realElapsedUs / 1000));
  const errors = { p99Relative: Math.abs(modeled.p99 - real.p99) / real.p99, throughputRelative: Math.abs(modeled.throughput - real.throughput) / real.throughput };
  metrics = { runId: summary.runId, real, modeled, distances, errors, actual: comparison.latencyKs, certified: cert.certified, traceHash: trace.traceHash, scheduleHash: schedule.timelineHash };
  const countsMatch = trace.entries.length === 150 && real.count === 150 && real.successes === summary.execution.successes;
  check('SX-COMPARE-EXECUTION', '150 measured Quorum operations; success count matches raw telemetry; 4 executed fault actions.', JSON.stringify({ trace: trace.entries.length, real: real.count, modeled: modeled.count, faults: schedule.executed }), countsMatch && schedule.executed.length === 4);
  const actualById = new Map(realSamples.map(sample => [sample.operationId, sample]));
  const modeledById = new Map(simulatedSamples.map(sample => [sample.operationId, sample]));
  const identityMatch = trace.entries.length === realSamples.length && realSamples.length === simulatedSamples.length &&
    actualById.size === realSamples.length && modeledById.size === simulatedSamples.length &&
    trace.entries.every(entry => {
      const id = 'op-' + entry.sequence;
      const actual = actualById.get(id);
      const predicted = modeledById.get(id);
      const offset = entry.scheduledOffsetUs ?? entry.sequence * 20000;
      const type = entry.operation === 'GET' ? 'READ' : 'WRITE';
      return actual && predicted && actual.key === entry.key && predicted.key === entry.key &&
        actual.clientId === entry.logicalClientId && predicted.clientId === entry.logicalClientId &&
        actual.operationType === type && predicted.operationType === type &&
        actual.offsetUs === offset && predicted.simulationTimeUs === offset && Number.isFinite(actual.actualOffsetMs);
    });
  check('SX-TRACE-IDENTITY', 'Independent oracle matches all canonical operation IDs, clients, keys, types and intended starts.', JSON.stringify({ matched: identityMatch, real: realSamples.length, simulated: simulatedSamples.length }), identityMatch);
  const statisticsMatch = normalized.summaries.every(item => {
    const expected = item.source === 'QUORUM_CLIENT' ? real : modeled;
    return item.totalSamples === expected.count && item.successCount === expected.successes &&
      item.p50Ms === expected.p50 && item.p95Ms === expected.p95 && item.p99Ms === expected.p99 &&
      Math.abs(item.throughputOpsSec - expected.throughput) < 1e-8;
  });
  check('SX-REFERENCE-METRICS', 'Raw counts, P50/P95/P99, success/error and throughput independently agree with normalizer.', JSON.stringify({ real, modeled }), statisticsMatch);
  check('SX-REFERENCE-DISTANCE', 'Independent ECDF D, asymptotic p, and quantile-coupling W1 agree.', JSON.stringify({ distances, reportedKs: comparison.latencyKs, reportedW1: comparison.latencyWasserstein.distance }),
    Math.abs(distances.d - comparison.latencyKs.dStatistic) < 1e-10 &&
    Math.abs(distances.pValue - comparison.latencyKs.pValue) < 1e-7 &&
    Math.abs(distances.wasserstein - comparison.latencyWasserstein.distance) < 1e-10);
  check('SX-G4', 'KS D ≤ 0.15, p ≥ 0.05, W1 ≤ 12 ms.', JSON.stringify(distances),
    distances.d <= .15 && distances.pValue >= .05 && distances.wasserstein <= 12);
  check('SX-G5', 'Empirical p99 < 25 ms and error rate < 1%.', JSON.stringify({ p99: real.p99, errorRate: real.errorRate }), real.p99 < 25 && real.errorRate < .01);
  for (const key of ['workloadTrace', 'faultTimeline', 'quorumResults', 'blackboxResults', 'comparisonReport']) {
    const entry = cert.lineage[key];
    const content = await readFile(join(artifact, entry.name));
    assert.equal(createHash('sha256').update(content).digest('hex'), entry.sha256, key);
    assert.notEqual(createHash('sha256').update(Buffer.concat([content, Buffer.from('tampered')])).digest('hex'), entry.sha256, key);
  }
  check('SX-ARTIFACT-DIGEST', 'All five SHA-256 checksums match and altered copies are rejected.', 'Five correct hashes and five changed hashes independently checked.', true);
  check('SX-CERT-FAIL-CLOSED', 'Missing object retention evidence cannot result in certification.', cert.verdict, cert.certified === false);
  const { integrationRunId, experimentSpecHash } = cert;
  const fabricated = { ...cert.lineage };
  for (const key of ['workloadTrace', 'faultTimeline', 'quorumResults', 'blackboxResults', 'comparisonReport']) {
    fabricated[key] = { ...fabricated[key], uri: 's3://nonexistent-probe/' + key, versionId: 'invented' };
  }
  const probe = evaluateCertification(integrationRunId, experimentSpecHash, { ...comparison, certified: true }, fabricated);
  const explicit = Object.keys(gateEvidence.gates);
  check('SX-CERT-METADATA-NEGATIVE', 'Plausible storage metadata cannot issue a master certificate; all G1–G8 decisions are recorded.',
    JSON.stringify({ metadataEligible: probe.metadataEligible, certified: probe.certified, explicit }),
    probe.metadataEligible && probe.certified === false && gateEvidence.integrationRunId === integrationRunId &&
      gateEvidence.traceHash === trace.traceHash && explicit.join(',') === 'G1,G2,G3,G4,G5,G6,G7,G8');
  check('SX-TRACE-PARITY', 'Both engines execute the same canonical arrivals, keys, and faults.', 'Request identities match. Blackbox models service timing only and does not execute the initial key state or peer-fault semantics.', false);
  check('SX-G6', 'No validation input reaches parameter selection.', 'Demo does not send a calibration request or evaluate a held-out run.', false, 'BLOCKED');
  check('SX-G7', 'Calibration converges within five iterations.', 'No optimizer is invoked by the demo.', false, 'BLOCKED');
  check('SX-G8', 'S3 object retention, version identity and immutable storage verified.', 'Local manifests and checksums only. No upload or retained object checked by this runner.', false, 'BLOCKED');
} catch (error) {
  check('SX-COMPARE-EXECUTION', 'Demo and independent reference checks finish.', error.message, false);
  console.error(error);
}
await writeFile(join(dir, 'observations.json'), JSON.stringify(rows, null, 2));
if (metrics) await writeFile(join(dir, 'reference-metrics.json'), JSON.stringify(metrics, null, 2));

