import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

const excluded = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
]) excluded.addSubnet(address, prefix);
for (const [address, prefix] of [['2001::', 32], ['2001:db8::', 32], ['2002::', 16]]) {
  excluded.addSubnet(address, prefix, 'ipv6');
}
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
const loopback = new BlockList();
loopback.addSubnet('127.0.0.0', 8);
loopback.addAddress('::1', 'ipv6');

function parseTarget(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) {
    throw new Error('Enter an HTTP or HTTPS URL of at most 2048 characters.');
  }
  const raw = value.trim();
  const url = new URL(/^https?:\/\//i.test(raw) || raw.includes('://') ? raw : 'https://' + raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Use an HTTP or HTTPS URL without credentials or fragments.');
  }
  return url;
}

export async function authorizeTarget(value, allowLocalhost, confirmed) {
  if (confirmed !== true) throw new Error('Confirm you own this target or have permission to benchmark it.');
  const url = parseTarget(value);
  const localOrigins = new Set((process.env.SYSTEM_X_LOCAL_BENCHMARK_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const publicOrigins = new Set((process.env.SYSTEM_X_BENCHMARK_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true });
  if (!addresses.length) throw new Error('The target hostname has no IP addresses.');
  const isPublic = ({ address, family }) => family === 4
    ? !excluded.check(address)
    : family === 6 && globalIpv6.check(address, 'ipv6') && !excluded.check(address, 'ipv6');
  const local = addresses.every(({ address, family }) => loopback.check(address, family === 4 ? 'ipv4' : 'ipv6'));
  if (local) {
    if (allowLocalhost !== true || !localOrigins.has(url.origin)) {
      throw new Error('This loopback origin needs server configuration and explicit local target permission.');
    }
  } else if (!addresses.every(isPublic)) {
    throw new Error('Private, reserved, and mixed public/private IP targets are blocked.');
  } else if ((publicOrigins.size || !['127.0.0.1', '::1', 'localhost'].includes(process.env.HOST ?? '127.0.0.1')) && !publicOrigins.has(url.origin)) {
    throw new Error('This origin is outside the server benchmark allowlist.');
  }
  return { url, ...addresses[0], local };
}

export function resolveBenchmarkRoute(route, target) {
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') ||
      /[\\#\x00-\x20]/.test(route) || route.length > 1024) {
    throw new Error('Routes must be origin-relative paths, such as /api/health.');
  }
  const url = new URL(route, target.url.origin);
  if (url.origin !== target.url.origin) throw new Error('Routes must stay on the approved origin.');
  return url;
}

/** Connect only to the vetted IP while keeping the URL host for TLS and HTTP. */
export function requestTarget(target, url, { method = 'GET', signal, headers = {}, body, maxBytes = 2 * 1024 * 1024, collect = false } = {}) {
  if (url.origin !== target.url.origin) throw new Error('Request escaped the approved origin.');
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(url, {
      method, headers, signal, agent: false, family: target.family,
      lookup(_hostname, options, cb) {
        if (options.all) cb(null, [{ address: target.address, family: target.family }]);
        else cb(null, target.address, target.family);
      },
    }, (response) => {
      let size = 0;
      const chunks = [];
      response.on('error', reject);
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error('Response exceeded the benchmark byte limit.'));
        } else if (collect) {
          chunks.push(chunk);
        }
      });
      response.on('end', () => resolve({
        status: response.statusCode,
        statusText: response.statusMessage,
        headers: response.headers,
        text: collect ? Buffer.concat(chunks).toString('utf8') : '',
      }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

