import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { authorizeTarget, requestTarget } from '../../gate/benchmarkTarget.js';
import { runQuorumProcessExperiment } from '../../crt/scenarios/quorumProcess.js';
import { executeBenchmark } from '../../../BLACKBOX-X/packages/comparison/dist/index.js';

const dir = process.argv[2];
const origin = 'https://postman-echo.com';
const payload = { fixture: 'system-x-hosted-smoke', correlationId: randomUUID(), quantity: 1 };
const body = JSON.stringify(payload);
const rows = [];
const mode = 'REAL-INTEGRATION';
function record(project, featureId, expected, result, observed) {
  rows.push({ project, featureId, runtimeMode: mode, expected, result,
    observed: typeof observed === 'string' ? observed : JSON.stringify(observed) });
}

let portal;
try {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = 'http://127.0.0.1:' + port;
  portal = spawn(process.execPath, ['gate/server.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SYSTEM_X_BENCHMARK_ORIGINS: origin,
      SYSTEM_X_ACCESS_TOKEN: '', SYSTEM_X_EMBED_CRT: 'false', SYSTEM_X_ARTIFACTS_DIR: join(dir, 'artifacts') },
    stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true,
  });
  for (let i = 0; ; i++) {
    const response = await fetch(base + '/health', { signal: AbortSignal.timeout(500) }).catch(() => null);
    if (response?.ok) break;
    if (portal.exitCode !== null || i === 60) throw new Error('System-X portal did not become available.');
    await setTimeout(100);
  }
  const targetUrl = origin + '/post';
  const started = await fetch(base + '/api/benchmarks/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ targetUrl, name: 'Hosted Echo smoke', method: 'POST', requestCount: 1, concurrency: 1,
      routes: ['/post'], authorizedConfirmed: true, timeoutMs: 8000, body }),
  });
  const created = await started.json();
  assert.equal(started.status, 202, JSON.stringify(created));
  const url = base + '/api/benchmarks/runs/' + created.runId;
  let run;
  for (let i = 0; i < 100; i++) {
    run = await (await fetch(url, { signal: AbortSignal.timeout(500) })).json();
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.state)) break;
    await setTimeout(100);
  }
  assert.equal(run.state, 'COMPLETED');
  assert.equal(run.sentRequests, 1);
  assert.equal(run.completedRequests, 1);
  assert.equal(run.successfulRequests, 1);
  assert.equal(run.statusDistribution['200'], 1);
  assert.equal(run.config.body, undefined);
  record('System-X', 'SX-HOSTED-HTTP', 'System-X completes one allowlisted TLS POST through the real portal and does not persist the request body.',
    'PASS', { runId: run.runId, count: run.completedRequests, codes: run.statusDistribution, durationMs: run.elapsedMs });

  const target = await authorizeTarget(targetUrl, false, true);
  const echoed = await requestTarget(target, target.url, { method: 'POST', body,
    headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000), collect: true });
  assert.equal(echoed.status, 200);
  assert.deepEqual(JSON.parse(echoed.text).json, payload);
  const benchmark = await executeBenchmark({
    targetUrl: origin + '/get?probe=' + payload.correlationId, totalRequests: 1, concurrency: 1,
  });
  assert.equal(benchmark.successfulRequests, 1);
  assert.equal(benchmark.failedRequests, 0);
  assert.equal(benchmark.samplesUs.length, 1);
  assert.ok(benchmark.samplesUs[0] > 0);
  record('Blackbox-X', 'BX-HOSTED-HTTP', 'Blackbox-X records one live successful sample from the hosted Echo API.',
    'PASS', { requests: benchmark.totalRequests, observedLatencyUs: benchmark.samplesUs[0] });

  const observation = {
    endpoint: origin, correlationId: payload.correlationId, systemXRunId: run.runId,
    echoResult: JSON.parse(echoed.text).json, blackboxSamplesUs: benchmark.samplesUs,
    sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
  await writeFile(join(dir, 'hosted-evidence.json'), JSON.stringify(observation, null, 2));
  const proof = await runQuorumProcessExperiment(join(dir, 'quorum'), { observation });
  await writeFile(join(dir, 'quorum-processes.json'), JSON.stringify(proof, null, 2));
  const persisted = proof.rows.find(row => row.featureId === 'QL-HOSTED-OBSERVATION');
  assert.equal(persisted?.result, 'PASS', persisted?.observed ?? 'Quorum did not record hosted evidence.');
  rows.push({ ...persisted, project: 'Quorum Lab' });
} catch (error) {
  const pending = [
    ['System-X', 'SX-HOSTED-HTTP'], ['Blackbox-X', 'BX-HOSTED-HTTP'], ['Quorum Lab', 'QL-HOSTED-OBSERVATION'],
  ].filter(([, id]) => !rows.some(row => row.featureId === id));
  pending.forEach(([project, id], index) => record(project, id, 'Hosted endpoint workflow completes and records independent evidence.',
    index === 0 ? 'FAIL' : 'BLOCKED', index === 0 ? error.message : 'The upstream hosted workflow failed.'));
  console.error(error);
} finally {
  if (portal && portal.exitCode === null && portal.signalCode === null) {
    const exited = once(portal, 'exit');
    portal.kill();
    await exited;
  }
  await writeFile(join(dir, 'observations.json'), JSON.stringify(rows, null, 2));
}
