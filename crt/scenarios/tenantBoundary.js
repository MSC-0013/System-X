import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCommerceApiRouter } from '../api/commerceApi.js';
import { createCommerceAuthenticator } from '../api/commerceAuth.js';

export async function measureTenantBoundary(suite) {
    const suffix = randomUUID();
    const identities = ['a', 'b'].map(label => ({
        token: randomBytes(32).toString('base64url'), tenantId: 'fixture-' + suffix + '-' + label,
        customerId: 'same-shopper', role: 'inventory-admin',
    }));
    const authenticate = createCommerceAuthenticator(JSON.stringify(identities.map(({ token, ...identity }) => ({
        ...identity, tokenSha256: createHash('sha256').update(token).digest('hex'),
    }))));
    const router = createCommerceApiRouter({ ...suite, authenticate });
    const server = createServer(async (req, res) => {
        let body = '';
        for await (const part of req) body += part;
        if (!await router(req, res, new URL(req.url, 'http://127.0.0.1').pathname, body)) res.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = async (path, identity, body) => {
        const response = await fetch(base + path, {
            headers: { 'Content-Type': 'application/json', ...(identity ? { Authorization: 'Bearer ' + identity.token } : {}) },
            ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(6000),
        });
        return { status: response.status, data: await response.json() };
    };
    try {
        const [a, b] = identities;
        const sku = 'same-sku';
        const adjust = (actor, payload) => request('/api/inventory/adjust', actor, { sku, ...payload });
        assert.equal((await adjust(a, { available: 1 })).status, 200);
        assert.equal((await adjust(b, { available: 10 })).status, 200);
        const sale = await request('/api/checkout', a, {
            idempotencyKey: 'first-sale', items: [{ sku, productId: 'fixture', quantity: 1, price: 1 }], totalAmount: 1,
        });
        assert.equal(sale.status, 200);
        const orderPath = '/api/orders/' + sale.data.order.orderId;
        const expected = [401, 404, 404, 403];
        const attempts = [
            await request(orderPath), await request(orderPath, b),
            await request(orderPath + '/cancel', b, {}), await adjust(b, { available: 99, tenantId: a.tenantId }),
        ];
        assert.deepEqual(attempts.map(x => x.status), expected);
        const first = (await request('/api/inventory/' + sku, a)).data;
        const second = (await request('/api/inventory/' + sku, b)).data;
        assert.deepEqual([first.available, first.reserved, second.available, second.reserved], [0, 1, 10, 0]);
        return { first: [first.available, first.reserved], second: [second.available, second.reserved], denied: expected };
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}
