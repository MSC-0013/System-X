import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { tmpdir } from 'node:os';
import { setTimeout } from 'node:timers/promises';


const data = { sku: 'SX-CHROME-42', quantity: 7, label: 'Chrome custom payload' };
const requests = [];
let delayMs = 8;
let target;
const fixture = createServer(async (req, res) => {
  if (req.url === '/sitemap.xml') {
    res.setHeader('Content-Type', 'application/xml');
    res.end('<urlset><url><loc>' + target + '/v1/read</loc></url><url><loc>' + target + '/v1/fail</loc></url><url><loc>http://127.0.0.1:1/no</loc></url></urlset>');
    return;
  }
  if (req.url === '/redirect') {
    res.writeHead(302, { Location: 'http://169.254.169.254/' }).end();
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const payload = raw ? JSON.parse(raw) : null;
  requests.push({ path: req.url, method: req.method, payload });
  await setTimeout(delayMs);
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(req.url === '/v1/fail' ? 429 : req.url === '/v1/echo' ? 201 : 200);
  res.end(JSON.stringify(payload ?? data));
});
const listen = server => new Promise((accept, reject) => server.listen(0, '127.0.0.1', accept).once('error', reject));
await listen(fixture);
target = 'http://127.0.0.1:' + fixture.address().port;
const reservation = createServer();
await listen(reservation);
const port = reservation.address().port;
await new Promise(accept => reservation.close(accept));
const base = 'http://127.0.0.1:' + port;
const work = await mkdtemp(join(tmpdir(), 'system-x-ui-'));
const artifacts = join(work, 'artifacts');
await mkdir(artifacts);
const screenshotDir = process.env.SYSTEM_X_SCREENSHOT_DIR ?? work;
await mkdir(screenshotDir, { recursive: true });
const token = 'local-chrome-test-fixture-only';
const auth = 'Basic ' + Buffer.from('system-x:' + token).toString('base64');
let service;
let browser;
const errors = [];
let logs = '';
async function start() {
  service = spawn(process.execPath, ['gate/server.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SYSTEM_X_ACCESS_TOKEN: token,
      SYSTEM_X_LOCAL_BENCHMARK_ORIGINS: target, SYSTEM_X_ARTIFACTS_DIR: artifacts },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  service.stdout.on('data', bytes => logs += bytes);
  service.stderr.on('data', bytes => logs += bytes);
  for (let i = 0; i < 75; i++) {
    if (service.exitCode !== null) throw new Error(logs);
    const status = await fetch(base + '/health').catch(() => null);
    if (status?.ok) return;
    await setTimeout(120);
  }
  throw new Error('Portal did not start. ' + logs);
}
async function stop() {
  if (service?.exitCode === null && service?.signalCode === null) {
    const exited = new Promise(accept => service.once('exit', accept));
    service.kill();
    await exited;
  }
}
const api = (path, body) => fetch(base + path, { headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
try {
  await start();
  assert.equal((await fetch(base + '/')).status, 401);
  const options = { url: target + '/v1/read', allowLocalhost: true, authorizedConfirmed: true };
  assert.equal((await api('/api/benchmarks/discover-routes', { ...options, authorizedConfirmed: false })).status, 400);
  assert.equal((await api('/api/benchmarks/start', { ...options, routes: ['//127.0.0.1:1/escape'] })).status, 400);
  const redirect = await (await api('/api/benchmarks/validate-target', { ...options, url: target + '/redirect' })).json();
  assert.equal(redirect.valid, false);
  assert.equal(redirect.statusCode, 302);
  for (const host of ['169.254.169.254', '[::ffff:127.0.0.1]', '[fc00::1]', '192.168.0.1']) {
    assert.equal((await api('/api/benchmarks/discover-routes', { ...options, url: 'http://' + host })).status, 400);
  }
  const cors = await fetch(base + '/api/experiment/run', { method: 'POST', headers: { Authorization: auth, Origin: 'https://external.invalid' } });
  assert.equal(cors.status, 403);

  const chrome = process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : { channel: 'chrome' }), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, httpCredentials: { username: 'system-x', password: token }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#svc-system').getByText('ONLINE', { exact: true }).waitFor();
  const services = { systemX: 'ONLINE' };
  if (process.env.BLACKBOX_URL && process.env.QUORUM_URL) {
    await page.locator('#svc-blackbox').getByText('ONLINE', { exact: true }).waitFor();
    await page.locator('#svc-quorum').getByText('ONLINE', { exact: true }).waitFor();
    services.blackboxApi = 'ONLINE';
    services.quorumApi = 'ONLINE';
  }
  await page.screenshot({ path: join(screenshotDir, 'system-x-overview.png') });
  await page.getByRole('button', { name: 'New benchmark' }).click();
  await page.locator('#target-url-input').fill(options.url);
  await page.getByRole('button', { name: /Validate Target/ }).click();
  await page.getByText(/Confirm you own this target/).waitFor();
  assert.equal(await page.locator('#bench-next').isDisabled(), true);
  await page.locator('#chk-authorized-confirm').check();
  await page.locator('#chk-allow-localhost').check();
  await page.getByRole('button', { name: /Validate Target/ }).click();
  await page.getByText(/Target responded with HTTP 200/).waitFor();
  await page.getByRole('button', { name: /Discover Routes via Sitemap/ }).click();
  await page.getByText('2 discovered (sitemap.xml)').waitFor();
  assert.equal(await page.locator('#cfg-routes').inputValue(), '/v1/read, /v1/fail');
  await page.locator('#bench-next').click();
  async function benchmark(name, method, routes, count, body = '') {
    await page.locator('#cfg-test-name').fill(name);
    await page.locator('#cfg-method').selectOption(method);
    await page.locator('#cfg-routes').fill(routes);
    await page.locator('#cfg-requests').fill(String(count));
    await page.locator('#cfg-concurrency').fill('2');
    await page.locator('#cfg-body').fill(body);
    await page.locator('#bench-start').click();
    await page.locator('#res-run-state').getByText('COMPLETED', { exact: true }).waitFor();
    const runId = await page.locator('#res-run-id').innerText();
    assert.match(runId, /^bench-run-/);
    return { runId, counts: await page.locator('#res-counts').innerText() };
  }
  const first = await benchmark('Chrome baseline', 'GET', '/v1/read, /v1/fail', 12);
  assert.equal(first.counts, '6 pass / 6 fail');
  await page.locator('#inspector-filter').selectOption('FAILURE');
  await page.getByText('HTTP 429', { exact: true }).first().waitFor();
  const report = await (await api('/artifacts/' + first.runId + '/report.html')).text();
  assert.ok(report.includes("/v1/fail"));
  await page.screenshot({ path: join(screenshotDir, 'system-x-benchmark.png'), fullPage: true });
  async function next() {
    await page.getByRole('button', { name: 'Run Another Test' }).click();
    await page.locator('#bench-next').click();
  }
  await next();
  delayMs = 140;
  const slower = await benchmark('Chrome slower variant', 'GET', '/v1/read, /v1/fail', 12);
  assert.equal(slower.counts, first.counts);
  await next();
  const written = await benchmark('Chrome JSON write', 'POST', '/v1/echo', 6, JSON.stringify(data));
  assert.equal(written.counts, '6 pass / 0 fail');
  const writes = requests.filter(entry => entry.method === 'POST');
  assert.equal(writes.length, 6);
  for (const request of writes) assert.deepEqual(request.payload, data);
  const savedWrite = await (await api('/api/benchmarks/runs/' + written.runId)).json();
  assert.equal(savedWrite.config.body, undefined);

  await page.locator('#tabnav-compare').click();
  await page.locator('#cmp-baseline-select option[value="' + first.runId + '"]').waitFor({ state: 'attached' });
  await page.locator('#cmp-baseline-select').selectOption(first.runId);
  await page.locator('#cmp-target-select').selectOption(slower.runId);
  await page.locator('button[onclick="executeComparison()"]').click();
  await page.locator('#cmp-verdict-box').waitFor();
  const comparison = await page.locator('#cmp-verdict-badge').innerText();
  assert.match(comparison, /^REGRESSED$/);

  for (const id of ['overview','website','compare','model','quorum','crt','simulation','reports']) {
    await page.locator('#tabnav-' + id).click();
    await page.locator('#view-' + id).waitFor();
  }
  await page.locator('#tabnav-crt').click();
  const lastItem = page.getByRole('row').filter({ hasText: 'One item, 20 buyers' });
  const scenarioResponse = page.waitForResponse(response => response.url().endsWith('/api/crt/scenarios/run/CRT-03'));
  await lastItem.getByRole('button', { name: 'Run' }).click();
  const lastItemResult = await (await scenarioResponse).json();
  assert.equal(lastItemResult.passed, true);
  assert.equal(lastItemResult.metrics.successfulRequests, 1);
  assert.equal(lastItemResult.metrics.failedRequests, 19);
  assert.equal(lastItemResult.metrics.oversoldItems, 0);
  await page.locator('#crt-res-CRT-03').getByText(/PASS/).waitFor();
  const blockedScenario = await (await api('/api/crt/scenarios/run/CRT-11', {})).json();
  assert.equal(blockedScenario.status, 'UNVERIFIED');
  await page.locator('#tabnav-simulation').click();
  await page.getByRole('button', { name: /Run Local Experiment/ }).click();
  await page.locator('#sim-status-badge').getByText(/COMPLETED/).waitFor({ timeout: 45000 });
  const status = await (await api('/api/experiment/status')).json();
  assert.equal(status.error, false);
  assert.equal(status.latestRun.summary.execution.operations, 150);
  assert.equal(status.latestRun.summary.execution.faultEvents.length, 4);
  assert.equal(status.latestRun.summary.certified, false);

  await page.locator('#nav-qa').click();
  await page.getByRole('heading', { name: 'QA evidence' }).waitFor();
  const evidence = await (await api('/api/qa/results')).json();
  const checks = evidence.checks.length;
  if (checks) {
    await page.getByRole('status').getByText(new RegExp('^' + checks + ' recorded checks')).waitFor();
    const selected = evidence.checks.at(-1);
    await page.getByLabel('Check', { exact: true }).selectOption(selected.featureId);
    await page.getByText(selected.status, { exact: true }).first().waitFor();
    assert.ok((await page.locator('#qa-detail').innerText()).includes(selected.runtimeMode));
  } else {
    await page.getByText(/No execution records found/).waitFor();
    assert.equal(await page.getByLabel('Check', { exact: true }).isDisabled(), true);
  }
  await page.screenshot({ path: join(screenshotDir, 'system-x-qa.png'), fullPage: true });

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(base + '/#overview');
  assert.equal(await mobile.locator('.ops-hero h1').isVisible(), true);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await mobile.screenshot({ path: join(screenshotDir, 'system-x-mobile.png'), fullPage: true });
  await context.close();

  await stop();
  await start();
  const samples = await (await api('/api/benchmarks/runs/' + first.runId + '/requests?status=FAILURE')).json();
  assert.equal(samples.total, 6);
  assert.equal(samples.samples.every(sample => sample.statusCode === 429), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ chrome: browser.version(), services, screenshotDir, artifacts, baseline: first, slower, written, comparison, qaChecksDisplayed: checks,
    lastItem: lastItemResult.metrics, experiment: status.latestRun.summary.execution,
    certified: status.latestRun.summary.certified, browserErrors: errors }, null, 2));
} finally {
  await browser?.close();
  await stop();
  fixture.close();
}

