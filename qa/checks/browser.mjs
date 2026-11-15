import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { executeNode } from '../run.mjs';

const [dir] = process.argv.slice(2);
const root = fileURLToPath(new URL('../../', import.meta.url));
const upstreams = [];
const processes = {};
async function port() {
  const server = createServer();
  await new Promise((done, fail) => server.listen(0, '127.0.0.1', done).once('error', fail));
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
async function start(name, cwd, script, health, env) {
  const portNumber = await port();
  const url = 'http://127.0.0.1:' + portNumber;
  const child = spawn(process.execPath, [script], {
    cwd: resolve(root, cwd), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(portNumber), ...env(portNumber) },
  });
  upstreams.push(child);
  let log = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => log = (log + bytes).slice(-5000));
  for (let i = 0; i < 135; i++) {
    if (child.exitCode !== null) throw new Error(name + ' exited. ' + log);
    const response = await fetch(url + health, { signal: AbortSignal.timeout(500) }).catch(() => null);
    if (response?.ok) {
      processes[name] = { pid: child.pid, endpoint: url + health, httpStatus: response.status };
      return url;
    }
    await setTimeout(100);
  }
  throw new Error(name + ' failed readiness. ' + log);
}
const outcomes = [];
try {
  const [blackbox, quorum] = await Promise.all([
    start('Blackbox-X', '../BLACKBOX-X', 'apps/blackbox-api/dist/server.js', '/health/live', p => ({ API_PORT: String(p) })),
    start('Quorum Lab', '../QUORUM LAB', 'apps/control-api/dist/main.js', '/health', p => ({ CONTROL_API_PORT: String(p), CONTROL_API_HOST: '127.0.0.1' })),
  ]);
  const log = join(dir, 'chrome.log');
  const status = await executeNode(['tests/chrome-portal-smoke.mjs'], root, log, {
    timeout: 110000,
    env: { BLACKBOX_URL: blackbox, QUORUM_URL: quorum, SYSTEM_X_SCREENSHOT_DIR: dir },
  });
  assert.equal(status.code, 0, 'Chrome test failed. See chrome.log.');
  const content = await readFile(log, 'utf8');
  const startJson = content.indexOf('{\n  "chrome"');
  const observed = JSON.parse(content.slice(startJson).trim());
  assert.deepEqual(observed.services, { systemX: 'ONLINE', blackboxApi: 'ONLINE', quorumApi: 'ONLINE' });
  await writeFile(join(dir, 'browser-result.json'), JSON.stringify(observed, null, 2));
  const data = [
    ['SX-BROWSER-SERVICES', 'All three live service endpoints yield online statuses in Chrome.', observed.services, 'REAL-INTEGRATION'],
    ['SX-BROWSER-NAVIGATION', 'All eight portal views open, and 390 px viewport stays within its width.', 'Eight navigations and mobile width assertion passed.', 'REAL-INTEGRATION'],
    ['SX-BROWSER-URL-SAFETY', 'Validate permission, and block redirect, cross-origin route, private range and forged cross-origin POST.', 'Target and security assertions in tests/chrome-portal-smoke.mjs passed.', 'REAL-INTEGRATION'],
    ['SX-BROWSER-DISCOVERY', 'Discover exactly two authorized-origin routes from controlled XML.', '/v1/read and /v1/fail; fixture external-origin entry excluded.', 'REAL-INTEGRATION'],
    ['SX-BROWSER-SSE-INSPECTOR', 'Render SSE completion with six successes and six 429s; inspector filters failures.', observed.baseline, 'REAL-INTEGRATION'],
    ['SX-BROWSER-CUSTOM-JSON', 'Six POSTs render success and deliver the exact original JSON fixture.', observed.written, 'REAL-INTEGRATION'],
    ['SX-BROWSER-REGRESSION', 'Independent slower baseline variant renders REGRESSED.', observed.comparison, 'REAL-INTEGRATION'],
    ['SX-BROWSER-RESTORE', 'Saved reports open and six filtered failure records survive restart.', 'Report and restart persistence assertions passed.', 'REAL-INTEGRATION'],
    ['SX-BROWSER-CRT', 'Browser starts embedded inventory race, one winner, no overselling.', observed.lastItem, 'LOCAL-FALLBACK'],
    ['SX-BROWSER-EXPERIMENT', 'Browser starts 150-operation experiment with applied faults and fail-closed certification.', { execution: observed.experiment, certified: observed.certified }, 'LOCAL-FALLBACK'],
    ['SX-BROWSER-QA', 'QA page renders check selection and status from the recorded evidence, or shows the empty state.', { checksDisplayed: observed.qaChecksDisplayed }, 'REAL-INTEGRATION'],
  ];
  for (const [featureId, expected, actual, runtimeMode] of data) {
    outcomes.push({ featureId, expected, observed: typeof actual === 'string' ? actual : JSON.stringify(actual), runtimeMode, result: 'PASS' });
  }
} catch (error) {
  outcomes.push({ featureId: 'SX-BROWSER-SUITE', expected: 'Actual Chrome completes portal workflow assertions.', observed: error.message, result: 'FAIL', runtimeMode: 'NOT ESTABLISHED' });
  console.error(error);
} finally {
  for (const child of upstreams) if (child.exitCode === null && child.signalCode === null) child.kill();
  await writeFile(join(dir, 'observations.json'), JSON.stringify(outcomes, null, 2));
  await writeFile(join(dir, 'processes.json'), JSON.stringify(processes, null, 2));
}
