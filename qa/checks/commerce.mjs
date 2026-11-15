import { strict as assert } from 'node:assert';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { commercePrincipals, commerceRequest } from './commerce-fixture.mjs';

const dir = process.argv[2];
const { a, b, buyers, config } = commercePrincipals();
process.env.CRT_AUTH_PRINCIPALS = config;
const originalDir = process.cwd();
process.chdir(dir);
process.env.CRT_PORT = '0';
process.env.CRT_HOST = '127.0.0.1';
const { bootstrap } = await import('../../crt/server.js');
const records = [];
const state = await bootstrap();
if (!state.server.listening) await once(state.server, 'listening');
const base = 'http://127.0.0.1:' + state.server.address().port;
const suffix = randomUUID().slice(0, 8);
const request = (url, data, principal = a) => commerceRequest(base, url, data, principal);
async function check(featureId, expected, action) {
  const start = performance.now();
  try {
    const observed = await action();
    records.push({ featureId, runtimeMode: 'LOCAL-FALLBACK', expected, observed: JSON.stringify(observed), result: 'PASS', durationMs: Math.round(performance.now() - start) });
  } catch (error) {
    records.push({ featureId, runtimeMode: 'LOCAL-FALLBACK', expected, observed: error.message, result: 'FAIL', durationMs: Math.round(performance.now() - start) });
  }
  await writeFile(join(dir, 'observations.json'), JSON.stringify(records, null, 2));
}
const stock = (sku, available) => request('/api/inventory/adjust', { sku, available, tenantId: 'tenant-01' });
const requestFor = (sku, options = {}) => ({
  tenantId: 'tenant-01', customerId: 'qa-shopper', idempotencyKey: suffix + '-' + sku,
  items: [{ sku, productId: 'product-' + sku, price: 10, quantity: 1 }], totalAmount: 10, ...options,
});
let browser;
try {
  await check('SX-CRT-CATALOG', 'Actual storefront catalog returns items with a search and category filter.', async () => {
    const catalog = await request('/api/products?limit=3');
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.products.length, 3);
    const product = catalog.body.products[0];
    const filtered = await request('/api/products?search=' + encodeURIComponent(product.sku) + '&category=' + encodeURIComponent(product.category));
    assert.ok(filtered.body.products.some(item => item.sku === product.sku));
    assert.ok(filtered.body.products.every(item => item.category === product.category));
    return { total: catalog.body.total, filtered: filtered.body.products.length, sku: product.sku };
  });
  await check('SX-CRT-CART', 'Two client IDs update and read the same test cart sequentially.', async () => {
    const args = { cartId: 'qa-cart-' + suffix, item: { sku: 'PHONE-001', productId: 'p1', quantity: 1, price: 10 }, tenantId: 'tenant-01', customerId: 'qa-shopper' };
    assert.equal((await request('/api/cart/items', { ...args, clientId: 'device-a' })).status, 200);
    assert.equal((await request('/api/cart/items', { ...args, clientId: 'device-b' })).status, 200);
    const cart = await request('/api/cart/' + args.cartId);
    assert.equal(cart.body.items[0].quantity, 2);
    assert.equal(cart.body.version, 2);
    return { quantity: 2, version: 2, devices: 2 };
  });
  await check('SX-CRT-PAYMENT-COMPENSATION', 'Payment failure releases reserved stock and persists a failed order and event.', async () => {
    const sku = 'payment-' + suffix;
    assert.equal((await stock(sku, 1)).status, 200);
    const declined = await request('/api/checkout', requestFor(sku, { simulatePaymentFailure: true }));
    assert.equal(declined.status, 409);
    assert.equal(declined.body.error, 'PAYMENT_DECLINED');
    const now = (await request('/api/inventory/' + sku)).body;
    assert.equal(now.available, 1);
    assert.equal(now.reserved, 0);
    const order = (await request('/api/orders/' + declined.body.order.orderId)).body;
    assert.equal(order.status, 'FAILED');
    const events = (await request('/api/orders/' + order.orderId + '/events')).body.events;
    assert.ok(events.some(event => event.eventType === 'payment.authorization_failed'));
    return { available: now.available, reserved: now.reserved, orderStatus: order.status, eventCount: events.length };
  });
  await check('SX-CRT-FAILED-REPLAY', 'A replay of a failed checkout returns the same failure and order ID.', async () => {
    const sku = 'replay-' + suffix;
    await stock(sku, 0);
    const payload = requestFor(sku);
    const first = await request('/api/checkout', payload);
    const second = await request('/api/checkout', payload);
    assert.equal(first.status, 409);
    assert.equal(second.status, 409, 'failed checkout replay returned successful HTTP status');
    assert.equal(second.body.order.orderId, first.body.order.orderId);
    assert.equal(second.body.error, first.body.error);
    return { http: second.status, error: second.body.error, sameOrder: true };
  });
  await check('SX-CRT-CANCEL', 'Repeated cancellation restores one reservation once and emits one cancellation event.', async () => {
    const sku = 'cancel-' + suffix;
    await stock(sku, 1);
    const placed = await request('/api/checkout', requestFor(sku));
    assert.equal(placed.status, 200);
    const orderId = placed.body.order.orderId;
    const path = '/api/orders/' + orderId + '/cancel';
    assert.equal((await request(path, {})).status, 200);
    assert.equal((await request(path, {})).status, 200);
    const now = (await request('/api/inventory/' + sku)).body;
    assert.equal(now.available, 1, 'duplicate cancellation must not add stock');
    assert.equal(now.reserved, 0);
    const events = (await request('/api/orders/' + orderId + '/events')).body.events;
    assert.equal(events.filter(event => event.eventType === 'order.cancelled').length, 1);
    return { available: now.available, reserved: now.reserved, cancellations: 1 };
  });
  await check('SX-CRT-CONCURRENT-IDEMPOTENCY', 'Two simultaneous identical requests produce one order and one reservation.', async () => {
    const sku = 'duplicate-' + suffix;
    await stock(sku, 2);
    const data = requestFor(sku);
    const results = await Promise.all([request('/api/checkout', data), request('/api/checkout', data)]);
    assert.equal(results[0].body.order?.orderId, results[1].body.order?.orderId, 'concurrent replay produced distinct orders');
    const now = (await request('/api/inventory/' + sku)).body;
    assert.equal(now.available, 1);
    assert.equal(now.reserved, 1);
    return { attempts: 2, orders: 1, stockAvailable: 1, reservations: 1 };
  });
  await check('SX-CRT-INVENTORY-INPUT', 'Negative counts are rejected and cannot overwrite valid stock.', async () => {
    const sku = 'negative-' + suffix;
    await stock(sku, 1);
    assert.equal((await stock(sku, -1)).status, 400, 'negative stock adjustment accepted');
    const now = await request('/api/inventory/' + sku);
    assert.equal(now.body.available, 1);
    return { rejected: true, stockAvailable: 1 };
  });
  await check('SX-CRT-03-HTTP', 'From fresh stock of one, 20 concurrent HTTP checkouts persist exactly one confirmed order, 19 inventory failures and one reservation.', async () => {
    const sku = 'last-item-' + suffix;
    assert.equal((await stock(sku, 1)).status, 200);
    const before = (await request('/api/inventory/' + sku)).body;
    assert.equal(before.available, 1);
    assert.equal(before.reserved, 0);
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => {
      const customerId = 'buyer-' + index;
      return request('/api/checkout', requestFor(sku, { customerId, idempotencyKey: sku + '-' + customerId }), buyers[index]);
    }));
    assert.equal(responses.filter(response => response.status === 200 && response.body.success).length, 1);
    assert.equal(responses.filter(response => response.status === 409 && response.body.sagaStepFailed === 'INVENTORY_RESERVATION').length, 19);
    const ids = responses.map(response => response.body.order?.orderId);
    assert.ok(ids.every(Boolean));
    assert.equal(new Set(ids).size, 20);
    const persisted = await Promise.all(ids.map((id, index) => request('/api/orders/' + id, undefined, buyers[index])));
    assert.ok(persisted.every((response, i) => response.status === 200 && response.body.orderId === ids[i] &&
      response.body.status === (responses[i].status === 200 ? 'CONFIRMED' : 'FAILED')));
    const winner = persisted.find(response => response.body.status === 'CONFIRMED').body;
    assert.deepEqual(winner.items.map(item => [item.sku, item.quantity]), [[sku, 1]]);
    const inventory = (await request('/api/inventory/' + sku)).body;
    assert.equal(inventory.available, 0);
    assert.equal(inventory.reserved, 1);
    const events = (await request('/api/orders/' + winner.orderId + '/events', undefined, buyers[ids.indexOf(winner.orderId)])).body.events;
    assert.equal(events.filter(event => event.eventType === 'inventory.reserved').length, 1);
    return { attempts: responses.length, confirmed: 1, rejected: 19, distinctPersistedOrders: ids.length,
      available: inventory.available, reserved: inventory.reserved, winner: winner.orderId };
  });
  await check('SX-CRT-TENANT-HTTP', 'An isolated tenant cannot overwrite another tenant’s stock for the same SKU or fetch its order.', async () => {
    const sku = 'tenant-boundary-' + suffix;
    assert.equal((await stock(sku, 2)).status, 200);
    const sale = await request('/api/checkout', requestFor(sku));
    assert.equal(sale.status, 200);
    const overwrite = await request('/api/inventory/adjust', { sku, available: 15, tenantId: 'tenant-02' }, b);
    const firstTenantRead = await request('/api/inventory/' + sku + '?tenantId=tenant-01');
    const secondTenantRead = await request('/api/inventory/' + sku, undefined, b);
    const anonymousOrderRead = await request('/api/orders/' + sale.body.order.orderId + '?tenantId=tenant-02', undefined, null);
    const crossTenantRead = await request('/api/orders/' + sale.body.order.orderId, undefined, b);
    const spoof = await request('/api/inventory/adjust', { sku, available: 99, tenantId: 'tenant-01' }, b);
    const observed = { secondTenantAdjustmentStatus: overwrite.status, firstTenantAvailable: firstTenantRead.body.available,
      firstTenantReserved: firstTenantRead.body.reserved, otherTenantOrderReadStatus: anonymousOrderRead.status };
    assert.ok(overwrite.status === 200 && secondTenantRead.body.available === 15 &&
      firstTenantRead.body.available === 1 && firstTenantRead.body.reserved === 1 &&
      anonymousOrderRead.status === 401 && crossTenantRead.status === 404 && spoof.status === 403,
    JSON.stringify({ ...observed, secondTenantAvailable: secondTenantRead.body.available, crossTenantRead: crossTenantRead.status, spoof: spoof.status }));
    return observed;
  });
  await check('SX-CRT-STOREFRONT-UI', 'Rendered storefront loads real items, searches by SKU and shows matching results.', async () => {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      await page.goto(base);
      await page.locator('[onclick*="showView(\\\'storefront\\\')"]').first().click();
      await page.locator('#product-grid h4').first().waitFor();
      const searchResponse = page.waitForResponse(response => response.url().includes('search=PHONE-001'));
      await page.locator('#catalog-search').fill('PHONE-001');
      await searchResponse;
      await page.locator('#product-grid').getByText(/PHONE-001/).first().waitFor({ timeout: 2500 });
      assert.deepEqual(pageErrors, []);
      assert.equal(await page.locator('#product-grid h4').count(), 1);
      return { resultCount: await page.locator('#product-grid h4').count(), pageErrors };
    } finally {
      await page.screenshot({ path: join(dir, 'storefront.png') });
      await writeFile(join(dir, 'page-errors.json'), JSON.stringify(pageErrors));
    }
  });
  await check('SX-CRT-STATUS', 'Actual /api/status returns active nodes without crashing the HTTP server.', async () => {
    const status = await request('/api/status');
    assert.equal(status.status, 200);
    assert.ok(Array.isArray(status.body.activeNodes));
    return { activeNodes: status.body.activeNodes.length };
  });
} finally {
  await browser?.close();
  await new Promise(done => state.server.close(done));
  await state.adapter.shutdownCluster();
  process.chdir(originalDir);
}
