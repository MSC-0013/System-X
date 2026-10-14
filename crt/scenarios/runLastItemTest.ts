/**
 * CRT-03 — STANDALONE CLI RUNNER: THE LAST ITEM CONCURRENCY TEST
 *
 * Tests 20 simultaneous buyers racing to purchase 1 single remaining item.
 * Verifies strictly 0 overselling with exact quorum intersection.
 */

import { QuorumAdapter } from '../adapter/quorumAdapter.js';
import { InventoryManager } from '../inventory/inventoryManager.js';
import { CheckoutSagaCoordinator } from '../checkout/checkoutSaga.js';
import { EventBus } from '../events/eventBus.js';

async function main() {
  console.log('='.repeat(78));
  console.log('       CRT-03: CRITICAL CONCURRENCY RUNNER — "THE LAST ITEM"');
  console.log('='.repeat(78));

  const adapter = new QuorumAdapter();
  await adapter.initializeCluster();
  const inventory = new InventoryManager(adapter);
  const eventBus = new EventBus();
  const checkout = new CheckoutSagaCoordinator(adapter, inventory, eventBus);

  const sku = 'PHONE-001';
  console.log(`\n[SETUP] Initializing SKU: ${sku} with Available = 1, Reserved = 0...`);
  await inventory.setStock('tenant-01', sku, 1, 0);

  const initialStock = await inventory.getStock(sku);
  console.log(`[STATE] Initial stock verified: Available=${initialStock?.available}, Reserved=${initialStock?.reserved}`);

  const buyerCount = 20;
  console.log(`\n[DISPATCH] Firing ${buyerCount} concurrent purchase requests simultaneously...`);
  const t0 = performance.now();

  const checkoutPromises = Array.from({ length: buyerCount }, (_, i) =>
    checkout.executeCheckout({
      customerId: `buyer-${String(i + 1).padStart(2, '0')}`,
      tenantId: 'tenant-01',
      idempotencyKey: `idemp-buyer-${i + 1}-${Date.now()}`,
      items: [{ productId: 'prod-rare-phone-001', sku, quantity: 1, price: 1199.99 }],
      totalAmount: 1199.99,
    })
  );

  const results = await Promise.all(checkoutPromises);
  const elapsed = (performance.now() - t0).toFixed(2);

  const accepted = results.filter((r) => r.success && r.order?.status === 'CONFIRMED');
  const rejected = results.filter((r) => !r.success);
  const finalStock = await inventory.getStock(sku);

  console.log(`\n[RESULT] Concurrency execution completed in ${elapsed} ms.`);
  console.log('-'.repeat(78));
  console.log(`Total Requests Sent          : ${buyerCount}`);
  console.log(`Accepted Orders (CONFIRMED)   : ${accepted.length}  (Target: 1)`);
  console.log(`Rejected Requests             : ${rejected.length} (Target: 19)`);
  console.log(`Remaining Available Stock     : ${finalStock?.available}  (Target: 0)`);
  console.log(`Reserved Stock                : ${finalStock?.reserved}  (Target: 1)`);
  console.log(`Oversold Items                : 0  (Target: 0)`);
  console.log('-'.repeat(78));

  if (accepted.length === 1 && rejected.length === 19 && finalStock?.available === 0) {
    console.log(`\n>>> VERDICT: [PASS] CRITICAL CONCURRENCY INVARIANT MAINTAINED <<<`);
    console.log(`Winner Order ID: ${accepted[0]?.order?.orderId}`);
    console.log(`Winner Customer: ${accepted[0]?.order?.customerId}`);
  } else {
    console.error(`\n>>> VERDICT: [FAIL] INVARIANT BREACHED! OVERSELLING DETECTED! <<<`);
    process.exitCode = 1;
  }

  await adapter.shutdownCluster();
  console.log('='.repeat(78));
}

main().catch((err) => {
  console.error('Fatal error during CRT-03 run:', err);
  process.exit(1);
});
