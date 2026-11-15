import { randomUUID } from 'node:crypto';

export class CheckoutSagaCoordinator {
    adapter;
    inventoryManager;
    eventBus;
    pending = new Map();
    constructor(adapter, inventoryManager, eventBus) {
        this.adapter = adapter;
        this.inventoryManager = inventoryManager;
        this.eventBus = eventBus;
    }
    orderKey(orderId, tenantId) {
        return 'order:' + JSON.stringify([tenantId, orderId]);
    }
    idempotencyKey({ tenantId, customerId, idempotencyKey }) {
        return 'idempotency:' + JSON.stringify([tenantId, customerId, idempotencyKey]);
    }
    async getOrder(orderId, tenantId = 'tenant-01') {
        const res = await this.adapter.get(this.orderKey(orderId, tenantId));
        if (!res.found || !res.value)
            return null;
        return JSON.parse(res.value);
    }
    /**
     * Executes the Checkout Saga with Idempotency, Inventory Reservation & Payment Compensation.
     */
    async executeCheckout(req) {
        if (!req || typeof req.idempotencyKey !== 'string' || !req.idempotencyKey.trim() ||
            !Array.isArray(req.items) || req.items.length === 0 ||
            req.items.some(item => !item || typeof item.sku !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) {
            return { success: false, error: 'INVALID_CHECKOUT' };
        }
        return this.serialize(this.idempotencyKey(req), () => this.executeCheckoutOnce(req));
    }
    async serialize(key, run) {
        const previous = this.pending.get(key);
        const current = Promise.resolve(previous).catch(() => {}).then(run);
        this.pending.set(key, current);
        try { return await current; }
        finally { if (this.pending.get(key) === current) this.pending.delete(key); }
    }
    async executeCheckoutOnce(req) {
        // 1. Idempotency Check
        const idempKey = this.idempotencyKey(req);
        const existingIdemp = await this.adapter.get(idempKey);
        if (existingIdemp.found && existingIdemp.value) {
            const existingOrderId = existingIdemp.value;
            const existingOrder = await this.getOrder(existingOrderId, req.tenantId);
            if (existingOrder) {
                if (existingOrder.tenantId !== req.tenantId || existingOrder.customerId !== req.customerId) {
                    return { success: false, error: 'IDEMPOTENCY_KEY_CONFLICT' };
                }
                return {
                    success: existingOrder.status === 'CONFIRMED',
                    order: existingOrder,
                    isDuplicateSubmission: true,
                    ...(existingOrder.status === 'CONFIRMED' ? {} : {
                        error: existingOrder.failure?.error ?? 'ORDER_' + existingOrder.status,
                        ...(existingOrder.failure?.sagaStepFailed ? { sagaStepFailed: existingOrder.failure.sagaStepFailed } : {}),
                    }),
                };
            }
        }
        const orderId = 'ord-' + randomUUID();
        const orderKey = this.orderKey(orderId, req.tenantId);
        const timeline = [];
        // Step 1: Create Order Intent in PENDING state
        timeline.push({ status: 'PENDING', timestampMs: Date.now(), note: 'Order intent created' });
        let currentOrder = {
            orderId,
            customerId: req.customerId,
            tenantId: req.tenantId,
            idempotencyKey: req.idempotencyKey,
            items: req.items,
            totalAmount: req.totalAmount,
            status: 'PENDING',
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
            timeline,
        };
        await this.adapter.put(orderKey, JSON.stringify(currentOrder));
        await this.adapter.put(idempKey, orderId); // Register idempotency key mapping
        await this.eventBus.publish('order.created', orderId, req.tenantId, {
            totalAmount: req.totalAmount,
            itemCount: req.items.length,
        });
        // Step 2: Attempt Inventory Reservation for all items
        const reservedItems = [];
        let reservationFailed = false;
        let reservationError = '';
        for (const item of req.items) {
            const res = await this.inventoryManager.reserve(item.sku, item.quantity, req.customerId, undefined, req.tenantId);
            if (!res.success) {
                reservationFailed = true;
                reservationError = res.error ?? 'RESERVATION_FAILED';
                break;
            }
            reservedItems.push({ sku: item.sku, quantity: item.quantity });
        }
        if (reservationFailed) {
            // Compensating action: Release any partially reserved items
            for (const resItem of reservedItems) {
                await this.inventoryManager.releaseReservation(resItem.sku, resItem.quantity, req.customerId, req.tenantId);
            }
            timeline.push({
                status: 'FAILED',
                timestampMs: Date.now(),
                note: `Inventory reservation failed: ${reservationError}`,
            });
            currentOrder = {
                ...currentOrder,
                status: 'FAILED',
                failure: { error: reservationError, sagaStepFailed: 'INVENTORY_RESERVATION' },
                updatedAtMs: Date.now(),
                timeline,
            };
            await this.adapter.put(orderKey, JSON.stringify(currentOrder));
            await this.eventBus.publish('inventory.reservation_failed', orderId, req.tenantId, {
                reason: reservationError,
            });
            return {
                success: false,
                order: currentOrder,
                error: reservationError,
                sagaStepFailed: 'INVENTORY_RESERVATION',
            };
        }
        timeline.push({ status: 'RESERVED', timestampMs: Date.now(), note: 'Inventory reserved successfully' });
        currentOrder = {
            ...currentOrder,
            status: 'RESERVED',
            updatedAtMs: Date.now(),
            timeline,
        };
        await this.adapter.put(orderKey, JSON.stringify(currentOrder));
        await this.eventBus.publish('inventory.reserved', orderId, req.tenantId);
        // Step 3: Payment Authorization (Simulated)
        if (req.simulatePaymentFailure) {
            // Payment failed -> SAGA COMPENSATION: Release all inventory reservations
            for (const resItem of reservedItems) {
                await this.inventoryManager.releaseReservation(resItem.sku, resItem.quantity, req.customerId, req.tenantId);
            }
            timeline.push({
                status: 'FAILED',
                timestampMs: Date.now(),
                note: 'Payment authorization declined by simulator; reservations released',
            });
            currentOrder = {
                ...currentOrder,
                status: 'FAILED',
                failure: { error: 'PAYMENT_DECLINED', sagaStepFailed: 'PAYMENT_AUTHORIZATION' },
                updatedAtMs: Date.now(),
                timeline,
            };
            await this.adapter.put(orderKey, JSON.stringify(currentOrder));
            await this.eventBus.publish('payment.authorization_failed', orderId, req.tenantId);
            return {
                success: false,
                order: currentOrder,
                error: 'PAYMENT_DECLINED',
                sagaStepFailed: 'PAYMENT_AUTHORIZATION',
            };
        }
        // Step 4: Confirm Order
        timeline.push({
            status: 'CONFIRMED',
            timestampMs: Date.now(),
            note: 'Payment authorized; order confirmed and queued for fulfillment',
        });
        currentOrder = {
            ...currentOrder,
            status: 'CONFIRMED',
            paymentTxId: `tx-${Date.now().toString(36)}`,
            updatedAtMs: Date.now(),
            timeline,
        };
        await this.adapter.put(orderKey, JSON.stringify(currentOrder));
        await this.eventBus.publish('order.confirmed', orderId, req.tenantId);
        return {
            success: true,
            order: currentOrder,
        };
    }
    /**
     * Cancels a confirmed order and releases inventory.
     */
    async cancelOrder(orderId, reason = 'CUSTOMER_REQUEST', tenantId = 'tenant-01') {
        return this.serialize(this.orderKey(orderId, tenantId), () => this.cancelOrderOnce(orderId, reason, tenantId));
    }
    async cancelOrderOnce(orderId, reason, tenantId) {
        const order = await this.getOrder(orderId, tenantId);
        if (!order)
            return false;
        if (order.status === 'CANCELLED') return true;
        if (order.status !== 'CONFIRMED') return false;
        // Release reservations
        for (const item of order.items) {
            if (!await this.inventoryManager.releaseReservation(item.sku, item.quantity, order.customerId, tenantId)) {
                throw new Error('Confirmed order reservation is missing.');
            }
        }
        const timeline = [
            ...order.timeline,
            { status: 'CANCELLED', timestampMs: Date.now(), note: `Cancelled: ${reason}` },
        ];
        const updated = {
            ...order,
            status: 'CANCELLED',
            updatedAtMs: Date.now(),
            timeline,
        };
        await this.adapter.put(this.orderKey(orderId, tenantId), JSON.stringify(updated));
        await this.eventBus.publish('order.cancelled', orderId, order.tenantId, { reason });
        return true;
    }
}
