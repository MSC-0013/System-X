import { randomBytes, createHash } from 'node:crypto';

export function commercePrincipals() {
  const a = { tenantId: 'tenant-01', customerId: 'qa-shopper', role: 'inventory-admin' };
  const b = { tenantId: 'tenant-02', customerId: 'qa-shopper', role: 'inventory-admin' };
  const buyers = Array.from({ length: 20 }, (_, index) => ({ ...a, customerId: 'buyer-' + index, role: 'shopper' }));
  const config = [a, b, ...buyers].map(principal => {
    principal.token = randomBytes(32).toString('base64url');
    const { token, ...identity } = principal;
    return { ...identity, tokenSha256: createHash('sha256').update(token).digest('hex') };
  });
  return { a, b, buyers, config: JSON.stringify(config) };
}

export async function commerceRequest(base, url, data, principal) {
  const headers = data === undefined ? {} : { 'Content-Type': 'application/json' };
  if (principal) headers.Authorization = 'Bearer ' + principal.token;
  const response = await fetch(base + url, {
    signal: AbortSignal.timeout(12000), headers,
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json() };
}
