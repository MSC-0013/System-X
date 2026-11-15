/**
 * COMMERCE RELIABILITY TESTBED (CRT) — UNIFIED SERVER
 *
 * Exposes:
 *  - Storefront & Reliability Control Center Dashboard (GET /)
 *  - Commerce API endpoints (/api/products, /api/inventory, /api/cart, /api/checkout, /api/orders)
 *  - CRT Scenario Execution Endpoints (/api/scenarios/run/:id, /api/scenarios/run-all)
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { CatalogService } from './catalog/catalogService.js';
import { InventoryManager } from './inventory/inventoryManager.js';
import { CartService } from './cart/cartService.js';
import { CheckoutSagaCoordinator } from './checkout/checkoutSaga.js';
import { EventBus } from './events/eventBus.js';
import { QuorumAdapter } from './adapter/quorumAdapter.js';
import { createCommerceApiRouter } from './api/commerceApi.js';
import { renderControlCenterHtml } from './dashboard/controlCenterHtml.js';
import { CrtScenarioSuite } from './scenarios/crtScenarios.js';
import { openCommerceStore } from './adapter/mysqlCommerceStore.js';
import { createCommerceAuthenticator } from './api/commerceAuth.js';
const CRT_PORT = parseInt(process.env['CRT_PORT'] ?? '4200', 10);
const CRT_HOST = process.env['CRT_HOST'] ?? '127.0.0.1';
let bootstrapPromise = null;
async function bootstrap() {
    if (bootstrapPromise) {
        return bootstrapPromise;
    }
    bootstrapPromise = (async () => {
        console.log('[CRT] Initializing Commerce Reliability Testbed...');
        const authenticate = createCommerceAuthenticator();
        const storeUrl = process.env.CRT_DATABASE_URL;
        const commerceStore = storeUrl ? await openCommerceStore(storeUrl, process.env.CRT_DATA_NAMESPACE) : null;
        const adapter = new QuorumAdapter();
        await adapter.initializeCluster();
        console.log('[CRT] 3-Node Quorum Lab Cluster Initialized (W=2, R=2, SYNC_FSYNC).');
        const catalog = new CatalogService();
        const data = commerceStore ?? adapter;
        const inventory = new InventoryManager(data);
        const cart = new CartService(data);
        const eventBus = new EventBus(commerceStore);
        const checkout = new CheckoutSagaCoordinator(data, inventory, eventBus);
        const artifactStore = process.env.CRT_ARTIFACT_ENDPOINT && process.env.CRT_ARTIFACT_BUCKET ? {
            endpoint: process.env.CRT_ARTIFACT_ENDPOINT, bucketName: process.env.CRT_ARTIFACT_BUCKET,
            forcePathStyle: true, region: process.env.CRT_ARTIFACT_REGION ?? 'us-east-1', retentionDays: 1,
        } : undefined;
        const scenarioSuite = new CrtScenarioSuite(adapter, { artifactStore });
        // Seed default stock for critical test SKU PHONE-001
        if (!commerceStore && !await inventory.getStock('PHONE-001')) {
            await inventory.setStock('tenant-01', 'PHONE-001', 1, 0);
        }
        const commerceRouter = createCommerceApiRouter({
            catalog,
            inventory,
            cart,
            checkout,
            eventBus,
            adapter,
            commerceStore,
        });
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
            const pathname = url.pathname;
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
            // Read body text
            let bodyText = '';
            for await (const chunk of req) {
                bodyText += chunk;
                if (bodyText.length > 131072) {
                    res.writeHead(413, { 'Content-Type': 'application/json' }).end('{"error":"Request too large"}');
                    return;
                }
            }
            // Scenario execution endpoints
            if (req.method === 'POST' && /^\/api\/scenarios\/(?:run\/|run-all$)/.test(pathname)) {
                const principal = authenticate(req.headers.authorization);
                if (principal?.role !== 'inventory-admin' || principal.tenantId !== 'tenant-01') {
                    res.writeHead(principal ? 403 : 401, { 'Content-Type': 'application/json' }).end('{"error":"Testbed administrator required"}');
                    return;
                }
            }
            const runMatch = pathname.match(/^\/api\/scenarios\/run\/([A-Za-z0-9-]+)$/);
            if (req.method === 'POST' && runMatch) {
                try {
                    const scenarioId = runMatch[1];
                    const result = await scenarioSuite.runScenario(scenarioId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result, null, 2));
                    return;
                }
                catch (err) {
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
            if (handledByCommerce)
                return;
            // Dashboard UI
            if (pathname === '/' || pathname === '/dashboard' || pathname === '/storefront') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(renderControlCenterHtml());
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not Found' }));
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`[CRT] Port ${CRT_PORT} already in use, reusing active daemon.`);
            }
            else {
                console.error('[CRT] Server error:', err);
            }
        });
        try {
            server.listen(CRT_PORT, CRT_HOST, () => {
                console.log(`[CRT] Commerce Reliability Testbed listening at http://${CRT_HOST}:${CRT_PORT}`);
                console.log(`[CRT] Open http://localhost:${CRT_PORT} in your browser to view the Storefront & Control Center.`);
            });
        }
        catch (err) {
            console.warn(`[CRT] Server listen notice: ${err.message}`);
        }
        server.on('close', () => { if (commerceStore) void commerceStore.close(); });
        return { server, adapter, scenarioSuite, catalog, inventory, cart, checkout, eventBus, commerceRouter };
    })();
    return bootstrapPromise;
}
const isDirectCliRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectCliRun) {
    bootstrap().catch((err) => {
        console.error('[CRT] Fatal startup error:', err);
        process.exit(1);
    });
}
export { bootstrap };
