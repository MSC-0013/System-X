/**
 * COMMERCE RELIABILITY TESTBED (CRT) — UNIFIED SERVER
 *
 * Exposes:
 *  - Storefront & Reliability Control Center Dashboard (GET /)
 *  - Commerce API endpoints (/api/products, /api/inventory, /api/cart, /api/checkout, /api/orders)
 *  - CRT Scenario Execution Endpoints (/api/scenarios/run/:id, /api/scenarios/run-all)
 */

import http from 'node:http';
import { CatalogService } from './catalog/catalogService.js';
import { InventoryManager } from './inventory/inventoryManager.js';
import { CartService } from './cart/cartService.js';
import { CheckoutSagaCoordinator } from './checkout/checkoutSaga.js';
import { EventBus } from './events/eventBus.js';
import { QuorumAdapter } from './adapter/quorumAdapter.js';
import { createCommerceApiRouter } from './api/commerceApi.js';
import { renderControlCenterHtml } from './dashboard/controlCenterHtml.js';
import { CrtScenarioSuite } from './scenarios/crtScenarios.js';

const CRT_PORT = parseInt(process.env['CRT_PORT'] ?? '4200', 10);
const CRT_HOST = process.env['CRT_HOST'] ?? '127.0.0.1';

async function bootstrap() {
  console.log('[CRT] Initializing Commerce Reliability Testbed...');

  const adapter = new QuorumAdapter();
  await adapter.initializeCluster();
  console.log('[CRT] 3-Node Quorum Lab Cluster Initialized (W=2, R=2, SYNC_FSYNC).');

  const catalog = new CatalogService();
  const inventory = new InventoryManager(adapter);
  const cart = new CartService(adapter);
  const eventBus = new EventBus();
  const checkout = new CheckoutSagaCoordinator(adapter, inventory, eventBus);
  const scenarioSuite = new CrtScenarioSuite(adapter);

  // Seed default stock for critical test SKU PHONE-001
  await inventory.setStock('tenant-01', 'PHONE-001', 1, 0);
  console.log('[CRT] Initialized inventory for PHONE-001 with available=1 (Ready for CRT-03 last item test).');

  const commerceRouter = createCommerceApiRouter({
    catalog,
    inventory,
    cart,
    checkout,
    eventBus,
    adapter,
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-idempotency-key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Read body text
    let bodyText = '';
    for await (const chunk of req) {
      bodyText += chunk;
    }

    // Scenario execution endpoints
    const runMatch = pathname.match(/^\/api\/scenarios\/run\/([A-Za-z0-9-]+)$/);
    if (req.method === 'POST' && runMatch) {
      try {
        const scenarioId = runMatch[1]!;
        const result = await scenarioSuite.runScenario(scenarioId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    if (req.method === 'POST' && pathname === '/api/scenarios/run-all') {
      const results = await scenarioSuite.runAll();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results, null, 2));
      return;
    }

    // Try Commerce API
    const handledByCommerce = await commerceRouter(req, res, pathname, bodyText);
    if (handledByCommerce) return;

    // Dashboard UI
    if (pathname === '/' || pathname === '/dashboard' || pathname === '/storefront') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderControlCenterHtml());
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(CRT_PORT, CRT_HOST, () => {
    console.log(`[CRT] Commerce Reliability Testbed listening at http://${CRT_HOST}:${CRT_PORT}`);
    console.log(`[CRT] Open http://localhost:${CRT_PORT} in your browser to view the Storefront & Control Center.`);
  });

  return { server, adapter, scenarioSuite, catalog, inventory, cart, checkout, eventBus };
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  bootstrap().catch((err) => {
    console.error('[CRT] Fatal startup error:', err);
    process.exit(1);
  });
}

export { bootstrap };
