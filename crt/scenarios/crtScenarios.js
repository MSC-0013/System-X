/**
 * CRT SCENARIOS (CRT-01 THROUGH CRT-15)
 *
 * Implements deterministic test scenarios verifying distributed systems
 * behavior, idempotency, overselling protection, crash recovery, quorum partitions,
 * and Blackbox simulation comparison.
 */
import { CatalogService } from '../catalog/catalogService.js';
import { InventoryManager } from '../inventory/inventoryManager.js';
import { CartService } from '../cart/cartService.js';
import { CheckoutSagaCoordinator } from '../checkout/checkoutSaga.js';
import { EventBus } from '../events/eventBus.js';
import { measureTenantBoundary } from './tenantBoundary.js';
import { randomUUID } from 'node:crypto';
import { computeSha256 } from '../../packages/certification-gate/src/artifactIntegrity.js';
import { downloadAndVerify, verifyRetentionProbe } from '../../packages/certification-gate/src/artifactStore.js';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runQuorumProcessExperiment } from './quorumProcess.js';
export class CrtScenarioSuite {
    adapter;
    catalog;
    inventory;
    cart;
    checkout;
    eventBus;
    constructor(adapter, { artifactStore, processEvidenceDir } = {}) {
        this.adapter = adapter;
        this.catalog = new CatalogService();
        this.inventory = new InventoryManager(adapter);
        this.cart = new CartService(adapter);
        this.eventBus = new EventBus();
        this.artifactStore = artifactStore;
        this.processEvidenceDir = processEvidenceDir;
        this.checkout = new CheckoutSagaCoordinator(adapter, this.inventory, this.eventBus);
    }
    /**
     * CRT-01: Normal catalog and checkout traffic
     */
    async runCrt01() {
        const t0 = Date.now();
        const assertions = [];
        // 1. Browse catalog
        const { products } = this.catalog.listProducts({ limit: 10 });
        const p1 = products[0];
        // 2. Initialize stock
        await this.inventory.setStock('tenant-01', p1.sku, 100);
        // 3. Place order
        const checkoutRes = await this.checkout.executeCheckout({
            customerId: 'cust-crt01',
            tenantId: 'tenant-01',
            idempotencyKey: `idemp-crt01-${Date.now()}`,
            items: [{ productId: p1.id, sku: p1.sku, quantity: 2, price: p1.price }],
            totalAmount: p1.price * 2,
        });
        const passed = checkoutRes.success && checkoutRes.order?.status === 'CONFIRMED';
        assertions.push({
            dimension: 'ORDER_LIFECYCLE',
            verdict: passed ? 'PASS' : 'VIOLATION',
            target: 'CONFIRMED',
            observed: checkoutRes.order?.status ?? 'NONE',
            details: 'Checkout completed through all saga stages without error',
        });
        return {
            scenarioId: 'CRT-01',
            name: 'Normal catalog and checkout traffic',
            seed: 1337,
            durationMs: Date.now() - t0,
            passed,
            assertions,
        };
    }
    /**
     * CRT-02: Repeated checkout request (Idempotency)
     */
    async runCrt02() {
        const t0 = Date.now();
        const assertions = [];
        const idempKey = `idemp-crt02-${Date.now()}`;
        await this.inventory.setStock('tenant-01', 'PHONE-001', 50);
        // First submission
        const res1 = await this.checkout.executeCheckout({
            customerId: 'cust-idemp',
            tenantId: 'tenant-01',
            idempotencyKey: idempKey,
            items: [{ productId: 'prod-rare-phone-001', sku: 'PHONE-001', quantity: 1, price: 999 }],
            totalAmount: 999,
        });
        // Immediate retry with identical idempotency key
        const res2 = await this.checkout.executeCheckout({
            customerId: 'cust-idemp',
            tenantId: 'tenant-01',
            idempotencyKey: idempKey,
            items: [{ productId: 'prod-rare-phone-001', sku: 'PHONE-001', quantity: 1, price: 999 }],
            totalAmount: 999,
        });
        const isSameOrder = Boolean(res1.order?.orderId) && res1.order.orderId === res2.order?.orderId;
        const isDupFlagged = res2.isDuplicateSubmission === true;
        const passed = isSameOrder && isDupFlagged;
        assertions.push({
            dimension: 'IDEMPOTENCY_DEDUPLICATION',
            verdict: passed ? 'PASS' : 'VIOLATION',
            target: '1 Order Created',
            observed: `${isSameOrder ? '1 Order' : '2 Orders'} (dupFlag=${isDupFlagged})`,
            details: 'Duplicate submission recognized and returned original order without secondary mutation',
        });
        return {
            scenarioId: 'CRT-02',
            name: 'Repeated checkout request (Idempotency)',
            seed: 1337,
            durationMs: Date.now() - t0,
            passed,
            assertions,
        };
    }
    /**
     * CRT-03: CRITICAL TEST CASE — 20 buyers competing for the last 1 item
     *
     * Available stock = 1
     * 20 simultaneous purchase requests.
     * Expected:
     *  - Accepted reservations: 1
     *  - Accepted orders: 1
     *  - Remaining stock: 0
     *  - Overselling: 0
     *  - Rejections: 19
     */
    async runCrt03() {
        const t0 = Date.now();
        const assertions = [];
        const sku = 'PHONE-001';
        // Set available inventory strictly to 1
        await this.inventory.setStock('tenant-01', sku, 1, 0);
        // Launch 20 concurrent purchase requests simultaneously
        const buyerCount = 20;
        const promises = Array.from({ length: buyerCount }, (_, i) => this.checkout.executeCheckout({
            customerId: `buyer-${i + 1}`,
            tenantId: 'tenant-01',
            idempotencyKey: `idemp-buyer-${i + 1}-${Date.now()}`,
            items: [{ productId: 'prod-rare-phone-001', sku, quantity: 1, price: 1199.99 }],
            totalAmount: 1199.99,
        }));
        const results = await Promise.all(promises);
        const acceptedOrders = results.filter((r) => r.success && r.order?.status === 'CONFIRMED');
        const rejectedOrders = results.filter((r) => !r.success);
        // Check final stock in Quorum Lab
        const finalStock = await this.inventory.getStock(sku);
        const finalAvailable = finalStock?.available ?? -1;
        const overselling = Math.max(0, acceptedOrders.length - 1);
        const passed = acceptedOrders.length === 1 &&
            rejectedOrders.length === 19 &&
            finalAvailable === 0 &&
            overselling === 0;
        assertions.push({
            dimension: 'SINGLE_ITEM_CONCURRENCY',
            verdict: passed ? 'PASS' : 'VIOLATION',
            target: 'Accepted: 1, Rejected: 19, Stock: 0, Overselling: 0',
            observed: `Accepted: ${acceptedOrders.length}, Rejected: ${rejectedOrders.length}, Stock: ${finalAvailable}, Overselling: ${overselling}`,
            details: 'Atomic reservation protocol serialized concurrent checkout requests and prevented overselling',
        });
        return {
            scenarioId: 'CRT-03',
            name: 'Twenty buyers competing for one item (The Last Item)',
            seed: 1337,
            durationMs: Date.now() - t0,
            passed,
            assertions,
            metrics: {
                totalRequests: 20,
                successfulRequests: acceptedOrders.length,
                failedRequests: rejectedOrders.length,
                oversoldItems: overselling,

            },
        };
    }
    /**
     * CRT-04: Node crash and restart (Durable writes & recovery)
     */
    async runCrt04() {
        return this.runProcessChecks('CRT-04', 'Node crash and restart', ['QL-REAL-PEERS', 'QL-REAL-CRASH-WAL']);
    }
    /**
     * CRT-05: Network partition (Quorum availability & surviving coordinator)
     */
    async runCrt05() {
        return this.runProcessChecks('CRT-05', 'Network partition availability', ['QL-REAL-MINORITY', 'QL-REAL-MAJORITY-LOSS']);
    }
    /**
     * CRT-06: Concurrent conflicting updates (Version frontier & LWW)
     */
    async runCrt06() {
        const t0 = Date.now();
        const assertions = [];
        // Simultaneous updates to same key
        const p1 = this.adapter.put('conflict-key', JSON.stringify({ writer: 'A', timestamp: 100 }));
        const p2 = this.adapter.put('conflict-key', JSON.stringify({ writer: 'B', timestamp: 200 }));
        await Promise.all([p1, p2]);
        const finalVal = await this.adapter.get('conflict-key');
        const passed = finalVal.found && finalVal.versionCounter >= 1;
        assertions.push({
            dimension: 'CONFLICT_DETERMINISM',
            verdict: passed ? 'PASS' : 'VIOLATION',
            target: 'Resolved without state corruption',
            observed: `Resolved version: ${finalVal.versionCounter}`,
            details: 'A versioned value remained readable after concurrent writes',
        });
        return {
            scenarioId: 'CRT-06',
            name: 'Concurrent conflicting updates',
            seed: 1337,
            durationMs: Date.now() - t0,
            passed,
            assertions,
        };
    }
    /**
     * CRT-07: Network healing (Replica convergence)
     */
    async runCrt07() {
        return this.runProcessChecks('CRT-07', 'Network healing and replica convergence', ['QL-REAL-HEAL', 'QL-REAL-STALE-REPAIR']);
    }
    /**
     * CRT-08: Delete followed by repair (Tombstone safety & no resurrection)
     */
    async runCrt08() {
        return this.runProcessChecks('CRT-08', 'Delete followed by repair', ['QL-REAL-TOMBSTONE-REPAIR']);
    }
    async runProcessChecks(scenarioId, name, checkIds) {
        const target = fileURLToPath(new URL('../../../QUORUM LAB/apps/quorum-node/dist/main.js', import.meta.url));
        if (!existsSync(target)) return { scenarioId, name, status: 'UNVERIFIED', passed: false,
            reason: 'Build the sibling Quorum Lab node CLI to run the real-process scenario.', assertions: [] };
        const started = performance.now();
        const dir = this.processEvidenceDir ? join(this.processEvidenceDir, scenarioId) : await mkdtemp(join(tmpdir(), 'crt-process-'));
        const { rows, evidence } = await runQuorumProcessExperiment(dir);
        const selected = rows.filter(row => checkIds.includes(row.featureId));
        const passed = selected.length === checkIds.length && selected.every(row => row.result === 'PASS');
        const blocked = selected.length === 0 || selected.every(row => row.result === 'BLOCKED');
        return { scenarioId, name, runtimeMode: 'REAL-INTEGRATION', passed, durationMs: performance.now() - started,
            ...(blocked ? { status: 'UNVERIFIED', reason: 'An earlier independent process prerequisite failed.' } : {}),
            assertions: selected.map(row => ({ dimension: row.featureId, verdict: row.result === 'PASS' ? 'PASS' : 'VIOLATION',
                target: row.expected, observed: row.observed })),
            evidence: evidence.map(({ id, pid, endpoint }) => ({ id, pid, endpoint })) };
    }
    /**
     * CRT-09: Sustained load (Throughput & latency objectives)
     */
    async runCrt09() {
        const runId = 'crt-09-' + randomUUID();
        const keys = Array.from({ length: 5 }, (_, i) => runId + '-' + i);
        for (const key of keys) await this.adapter.put(key, 'seed', { runId });
        const count = 100;
        const intervalMs = 50;
        const targetThroughput = 19;
        const started = performance.now();
        const requests = [];
        for (let index = 0; index < count; index++) {
            const remaining = started + index * intervalMs - performance.now();
            if (remaining > 0) await delay(remaining);
            requests.push((async () => {
                const requestStarted = performance.now();
                const key = keys[index % keys.length];
                let ok = false;
                try {
                    if (index % 2) {
                        ok = (await this.adapter.put(key, 'sample-' + index, { runId })).success;
                    } else {
                        ok = Boolean((await this.adapter.get(key, { runId })).found);
                    }
                } catch { /* A failed operation remains in the measured population. */ }
                return { index, ok, latencyMs: performance.now() - requestStarted, schedulingLagMs: requestStarted - started - index * intervalMs };
            })());
        }
        const samples = await Promise.all(requests);
        const elapsedMs = Math.max(count * intervalMs, performance.now() - started);
        const errors = samples.filter(sample => !sample.ok).length;
        const sorted = samples.map(sample => sample.latencyMs).sort((a, b) => a - b);
        const p99Ms = sorted[Math.ceil(count * .99) - 1];
        const throughput = (count - errors) * 1000 / elapsedMs;
        const passed = throughput >= targetThroughput && p99Ms < 25 && errors / count < .01;
        await Promise.all(keys.map(key => this.adapter.delete(key, { runId })));
        return {
            scenarioId: "CRT-09",
            name: "Sustained throughput",
            passed,
            durationMs: elapsedMs,
            metrics: { count, errors, p99Ms, throughput, samples },
            assertions: [{ dimension: 'SUSTAINED_LOAD_SLO', verdict: passed ? 'PASS' : 'VIOLATION',
                target: '100 offered operations at 20/s, at least 19 successful operations/s, P99 < 25 ms, error rate < 1%',
                observed: JSON.stringify({ count, errors, p99Ms, throughput }) }],
        };
    }
    /**
     * CRT-10: Leader failure & fencing safety
     */
    async runCrt10() {
        return {
            scenarioId: "CRT-10",
            name: "Leader failure and fencing safety",
            status: "UNVERIFIED",
            passed: false,
            reason: "The embedded cluster uses quorum replication and does not run a leader failover.",
            assertions: [],
        };
    }
    /**
     * CRT-11: Simulation versus real execution (Statistical comparison)
     */
    async runCrt11() {
        return {
            scenarioId: "CRT-11",
            name: "Simulation versus real execution",
            status: "UNVERIFIED",
            passed: false,
            reason: "Use the measured local experiment for a simulation comparison. The embedded commerce workload has not been compared.",
            assertions: [],
        };
    }
    /**
     * CRT-12: Calibration and held-out validation (Zero-leakage)
     */
    async runCrt12() {
        return {
            scenarioId: "CRT-12",
            name: "Calibration and held-out validation",
            status: "UNVERIFIED",
            passed: false,
            reason: "No fitted model was evaluated against held-out commerce samples.",
            assertions: [],
        };
    }
    /**
     * CRT-13: Duplicate event delivery (Consumer idempotency)
     */
    async runCrt13() {
        const t0 = Date.now();
        const assertions = [];
        let processedCount = 0;
        this.eventBus.subscribe('order.confirmed', async () => {
            processedCount++;
        });
        const evt = await this.eventBus.publish('order.confirmed', 'ord-test-13', 'tenant-01');
        // Send duplicate of same event
        await this.eventBus.publishDuplicate(evt);
        const passed = processedCount === 1;
        assertions.push({
            dimension: 'EVENT_CONSUMER_IDEMPOTENCY',
            verdict: passed ? 'PASS' : 'VIOLATION',
            target: 'Processed exactly once',
            observed: `Processed ${processedCount} times`,
            details: 'Duplicate event delivery correctly deduplicated by consumer set',
        });
        return {
            scenarioId: 'CRT-13',
            name: 'Duplicate event delivery',
            seed: 1337,
            durationMs: Date.now() - t0,
            passed,
            assertions,
        };
    }
    /**
     * CRT-14: Multi-tenant isolation
     */
    async runCrt14() {
        const start = performance.now();
        let passed = false;
        let observed;
        try {
            observed = JSON.stringify(await measureTenantBoundary(this));
            passed = true;
        } catch (error) {
            observed = error.message;
        }
        return {
            scenarioId: "CRT-14",
            name: "Multi-tenant isolation",
            runtimeMode: 'LOCAL-FALLBACK',
            durationMs: performance.now() - start,
            passed,
            assertions: [{ dimension: 'TENANT_BOUNDARY', verdict: passed ? 'PASS' : 'VIOLATION',
                target: 'Independent same-SKU counts and denied anonymous, cross-tenant and forged requests', observed }],
        };
    }
    /**
     * CRT-15: Artifact verification (WORM integrity)
     */
    async runCrt15() {
        const scenarioId = 'CRT-15';
        const name = 'Artifact verification';
        if (!this.artifactStore) return { scenarioId, name, status: 'UNVERIFIED', passed: false,
            reason: 'A dedicated Object Lock bucket must be configured for CRT-15.', assertions: [] };
        const started = performance.now();
        const probeId = 'crt-15-' + randomUUID();
        const spec = { scenarioId, probeId, operation: 'verify-retained-version' };
        const experimentSpecHash = computeSha256(Buffer.from(JSON.stringify(spec)));
        const bytes = Buffer.from(JSON.stringify({ spec, experimentSpecHash }));
        let observed;
        let passed = false;
        try {
            const { record, deniedStatus } = await verifyRetentionProbe(bytes, probeId, this.artifactStore);
            try {
                await downloadAndVerify({ ...record, sha256: '0'.repeat(64) }, this.artifactStore);
                throw new Error('Artifact verification accepted a tampered digest.');
            } catch (error) {
                if (!/checksum mismatch/i.test(error.message)) throw error;
            }
            observed = JSON.stringify({ experimentSpecHash, record, deniedStatus, tamperedDigestRejected: true });
            passed = true;
        } catch (error) {
            observed = error.message;
        }
        return { scenarioId, name, runtimeMode: 'FULL-INFRASTRUCTURE', durationMs: performance.now() - started, passed,
            assertions: [{ dimension: 'WORM_LINEAGE', verdict: passed ? 'PASS' : 'VIOLATION',
                target: 'Read the exact signed retained version, reject wrong digest and deny deletion', observed }] };
    }
    /**
     * Executes a single scenario by its ID (CRT-01 to CRT-15).
     */
    async runScenario(id) {
        const cleanId = id.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        switch (cleanId) {
            case 'CRT-01': return this.runCrt01();
            case 'CRT-02': return this.runCrt02();
            case 'CRT-03': return this.runCrt03();
            case 'CRT-04': return this.runCrt04();
            case 'CRT-05': return this.runCrt05();
            case 'CRT-06': return this.runCrt06();
            case 'CRT-07': return this.runCrt07();
            case 'CRT-08': return this.runCrt08();
            case 'CRT-09': return this.runCrt09();
            case 'CRT-10': return this.runCrt10();
            case 'CRT-11': return this.runCrt11();
            case 'CRT-12': return this.runCrt12();
            case 'CRT-13': return this.runCrt13();
            case 'CRT-14': return this.runCrt14();
            case 'CRT-15': return this.runCrt15();
            default:
                throw new Error(`Unknown CRT Scenario ID: ${id}`);
        }
    }
    /**
     * Executes all 15 CRT scenarios sequentially and summarizes results.
     */
    async runAll() {
        return [
            await this.runCrt01(),
            await this.runCrt02(),
            await this.runCrt03(),
            await this.runCrt04(),
            await this.runCrt05(),
            await this.runCrt06(),
            await this.runCrt07(),
            await this.runCrt08(),
            await this.runCrt09(),
            await this.runCrt10(),
            await this.runCrt11(),
            await this.runCrt12(),
            await this.runCrt13(),
            await this.runCrt14(),
            await this.runCrt15(),
        ];
    }
}
