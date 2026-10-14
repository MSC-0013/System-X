import { Product } from '../types.js';

const CATEGORIES = ['Electronics', 'Computing', 'Mobile', 'Audio', 'Wearables', 'Storage', 'Accessories', 'Gaming'];

/**
 * Deterministically generates ~1,000 realistic e-commerce products.
 */
export function generateDeterministicProducts(tenantId = 'tenant-ecommerce-01', count = 1000, seed = 1337): Product[] {
  const products: Product[] = [];

  // Critical test SKU explicitly inserted at index 0
  products.push({
    id: 'prod-rare-phone-001',
    sku: 'PHONE-001',
    name: 'Flagship Quantum Phone Pro (Collector Edition)',
    category: 'Mobile',
    price: 1199.99,
    inventorySku: 'PHONE-001',
    status: 'ACTIVE',
    tenantId,
    version: 1,
  });

  // Simple LCG PRNG for repeatable catalog generation
  let state = seed;
  const nextRand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const prefixes = ['Pro', 'Ultra', 'Core', 'Prime', 'Hyper', 'Titan', 'Apex', 'Vortex', 'Nexus', 'Pulse'];
  const nouns = ['Laptop', 'Headphones', 'Tablet', 'Monitor', 'Keyboard', 'Mouse', 'Router', 'Drive', 'Camera', 'Speaker'];

  for (let i = 1; i < count; i++) {
    const cat = CATEGORIES[Math.floor(nextRand() * CATEGORIES.length)]!;
    const prefix = prefixes[Math.floor(nextRand() * prefixes.length)]!;
    const noun = nouns[Math.floor(nextRand() * nouns.length)]!;
    const modelNum = 100 + Math.floor(nextRand() * 900);
    const sku = `${noun.slice(0, 3).toUpperCase()}-${modelNum}`;
    const price = Math.round((29.99 + nextRand() * 1950) * 100) / 100;

    products.push({
      id: `prod-${i.toString().padStart(4, '0')}`,
      sku,
      name: `${prefix} ${noun} ${modelNum}`,
      category: cat,
      price,
      inventorySku: sku,
      status: 'ACTIVE',
      tenantId,
      version: 1,
    });
  }

  return products;
}
