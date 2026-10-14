import { Cart, CartItem } from '../types.js';
import { QuorumAdapter } from '../adapter/quorumAdapter.js';

export class CartService {
  private readonly adapter: QuorumAdapter;

  constructor(adapter: QuorumAdapter) {
    this.adapter = adapter;
  }

  private cartKey(cartId: string): string {
    return `cart:${cartId}`;
  }

  public async getCart(cartId: string, clientId?: string): Promise<Cart | null> {
    const key = this.cartKey(cartId);
    try {
      const res = await this.adapter.get(key, { clientId });
      if (!res.found || !res.value) return null;
      return JSON.parse(res.value) as Cart;
    } catch {
      return null;
    }
  }

  public async addItem(
    cartId: string,
    customerId: string,
    tenantId: string,
    item: CartItem,
    clientId = 'client-cart'
  ): Promise<Cart> {
    const key = this.cartKey(cartId);
    let existing = await this.getCart(cartId, clientId);

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
    } else {
      const items = [...existing.items];
      const idx = items.findIndex((i) => i.productId === item.productId);
      if (idx !== -1) {
        items[idx] = { ...items[idx]!, quantity: items[idx]!.quantity + item.quantity };
      } else {
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

  public async clearCart(cartId: string, clientId = 'client-cart'): Promise<void> {
    const key = this.cartKey(cartId);
    await this.adapter.delete(key, { clientId });
  }
}
