export class InventoryManager {
    adapter;
    // Per-SKU mutex queue to prevent race conditions during atomic check-and-reserve
    skuLocks = new Map();
    constructor(adapter) {
        this.adapter = adapter;
    }
    inventoryKey(sku, tenantId) {
        return 'inventory:' + JSON.stringify([tenantId, sku]);
    }
    async acquireLock(sku) {
        while (this.skuLocks.has(sku)) {
            await this.skuLocks.get(sku);
        }
        let releaseLock;
        const lockPromise = new Promise((resolve) => {
            releaseLock = resolve;
        });
        this.skuLocks.set(sku, lockPromise);
        return () => {
            this.skuLocks.delete(sku);
            releaseLock();
        };
    }
    /**
     * Initializes or updates stock for a given SKU in QUORUM LAB.
     */
    async setStock(tenantId, sku, available, reserved = 0) {
        if (!Number.isSafeInteger(available) || !Number.isSafeInteger(reserved) || available < 0 || reserved < 0) {
            throw new RangeError('Stock counts must be non-negative integers.');
        }
        const key = this.inventoryKey(sku, tenantId);
        const unlock = await this.acquireLock(key);
        try {
            const cur = await this.adapter.get(key);
            const currentVersion = cur.found ? JSON.parse(cur.value).version + 1 : 1;
            const record = {
                tenantId,
                sku,
                available,
                reserved,
                version: currentVersion,
                lastModifiedEpochMs: Date.now(),
            };
            await this.adapter.put(key, JSON.stringify(record));
            return record;
        }
        finally {
            unlock();
        }
    }
    /**
     * Reads current inventory from QUORUM LAB.
     */
    async getStock(sku, targetNodeId, tenantId = 'tenant-01') {
        const res = await this.adapter.get(this.inventoryKey(sku, tenantId), { targetNodeId });
        return res.found ? JSON.parse(res.value) : null;
    }
    /**
     * ATOMIC INVENTORY RESERVATION PROTOCOL
     *
     * Executes atomic check-and-reserve:
     * 1. Reads current state from Quorum Lab.
     * 2. Checks available >= quantity.
     * 3. Mutates (available -= quantity, reserved += quantity).
     * 4. Updates version in Quorum Lab.
     * 5. If available < quantity, strictly rejects with OUT_OF_STOCK (0 overselling).
     */
    async reserve(sku, quantity, clientId = 'client-checkout', runId = 'crt-run', tenantId = 'tenant-01') {
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
            return { success: false, sku, requestedQuantity: quantity, error: 'INVALID_QUANTITY' };
        }
        const key = this.inventoryKey(sku, tenantId);
        const unlock = await this.acquireLock(key);
        try {
            const res = await this.adapter.get(key, { clientId, runId });
            if (!res.found || !res.value) {
                return {
                    success: false,
                    sku,
                    requestedQuantity: quantity,
                    remainingAvailable: 0,
                    error: 'SKU_NOT_FOUND',
                    version: 0,
                };
            }
            const current = JSON.parse(res.value);
            if (current.available < quantity) {
                return {
                    success: false,
                    sku,
                    requestedQuantity: quantity,
                    remainingAvailable: current.available,
                    error: 'INSUFFICIENT_STOCK',
                    version: current.version,
                };
            }
            const reservationId = `res-${sku}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const updated = {
                ...current,
                available: current.available - quantity,
                reserved: current.reserved + quantity,
                version: current.version + 1,
                lastModifiedEpochMs: Date.now(),
            };
            await this.adapter.put(key, JSON.stringify(updated), {
                clientId,
                runId,
                operationId: reservationId,
            });
            return {
                success: true,
                reservationId,
                sku,
                requestedQuantity: quantity,
                remainingAvailable: updated.available,
                version: updated.version,
            };
        }
        finally {
            unlock();
        }
    }
    /**
     * COMPENSATING SAGA ACTION: Release reservation on checkout failure or cancellation.
     */
    async releaseReservation(sku, quantity, clientId = 'client-compensation', tenantId = 'tenant-01') {
        if (!Number.isSafeInteger(quantity) || quantity <= 0) return false;
        const key = this.inventoryKey(sku, tenantId);
        const unlock = await this.acquireLock(key);
        try {
            const res = await this.adapter.get(key, { clientId });
            if (!res.found || !res.value)
                return false;
            const current = JSON.parse(res.value);
            if (current.reserved < quantity) return false;
            const updated = {
                ...current,
                available: current.available + quantity,
                reserved: current.reserved - quantity,
                version: current.version + 1,
                lastModifiedEpochMs: Date.now(),
            };
            await this.adapter.put(key, JSON.stringify(updated), { clientId });
            return true;
        }
        finally {
            unlock();
        }
    }
}
