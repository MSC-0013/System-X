/**
 * COMMERCE RELIABILITY TESTBED (CRT) — DOMAIN & CONTRACT TYPES
 */

export type ProductStatus = 'ACTIVE' | 'ARCHIVED' | 'OUT_OF_STOCK';

export interface Product {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly category: string;
  readonly price: number;
  readonly inventorySku: string;
  readonly status: ProductStatus;
  readonly tenantId: string;
  readonly version: number;
}

export interface InventoryRecord {
  readonly tenantId: string;
  readonly sku: string;
  readonly available: number;
  readonly reserved: number;
  readonly version: number;
  readonly lastModifiedEpochMs: number;
}

export interface CartItem {
  readonly productId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly price: number;
}

export interface Cart {
  readonly cartId: string;
  readonly customerId: string;
  readonly tenantId: string;
  readonly items: CartItem[];
  readonly version: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export type OrderStatus =
  | 'PENDING'
  | 'RESERVED'
  | 'PAYMENT_AUTHORIZED'
  | 'CONFIRMED'
  | 'FULFILLING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export interface Order {
  readonly orderId: string;
  readonly customerId: string;
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly items: readonly CartItem[];
  readonly totalAmount: number;
  readonly status: OrderStatus;
  readonly reservationId?: string;
  readonly paymentTxId?: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly timeline: readonly { status: OrderStatus; timestampMs: number; note: string }[];
}

export type OrderEventType =
  | 'order.created'
  | 'inventory.reserved'
  | 'inventory.reservation_failed'
  | 'payment.authorized'
  | 'payment.authorization_failed'
  | 'order.confirmed'
  | 'order.cancelled'
  | 'shipment.updated';

export interface OrderEvent {
  readonly eventId: string;
  readonly eventType: OrderEventType;
  readonly orderId: string;
  readonly tenantId: string;
  readonly timestampMs: number;
  readonly payload: Record<string, unknown>;
  readonly attempt: number;
}

// 5 Independent Consistency Axes
export type ReplicationEngine = 'LEADERLESS' | 'LEADER' | 'RAFT';
export type ReadConsistency = 'ONE' | 'QUORUM' | 'ALL' | 'EVENTUAL' | 'SESSION' | 'CAUSAL';
export type WriteAckPolicy = 'ONE' | 'QUORUM' | 'ALL';
export type LocalDurability = 'MEMORY_ONLY' | 'BATCHED_FSYNC' | 'SYNC_FSYNC';
export type ConflictStrategy = 'LAST_WRITE_WINS' | 'VERSION_VECTOR' | 'MULTI_VALUE' | 'CUSTOM_MERGE';

export interface ConsistencyPolicy {
  readonly replicationEngine: ReplicationEngine;
  readonly readConsistency: ReadConsistency;
  readonly writeAckPolicy: WriteAckPolicy;
  readonly localDurability: LocalDurability;
  readonly conflictStrategy: ConflictStrategy;
}

export type CorrectnessVerdict = 'PASS' | 'VIOLATION' | 'INCONCLUSIVE' | 'NOT_APPLICABLE';

export interface CorrectnessAssertion {
  readonly dimension: string;
  readonly verdict: CorrectnessVerdict;
  readonly target: string;
  readonly observed: string;
  readonly details: string;
}

export interface ScenarioResult {
  readonly scenarioId: string;
  readonly name: string;
  readonly seed: number;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly assertions: readonly CorrectnessAssertion[];
  readonly metrics: {
    readonly totalRequests: number;
    readonly successfulRequests: number;
    readonly failedRequests: number;
    readonly oversoldItems: number;
    readonly lostWrites: number;
    readonly staleReads: number;
    readonly p50LatencyMs: number;
    readonly p95LatencyMs: number;
    readonly p99LatencyMs: number;
  };
}
