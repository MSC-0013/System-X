import { createHash } from 'node:crypto';

const identity = /^[A-Za-z0-9_-]{1,128}$/;
export function createCommerceAuthenticator(config = process.env.CRT_AUTH_PRINCIPALS) {
    const principals = new Map();
    for (const principal of JSON.parse(config ?? '[]')) {
        const { tokenSha256, tenantId, customerId, role } = principal;
        if (!/^[0-9a-f]{64}$/.test(tokenSha256) || typeof tenantId !== 'string' || !identity.test(tenantId) ||
            typeof customerId !== 'string' || !identity.test(customerId) || !['shopper', 'inventory-admin'].includes(role) ||
            principals.has(tokenSha256)) {
            throw new Error('Invalid or duplicate CRT principal configuration.');
        }
        principals.set(tokenSha256, Object.freeze({ tenantId, customerId, role }));
    }
    return (authorization) => {
        const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/i.exec(authorization ?? '')?.[1];
        return token ? principals.get(createHash('sha256').update(token).digest('hex')) : undefined;
    };
}
