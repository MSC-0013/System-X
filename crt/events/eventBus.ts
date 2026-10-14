import { OrderEvent, OrderEventType } from '../types.js';

export type EventHandler = (event: OrderEvent) => Promise<void>;

export class EventBus {
  private readonly handlers = new Map<OrderEventType, EventHandler[]>();
  private readonly publishedEvents: OrderEvent[] = [];
  // Idempotent deduplication set of processed event IDs
  private readonly processedEventIds = new Set<string>();

  public subscribe(eventType: OrderEventType, handler: EventHandler): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }

  public async publish(
    eventType: OrderEventType,
    orderId: string,
    tenantId: string,
    payload: Record<string, unknown> = {}
  ): Promise<OrderEvent> {
    const event: OrderEvent = {
      eventId: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      eventType,
      orderId,
      tenantId,
      timestampMs: Date.now(),
      payload,
      attempt: 1,
    };

    this.publishedEvents.push(event);
    await this.dispatch(event);
    return event;
  }

  /**
   * Simulates out-of-order or duplicate event delivery.
   */
  public async publishDuplicate(event: OrderEvent): Promise<void> {
    const dupEvent = { ...event, attempt: event.attempt + 1 };
    this.publishedEvents.push(dupEvent);
    await this.dispatch(dupEvent);
  }

  private async dispatch(event: OrderEvent): Promise<void> {
    // Idempotent processing check
    if (this.processedEventIds.has(event.eventId)) {
      // Event already processed: consumer deduplication prevents second side effect
      return;
    }
    this.processedEventIds.add(event.eventId);

    const handlers = this.handlers.get(event.eventType) ?? [];
    for (const h of handlers) {
      try {
        await h(event);
      } catch (err) {
        console.error(`[EventBus] Handler error for ${event.eventType}:`, err);
      }
    }
  }

  public getPublishedEvents(orderId?: string): OrderEvent[] {
    if (orderId) return this.publishedEvents.filter((e) => e.orderId === orderId);
    return [...this.publishedEvents];
  }
}
