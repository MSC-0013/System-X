import { Product } from '../types.js';
import { generateDeterministicProducts } from './seedData.js';

export class CatalogService {
  private readonly productsById = new Map<string, Product>();
  private readonly productsBySku = new Map<string, Product>();

  constructor(tenantId = 'tenant-ecommerce-01', count = 1000, seed = 1337) {
    const list = generateDeterministicProducts(tenantId, count, seed);
    for (const p of list) {
      this.productsById.set(p.id, p);
      this.productsBySku.set(p.sku, p);
    }
  }

  public listProducts(options: {
    category?: string;
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): { total: number; products: Product[] } {
    let filtered = Array.from(this.productsById.values());

    if (options.category) {
      filtered = filtered.filter((p) => p.category.toLowerCase() === options.category!.toLowerCase());
    }

    if (options.search) {
      const q = options.search.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }

    const total = filtered.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;

    return {
      total,
      products: filtered.slice(offset, offset + limit),
    };
  }

  public getProductById(id: string): Product | undefined {
    return this.productsById.get(id);
  }

  public getProductBySku(sku: string): Product | undefined {
    return this.productsBySku.get(sku);
  }
}
