import { Order, OrderStatus, CartItem } from '../types.js';
import { InventoryManager } from '../inventory/inventoryManager.js';
import { QuorumAdapter } from '../adapter/quorumAdapter.js';
import { EventBus } from '../events/eventBus.js';

export interface CheckoutRequest {
  readonly customerId: string;
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly items: CartItem[];
  readonly totalAmount: number;
  readonly simulatePaymentFailure?: boolean;
}

export interface CheckoutResult {
  readonly success: boolean;
  readonly order?: Order;
  readonly error?: string;
  readonly sagaStepFailed?: string;
  readonly isDuplicateSubmission?: boolean;
}

export class CheckoutSagaCoordinator {
  private readonly adapter: QuorumAdapter;
  private readonly inventoryManager: InventoryManager;
  private readonly eventBus: EventBus;

  constructor(
    adapter: QuorumAdapter,
    inventoryManager: InventoryManager,
    eventBus: EventBus
  ) {
    this.adapter = adapter;
    this.inventoryManager = inventoryManager;
    this.eventBus = eventBus;
  }

  private orderKey(orderId: string): string {
    return `order:${orderId}`;
  }

  private idempotencyKey(key: string): string {
    return `idempotency:${key}`;
  }

  public async getOrder(orderId: string): Promise<Order | null> {
    const res = await this.adapter.get(this.orderKey(orderId));
    if (!res.found || !res.value) return null;
    return JSON.parse(res.value) as Order;
  }

  /**
   * Executes the Checkout Saga with Idempotency, Inventory Reservation & Payment Compensation.
   */
  public async executeCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    // 1. Idempotency Check
    const idempKey = this.idempotencyKey(req.idempotencyKey);
    const existingIdemp = await this.adapter.get(idempKey);
    if (existingIdemp.found && existingIdemp.value) {
      const existingOrderId = existingIdemp.value;
      const existingOrder = await this.getOrder(existingOrderId);
      if (existingOrder) {
        return {
          success: true,
          order: existingOrder,
          isDuplicateSubmission: true,
        };
      }
    }

    const orderId = `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const timeline: { status: OrderStatus; timestampMs: number; note: string }[] = [];

    // Step 1: Create Order Intent in PENDING state
    timeline.push({ status: 'PENDING', timestampMs: Date.now(), note: 'Order intent created' });
    let currentOrder: Order = {
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

    await this.adapter.put(this.orderKey(orderId), JSON.stringify(currentOrder));
    await this.adapter.put(idempKey, orderId); // Register idempotency key mapping

    await this.eventBus.publish('order.created', orderId, req.tenantId, {
      totalAmount: req.totalAmount,
      itemCount: req.items.length,
    });

    // Step 2: Attempt Inventory Reservation for all items
    const reservedItems: Array<{ sku: string; quantity: number }> = [];
    let reservationFailed = false;
    let reservationError = '';

    for (const item of req.items) {
      const res = await this.inventoryManager.reserve(item.sku, item.quantity, req.customerId);
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
        await this.inventoryManager.releaseReservation(resItem.sku, resItem.quantity, req.customerId);
      }

      timeline.push({
        status: 'FAILED',
        timestampMs: Date.now(),
        note: `Inventory reservation failed: ${reservationError}`,
      });
      currentOrder = {
        ...currentOrder,
        status: 'FAILED',
        updatedAtMs: Date.now(),
        timeline,
      };
      await this.adapter.put(this.orderKey(orderId), JSON.stringify(currentOrder));
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
    await this.adapter.put(this.orderKey(orderId), JSON.stringify(currentOrder));
    await this.eventBus.publish('inventory.reserved', orderId, req.tenantId);

    // Step 3: Payment Authorization (Simulated)
    if (req.simulatePaymentFailure) {
      // Payment failed -> SAGA COMPENSATION: Release all inventory reservations
      for (const resItem of reservedItems) {
        await this.inventoryManager.releaseReservation(resItem.sku, resItem.quantity, req.customerId);
      }

      timeline.push({
        status: 'FAILED',
        timestampMs: Date.now(),
        note: 'Payment authorization declined by simulator; reservations released',
      });
      currentOrder = {
        ...currentOrder,
        status: 'FAILED',
        updatedAtMs: Date.now(),
        timeline,
      };
      await this.adapter.put(this.orderKey(orderId), JSON.stringify(currentOrder));
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

    await this.adapter.put(this.orderKey(orderId), JSON.stringify(currentOrder));
    await this.eventBus.publish('order.confirmed', orderId, req.tenantId);

    return {
      success: true,
      order: currentOrder,
    };
  }

  /**
   * Cancels a confirmed order and releases inventory.
   */
  public async cancelOrder(orderId: string, reason = 'CUSTOMER_REQUEST'): Promise<boolean> {
    const order = await this.getOrder(orderId);
    if (!order) return false;
    if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
      return false; // Cannot cancel already shipped orders
    }

    // Release reservations
    for (const item of order.items) {
      await this.inventoryManager.releaseReservation(item.sku, item.quantity, order.customerId);
    }

    const timeline = [
      ...order.timeline,
      { status: 'CANCELLED' as OrderStatus, timestampMs: Date.now(), note: `Cancelled: ${reason}` },
    ];
    const updated: Order = {
      ...order,
      status: 'CANCELLED',
      updatedAtMs: Date.now(),
      timeline,
    };

    await this.adapter.put(this.orderKey(orderId), JSON.stringify(updated));
    await this.eventBus.publish('order.cancelled', orderId, order.tenantId, { reason });
    return true;
  }
}
