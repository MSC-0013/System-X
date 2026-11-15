import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { commercePrincipals, commerceRequest } from './commerce-fixture.mjs';

if (process.argv[2] === '--server') {
  const { bootstrap } = await import('../../crt/server.js');
  const { server } = await bootstrap();
  if (!server.listening) await once(server, 'listening');
  process.send({ port: server.address().port, pid: process.pid });
} else {
  await run();
}

async function run() {
  const dir = process.argv[2];
  const records = [];
  const processHistory = [];
  const children = [];
  const scope = 'qa-' + randomUUID();
  const { a, b, buyers, config } = commercePrincipals();
  const sku = 'PHASE-3-LAST-ITEM';
  const secretFile = process.env.QA_SESSION_FILE ?? join(tmpdir(), 'portfolio-qa-session.json');
  const cases = {
    'SX-CRT-SHARED-ACCESS': 'Two real API processes isolate same-SKU tenants, deny forged identities and owner-only order/cart access.',
    'SX-CRT-SHARED-RACE': 'Twenty simultaneous requests split across both processes leave one reservation and 20 correct persisted orders.',
    'SX-CRT-SHARED-RESTART': 'Concurrent idempotent requests across both processes share one order. Restart persists that order, reservation and events.',
  };
  const add = (featureId, result, observed) => records.push({
    featureId, runtimeMode: 'FULL-INFRASTRUCTURE', expected: cases[featureId], result, observed,
  });
  async function check(id, operation) {
    try { add(id, 'PASS', JSON.stringify(await operation())); }
    catch (error) { add(id, 'FAIL', error.message); }
  }
  let dbUrl;
  try {
    try {
      const session = JSON.parse(await readFile(secretFile, 'utf8'));
      assert.match(session.project, /^portfolio-qa-\d+$/);
      const healthy = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}',
        session.project + '-mysql-1'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      assert.equal(healthy.trim(), 'healthy');
      dbUrl = 'mysql://blackbox_qa:' + encodeURIComponent(session.mysqlPassword) + '@127.0.0.1:3308/blackbox_qa';
    } catch {
      for (const id of Object.keys(cases)) add(id, 'BLOCKED', 'Dedicated QA MySQL container is not healthy.');
      return;
    }
    async function launch(name) {
      const cwd = await mkdtemp(join(tmpdir(), 'crt-shared-' + name + '-'));
      const child = fork(fileURLToPath(import.meta.url), ['--server'], {
        cwd, stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true,
        env: { ...process.env, CRT_PORT: '0', CRT_HOST: '127.0.0.1', CRT_DATABASE_URL: dbUrl,
          CRT_DATA_NAMESPACE: scope, CRT_AUTH_PRINCIPALS: config },
      });
      children.push(child);
      const signal = AbortSignal.timeout(15000);
      const [ready] = await Promise.race([
        once(child, 'message', { signal }), once(child, 'exit', { signal }).then(() => { throw new Error('API child exited before readiness'); }),
      ]);
      const base = 'http://127.0.0.1:' + ready.port;
      const health = await commerceRequest(base, '/api/health');
      assert.equal(health.body.cluster, 'MySQL transactional commerce');
      processHistory.push({ name, pid: ready.pid, port: ready.port, backend: health.body.cluster });
      return { child, request: (pathname, data, principal) => commerceRequest(base, pathname, data, principal) };
    }
    const first = await launch('first');
    const second = await launch('second');
    assert.notEqual(first.child.pid, second.child.pid);
    const checkout = (key, itemSku = sku) => ({
      idempotencyKey: key, items: [{ sku: itemSku, productId: 'product-' + itemSku, quantity: 1, price: 10 }], totalAmount: 10,
    });
    const adjust = (server, principal, itemSku, available) => server.request('/api/inventory/adjust', { sku: itemSku, available }, principal);
    await check('SX-CRT-SHARED-ACCESS', async () => {
      const accessSku = sku + '-ACCESS';
      assert.equal((await adjust(first, a, accessSku, 2)).status, 200);
      assert.equal((await adjust(second, b, accessSku, 15)).status, 200);
      assert.equal((await adjust(second, buyers[0], accessSku, 99)).status, 403);
      const result = await first.request('/api/checkout', checkout('scope-key', accessSku), a);
      assert.equal(result.status, 200);
      const orderRoute = '/api/orders/' + result.body.order.orderId;
      for (const [url, data] of [[orderRoute], [orderRoute + '/events'], [orderRoute + '/cancel', {}]]) {
        assert.equal((await second.request(url, data)).status, 401);
        assert.equal((await second.request(url, data, b)).status, 404);
        assert.equal((await second.request(url, data, buyers[0])).status, 404);
      }
      assert.equal((await second.request('/api/inventory/adjust', { sku: accessSku, tenantId: a.tenantId, available: 99 }, b)).status, 403);
      const cart = { cartId: 'same-cart', item: checkout('scope-key', accessSku).items[0] };
      assert.equal((await first.request('/api/cart/items', cart, a)).status, 200);
      assert.equal((await second.request('/api/cart/same-cart', undefined, b)).status, 404);
      assert.equal((await second.request('/api/cart/same-cart', undefined, buyers[0])).status, 404);
      assert.equal((await second.request('/api/cart/items', cart, b)).status, 200);
      const stockA = (await second.request('/api/inventory/' + accessSku + '?tenantId=tenant-02', undefined, a)).body;
      const stockB = (await first.request('/api/inventory/' + accessSku, undefined, b)).body;
      assert.deepEqual([stockA.available, stockA.reserved, stockB.available, stockB.reserved], [1, 1, 15, 0]);
      return { stockA: [stockA.available, stockA.reserved], stockB: [stockB.available, stockB.reserved], protectedOrderRoutes: 3 };
    });
    await check('SX-CRT-SHARED-RACE', async () => {
      assert.equal((await adjust(first, a, sku, 1)).status, 200);
      const stock = (await second.request('/api/inventory/' + sku, undefined, a)).body;
      assert.deepEqual([stock.available, stock.reserved], [1, 0]);
      const live = [first, second];
      const responses = await Promise.all(buyers.map((principal, i) => live[i % 2].request('/api/checkout', checkout('one-item'), principal)));
      assert.equal(responses.filter(response => response.status === 200 && response.body.success).length, 1);
      assert.equal(responses.filter(response => response.status === 409 && response.body.sagaStepFailed === 'INVENTORY_RESERVATION').length, 19);
      const ids = responses.map(response => response.body.order?.orderId);
      assert.ok(ids.every(Boolean));
      assert.equal(new Set(ids).size, 20);
      const persisted = await Promise.all(ids.map((id, i) => live[(i + 1) % 2].request('/api/orders/' + id, undefined, buyers[i])));
      assert.ok(persisted.every((response, i) => response.status === 200 && response.body.orderId === ids[i] &&
        response.body.status === (responses[i].status === 200 ? 'CONFIRMED' : 'FAILED')));
      const final = (await second.request('/api/inventory/' + sku, undefined, a)).body;
      assert.deepEqual([final.available, final.reserved], [0, 1]);
      return { attemptsPerProcess: [10, 10], confirmed: 1, rejected: 19, persistedOrders: ids.length, final: [final.available, final.reserved] };
    });
    await check('SX-CRT-SHARED-RESTART', async () => {
      const retrySku = sku + '-RETRY';
      assert.equal((await adjust(first, a, retrySku, 2)).status, 200);
      const payload = checkout('same-key', retrySku);
      const orders = await Promise.all([first.request('/api/checkout', payload, a), second.request('/api/checkout', payload, a)]);
      assert.ok(orders.every(response => response.status === 200));
      const orderId = orders[0].body.order.orderId;
      assert.equal(orders[1].body.order.orderId, orderId);
      assert.equal(orders.filter(response => response.body.isDuplicateSubmission).length, 1);
      const exited = once(first.child, 'exit');
      first.child.kill('SIGKILL');
      await exited;
      const restarted = await launch('restarted');
      const replay = await restarted.request('/api/checkout', payload, a);
      assert.equal(replay.body.order.orderId, orderId);
      assert.equal(replay.body.isDuplicateSubmission, true);
      const events = (await restarted.request('/api/orders/' + orderId + '/events', undefined, a)).body.events;
      assert.equal(events.filter(event => event.eventType === 'order.confirmed').length, 1);
      const final = (await restarted.request('/api/inventory/' + retrySku, undefined, a)).body;
      assert.deepEqual([final.available, final.reserved], [1, 1]);
      return { originalPid: first.child.pid, restartedPid: restarted.child.pid, oneOrder: true, confirmations: 1, final: [final.available, final.reserved] };
    });
  } catch (error) {
    for (const id of Object.keys(cases).filter(key => !records.some(record => record.featureId === key))) add(id, 'FAIL', error.message);
  } finally {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }));
    if (dbUrl) {
      const connection = await mysql.createConnection(dbUrl);
      try {
        const [documents] = await connection.execute('DELETE FROM crt_documents WHERE scope = ?', [scope]);
        await connection.execute('DELETE FROM crt_tenant_transactions WHERE scope = ?', [scope]);
        processHistory.push({ scope, removedFixtureDocuments: documents.affectedRows });
      } finally { await connection.end(); }
    }
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'processes.json'), JSON.stringify(processHistory, null, 2));
    await writeFile(join(dir, 'observations.json'), JSON.stringify(records, null, 2));
  }
}
