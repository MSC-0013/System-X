import { InventoryRecord } from '../types.js';
import { QuorumAdapter } from '../adapter/quorumAdapter.js';

export interface ReservationResult {
  readonly success: boolean;
  readonly reservationId?: string;
  readonly sku: string;
  readonly requestedQuantity: number;
  readonly remainingAvailable: number;
  readonly error?: string;
  readonly version: number;
}

export class InventoryManager {
  private readonly adapter: QuorumAdapter;
  // Per-SKU mutex queue to prevent race conditions during atomic check-and-reserve
  private readonly skuLocks = new Map<string, Promise<void>>();

  constructor(adapter: QuorumAdapter) {
    this.adapter = adapter;
  }

  private inventoryKey(sku: string): string {
    return `inventory:${sku}`;
  }

  private async acquireLock(sku: string): Promise<() => void> {
    while (this.skuLocks.has(sku)) {
      await this.skuLocks.get(sku);
    }
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
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
  public async setStock(
    tenantId: string,
    sku: string,
    available: number,
    reserved = 0
  ): Promise<InventoryRecord> {
    const key = this.inventoryKey(sku);
    const unlock = await this.acquireLock(sku);

    try {
      let currentVersion = 1;
      try {
        const cur = await this.adapter.get(key);
        if (cur.found && cur.value) {
          const parsed = JSON.parse(cur.value) as InventoryRecord;
          currentVersion = (parsed.version ?? 0) + 1;
        }
      } catch {}

      const record: InventoryRecord = {
        tenantId,
        sku,
        available,
        reserved,
        version: currentVersion,
        lastModifiedEpochMs: Date.now(),
      };

      await this.adapter.put(key, JSON.stringify(record));
      return record;
    } finally {
      unlock();
    }
  }

  /**
   * Reads current inventory from QUORUM LAB.
   */
  public async getStock(sku: string, targetNodeId?: string): Promise<InventoryRecord | null> {
    const key = this.inventoryKey(sku);
    try {
      const res = await this.adapter.get(key, { targetNodeId });
      if (!res.found || !res.value) return null;
      return JSON.parse(res.value) as InventoryRecord;
    } catch {
      return null;
    }
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
  public async reserve(
    sku: string,
    quantity: number,
    clientId = 'client-checkout',
    runId = 'crt-run'
  ): Promise<ReservationResult> {
    const key = this.inventoryKey(sku);
    const unlock = await this.acquireLock(sku);

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

      const current = JSON.parse(res.value) as InventoryRecord;

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
      const updated: InventoryRecord = {
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
    } finally {
      unlock();
    }
  }

  /**
   * COMPENSATING SAGA ACTION: Release reservation on checkout failure or cancellation.
   */
  public async releaseReservation(
    sku: string,
    quantity: number,
    clientId = 'client-compensation'
  ): Promise<boolean> {
    const key = this.inventoryKey(sku);
    const unlock = await this.acquireLock(sku);

    try {
      const res = await this.adapter.get(key, { clientId });
      if (!res.found || !res.value) return false;

      const current = JSON.parse(res.value) as InventoryRecord;
      const updated: InventoryRecord = {
        ...current,
        available: current.available + quantity,
        reserved: Math.max(0, current.reserved - quantity),
        version: current.version + 1,
        lastModifiedEpochMs: Date.now(),
      };

      await this.adapter.put(key, JSON.stringify(updated), { clientId });
      return true;
    } finally {
      unlock();
    }
  }
}
