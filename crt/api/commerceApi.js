import { createCommerceAuthenticator } from './commerceAuth.js';

const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const send = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
    return true;
};

export function createCommerceApiRouter(services) {
    const { catalog, inventory, cart, checkout, eventBus, adapter, commerceStore } = services;
    const authenticate = services.authenticate ?? createCommerceAuthenticator();
    return async (req, res, pathname, bodyText) => {
        // 0. GET /api/health
        if (req.method === 'GET' && pathname === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'UP',
                service: 'commerce-reliability-testbed',
                cluster: commerceStore ? 'MySQL transactional commerce' : 'Quorum Lab N=3 (W=2, R=2)',
                timestamp: new Date().toISOString(),
            }));
            return true;
        }
        // 0b. GET /api/status
        if (req.method === 'GET' && (pathname === '/api/status' || pathname === '/status')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ONLINE',
                service: 'commerce-reliability-testbed',
                cluster: commerceStore ? 'MySQL transactional commerce' : 'Quorum Lab N=3 (W=2, R=2)',
                activeNodes: adapter.getActiveNodes(),
                timestamp: new Date().toISOString(),
            }));
            return true;
        }
        // 1. GET /api/products
        if (req.method === 'GET' && pathname === '/api/products') {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const category = url.searchParams.get('category') ?? undefined;
            const search = url.searchParams.get('search') ?? undefined;
            const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
            const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
            const result = catalog.listProducts({ category, search, limit, offset });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return true;
        }
        // 2. GET /api/products/:id
        if (req.method === 'GET' && pathname.startsWith('/api/products/')) {
            const id = pathname.replace('/api/products/', '');
            const product = catalog.getProductById(id);
            if (!product) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Product not found' }));
                return true;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(product));
            return true;
        }
        if (!/^\/api\/(?:inventory|cart|checkout|orders)(?:\/|$)/.test(pathname)) return false;
        const principal = authenticate(req.headers.authorization);
        if (!principal) return send(res, 401, { error: 'Authentication required' });
        const { tenantId, customerId, role } = principal;
        const read = req.method === 'GET';
        const write = req.method === 'POST';
        let body = {};
        if (write && bodyText !== '') {
            try { body = JSON.parse(bodyText); }
            catch { return send(res, 400, { error: 'Invalid JSON object' }); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'Invalid JSON object' });
            if ((body.tenantId !== undefined && body.tenantId !== tenantId) ||
                (body.customerId !== undefined && body.customerId !== customerId)) {
                return send(res, 403, { error: 'Principal does not match requested identity' });
            }
        }
        const transact = operation => commerceStore ? commerceStore.transact(tenantId, operation) :
            checkout.serialize('tenant-write:' + tenantId, operation);
        const sku = /^\/api\/inventory\/([A-Za-z0-9_-]{1,128})$/.exec(pathname)?.[1];
        const cartId = /^\/api\/cart\/([A-Za-z0-9_-]{1,128})$/.exec(pathname)?.[1];
        const orderPath = /^\/api\/orders\/([A-Za-z0-9_-]{1,128})(?:\/(events|cancel))?$/.exec(pathname);
        const validItem = item => item && typeof item.sku === 'string' && identifier.test(item.sku) &&
            typeof item.productId === 'string' && identifier.test(item.productId) &&
            Number.isSafeInteger(item.quantity) && item.quantity > 0 && Number.isFinite(item.price) && item.price >= 0;
        try {
            if (read && sku) {
                const stock = await inventory.getStock(sku, undefined, tenantId);
                return stock ? send(res, 200, stock) : send(res, 404, { error: 'SKU not found' });
            }
            if (write && pathname === '/api/inventory/adjust') {
                if (role !== 'inventory-admin') return send(res, 403, { error: 'Inventory administrator required' });
                if (typeof body.sku !== 'string' || !identifier.test(body.sku) ||
                    !Number.isSafeInteger(body.available) || body.available < 0 || body.reserved !== undefined) {
                    return send(res, 400, { error: 'Provide a valid SKU and available stock. Reservations are managed by checkout.' });
                }
                const stock = await transact(async () => {
                    const current = await inventory.getStock(body.sku, undefined, tenantId);
                    return inventory.setStock(tenantId, body.sku, body.available, current?.reserved ?? 0);
                });
                return send(res, 200, stock);
            }
            if (write && pathname === '/api/cart/items') {
                if (typeof body.cartId !== 'string' || !identifier.test(body.cartId) || !validItem(body.item)) {
                    return send(res, 400, { error: 'Invalid cart item' });
                }
                const record = await transact(() => cart.addItem(body.cartId, customerId, tenantId, body.item, body.clientId));
                return send(res, 200, record);
            }
            if (read && cartId) {
                const record = await cart.getCart(cartId, undefined, tenantId, customerId);
                return record ? send(res, 200, record) : send(res, 404, { error: 'Cart not found' });
            }
            if (write && pathname === '/api/checkout') {
                if (typeof body.idempotencyKey !== 'string' || !identifier.test(body.idempotencyKey) ||
                    !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100 ||
                    !body.items.every(validItem) || !Number.isFinite(body.totalAmount) || body.totalAmount < 0) {
                    return send(res, 400, { error: 'Invalid checkout request' });
                }
                const result = await transact(() => checkout.executeCheckout({ ...body, tenantId, customerId }));
                return send(res, result.success ? 200 : 409, result);
            }
            if (orderPath) {
                const [, orderId, action] = orderPath;
                const order = await checkout.getOrder(orderId, tenantId);
                if (order?.customerId !== customerId) return send(res, 404, { error: 'Order not found' });
                if (read && !action) return send(res, 200, order);
                if (read && action === 'events') return send(res, 200, { orderId, events: await eventBus.readOrderEvents(orderId, tenantId) });
                if (write && action === 'cancel') {
                    const success = await transact(() => checkout.cancelOrder(orderId, undefined, tenantId));
                    return send(res, success ? 200 : 400, { success, orderId });
                }
            }
        } catch (error) {
            console.error('Commerce request failed:', error.code ?? error.name);
            return send(res, 503, { error: 'Commerce operation unavailable' });
        }
        return send(res, 404, { error: 'Not found' });
    };
}
