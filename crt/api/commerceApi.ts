import http from 'node:http';
import { CatalogService } from '../catalog/catalogService.js';
import { InventoryManager } from '../inventory/inventoryManager.js';
import { CartService } from '../cart/cartService.js';
import { CheckoutSagaCoordinator, CheckoutRequest } from '../checkout/checkoutSaga.js';
import { EventBus } from '../events/eventBus.js';
import { QuorumAdapter } from '../adapter/quorumAdapter.js';

export function createCommerceApiRouter(services: {
  catalog: CatalogService;
  inventory: InventoryManager;
  cart: CartService;
  checkout: CheckoutSagaCoordinator;
  eventBus: EventBus;
  adapter: QuorumAdapter;
}) {
  const { catalog, inventory, cart, checkout, eventBus } = services;

  return async (req: http.IncomingMessage, res: http.ServerResponse, pathname: string, bodyText: string): Promise<boolean> => {
    // 0. GET /api/health
    if (req.method === 'GET' && pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'UP',
        service: 'commerce-reliability-testbed',
        cluster: 'Quorum Lab N=3 (W=2, R=2)',
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
        cluster: 'Quorum Lab N=3 (W=2, R=2)',
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

    // 3. GET /api/inventory/:sku
    if (req.method === 'GET' && pathname.startsWith('/api/inventory/')) {
      const sku = pathname.replace('/api/inventory/', '');
      const stock = await inventory.getStock(sku);
      if (!stock) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'SKU not found' }));
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stock));
      return true;
    }

    // 4. POST /api/inventory/adjust
    if (req.method === 'POST' && pathname === '/api/inventory/adjust') {
      try {
        const data = JSON.parse(bodyText);
        const stock = await inventory.setStock(data.tenantId ?? 'tenant-01', data.sku, data.available, data.reserved ?? 0);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stock));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // 5. POST /api/cart/items
    if (req.method === 'POST' && pathname === '/api/cart/items') {
      try {
        const data = JSON.parse(bodyText);
        const updatedCart = await cart.addItem(
          data.cartId,
          data.customerId ?? 'cust-1',
          data.tenantId ?? 'tenant-01',
          data.item,
          data.clientId
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updatedCart));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // 6. GET /api/cart/:id
    if (req.method === 'GET' && pathname.startsWith('/api/cart/')) {
      const cartId = pathname.replace('/api/cart/', '');
      const userCart = await cart.getCart(cartId);
      if (!userCart) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cart not found' }));
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(userCart));
      return true;
    }

    // 7. POST /api/checkout
    if (req.method === 'POST' && pathname === '/api/checkout') {
      try {
        const reqBody = JSON.parse(bodyText) as CheckoutRequest;
        const result = await checkout.executeCheckout(reqBody);
        const status = result.success ? 200 : 409;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // 8. GET /api/orders/:id
    if (req.method === 'GET' && pathname.startsWith('/api/orders/') && !pathname.endsWith('/events') && !pathname.endsWith('/cancel')) {
      const orderId = pathname.replace('/api/orders/', '');
      const order = await checkout.getOrder(orderId);
      if (!order) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order not found' }));
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(order));
      return true;
    }

    // 9. POST /api/orders/:id/cancel
    if (req.method === 'POST' && pathname.match(/\/api\/orders\/[^/]+\/cancel$/)) {
      const orderId = pathname.split('/')[3]!;
      const cancelled = await checkout.cancelOrder(orderId);
      res.writeHead(cancelled ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: cancelled, orderId }));
      return true;
    }

    // 10. GET /api/orders/:id/events
    if (req.method === 'GET' && pathname.match(/\/api\/orders\/[^/]+\/events$/)) {
      const orderId = pathname.split('/')[3]!;
      const events = eventBus.getPublishedEvents(orderId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderId, events }));
      return true;
    }

    return false;
  };
}
