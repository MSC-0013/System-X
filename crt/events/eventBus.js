import { randomUUID } from 'node:crypto';

export class EventBus {
    handlers = new Map();
    publishedEvents = [];
    // Idempotent deduplication set of processed event IDs
    processedEventIds = new Set();
    constructor(store) {
        this.store = store;
    }
    eventKey(orderId, tenantId) {
        return 'order-events:' + JSON.stringify([tenantId, orderId]);
    }
    async readOrderEvents(orderId, tenantId) {
        if (!this.store) return this.getPublishedEvents(orderId).filter(event => event.tenantId === tenantId);
        const record = await this.store.get(this.eventKey(orderId, tenantId));
        return record.found ? JSON.parse(record.value) : [];
    }
    subscribe(eventType, handler) {
        const list = this.handlers.get(eventType) ?? [];
        list.push(handler);
        this.handlers.set(eventType, list);
    }
    async publish(eventType, orderId, tenantId, payload = {}) {
        const event = {
            eventId: 'evt-' + randomUUID(),
            eventType,
            orderId,
            tenantId,
            timestampMs: Date.now(),
            payload,
            attempt: 1,
        };
        if (this.store) {
            const events = await this.readOrderEvents(orderId, tenantId);
            await this.store.put(this.eventKey(orderId, tenantId), JSON.stringify([...events, event]));
            return event;
        }
        this.publishedEvents.push(event);
        await this.dispatch(event);
        return event;
    }
    /**
     * Simulates out-of-order or duplicate event delivery.
     */
    async publishDuplicate(event) {
        const dupEvent = { ...event, attempt: event.attempt + 1 };
        this.publishedEvents.push(dupEvent);
        await this.dispatch(dupEvent);
    }
    async dispatch(event) {
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
            }
            catch (err) {
                console.error(`[EventBus] Handler error for ${event.eventType}:`, err);
            }
        }
    }
    getPublishedEvents(orderId) {
        if (orderId)
            return this.publishedEvents.filter((e) => e.orderId === orderId);
        return [...this.publishedEvents];
    }
}
