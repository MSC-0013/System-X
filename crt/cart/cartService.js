export class CartService {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    cartKey(cartId, tenantId, customerId) {
        return 'cart:' + JSON.stringify([tenantId, customerId, cartId]);
    }
    async getCart(cartId, clientId, tenantId = 'tenant-01', customerId = 'cust-1') {
        const res = await this.adapter.get(this.cartKey(cartId, tenantId, customerId), { clientId });
        return res.found ? JSON.parse(res.value) : null;
    }
    async addItem(cartId, customerId, tenantId, item, clientId = 'client-cart') {
        const key = this.cartKey(cartId, tenantId, customerId);
        let existing = await this.getCart(cartId, clientId, tenantId, customerId);
        if (!existing) {
            existing = {
                cartId,
                customerId,
                tenantId,
                items: [item],
                version: 1,
                createdAtMs: Date.now(),
                updatedAtMs: Date.now(),
            };
        }
        else {
            const items = [...existing.items];
            const idx = items.findIndex((i) => i.productId === item.productId);
            if (idx !== -1) {
                items[idx] = { ...items[idx], quantity: items[idx].quantity + item.quantity };
            }
            else {
                items.push(item);
            }
            existing = {
                ...existing,
                items,
                version: existing.version + 1,
                updatedAtMs: Date.now(),
            };
        }
        await this.adapter.put(key, JSON.stringify(existing), { clientId });
        return existing;
    }
    async clearCart(cartId, clientId = 'client-cart', tenantId = 'tenant-01', customerId = 'cust-1') {
        const key = this.cartKey(cartId, tenantId, customerId);
        await this.adapter.delete(key, { clientId });
    }
}
