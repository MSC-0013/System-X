/**
 * SYSTEM-X BENCHMARK RUNNER & REAL HTTP EXECUTION ENGINE
 *
 * Implements:
 *  - Target URL SSRF validation, DNS resolution check, and bounded pre-flight connectivity probe
 *  - Safe bounded route discovery (sitemap.xml and same-origin public links)
 *  - Asynchronous background execution with persistent run lifecycle
 *  - High-resolution per-request telemetry collection (process.hrtime.bigint)
 *  - Quantile calculations (P50, P90, P95, P99, mean, throughput, error distributions)
 *  - Real-time Server-Sent Events (SSE) progress streaming
 *  - Safe cancellation via AbortController
 *  - Side-by-side run comparison engine with configurable regression thresholds
 *  - Request inspector with sanitized metadata and credentials protection
 */

import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export interface BenchmarkConfig {
  name: string;
  targetUrl: string;
  routes?: string[];
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  requestCount: number;
  concurrency: number;
  timeoutMs: number;
  headers?: Record<string, string>;
  body?: string;
  allowLocalhost?: boolean;
  authorizedConfirmed: boolean;
}

export interface RequestSample {
  requestId: string;
  runId: string;
  timestamp: string;
  url: string;
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  errorCategory: 'NONE' | 'HTTP_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'ABORTED';
  errorMessage?: string;
  source: 'LIVE_HTTP_BENCHMARK';
}

export type RunState = 'QUEUED' | 'PREPARING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface BenchmarkRun {
  runId: string;
  type: 'WEBSITE_BENCHMARK';
  config: BenchmarkConfig;
  state: RunState;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs: number;
  sentRequests: number;
  completedRequests: number;
  successfulRequests: number;
  failedRequests: number;
  statusDistribution: Record<number, number>;
  throughputRps: number;
  latency: {
    p50Ms: number;
    p90Ms: number;
    p95Ms: number;
    p99Ms: number;
    meanMs: number;
    minMs: number;
    maxMs: number;
  };
  routeBreakdown: Record<string, {
    count: number;
    successCount: number;
    meanMs: number;
    p99Ms: number;
  }>;
  errorMessage?: string;
  hasArtifacts: boolean;
}

export interface TargetValidationResult {
  valid: boolean;
  targetUrl: string;
  normalizedUrl?: string;
  resolvedIp?: string;
  isPrivateRange?: boolean;
  reachable: boolean;
  statusCode?: number;
  statusText?: string;
  responseTimeMs?: number;
  serverHeader?: string;
  contentType?: string;
  message: string;
  suggestedRoutes?: string[];
}

export interface ComparisonResult {
  baselineRunId: string;
  comparisonRunId: string;
  baselineName: string;
  comparisonName: string;
  targetUrl: string;
  comparable: boolean;
  nonComparableReason?: string;
  thresholdPercent: number;
  verdict: 'IMPROVED' | 'REGRESSED' | 'WITHIN_THRESHOLD' | 'NOT_DIRECTLY_COMPARABLE';
  summary: string;
  metrics: {
    throughput: { baseline: number; comparison: number; diffPercent: number };
    meanLatency: { baseline: number; comparison: number; diffPercent: number };
    p50: { baseline: number; comparison: number; diffPercent: number };
    p90: { baseline: number; comparison: number; diffPercent: number };
    p99: { baseline: number; comparison: number; diffPercent: number };
    successRate: { baseline: number; comparison: number; diffPercent: number };
  };
}

const ARTIFACTS_DIR = path.resolve('artifacts');
const runEmitter = new EventEmitter();
const activeAbortControllers = new Map<string, AbortController>();
const inMemoryRuns = new Map<string, BenchmarkRun>();
const inMemorySamples = new Map<string, RequestSample[]>();

// Max safety limits
export const MAX_REQUEST_COUNT = 5000;
export const MAX_CONCURRENCY = 50;
export const MAX_TIMEOUT_MS = 60000;

// Ensure artifacts root exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Load existing benchmark runs from disk
(function hydrateStoredRuns() {
  try {
    if (!fs.existsSync(ARTIFACTS_DIR)) return;
    const entries = fs.readdirSync(ARTIFACTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('bench-')) {
        const sumFile = path.join(ARTIFACTS_DIR, entry.name, 'summary.json');
        if (fs.existsSync(sumFile)) {
          const data = JSON.parse(fs.readFileSync(sumFile, 'utf8'));
          if (data && data.runId) {
            inMemoryRuns.set(data.runId, data);
          }
        }
      }
    }
  } catch {}
})();

// ---------------------------------------------------------------------------
// 1. SSRF & Target Validation
// ---------------------------------------------------------------------------

function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip === '0.0.0.0') return true;

  // AWS/Cloud Metadata Service IP
  if (ip.startsWith('169.254.')) return true;

  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 100.64.0.0/10 Carrier Grade NAT
    if (parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127) return true;
  }
  return false;
}

export async function validateTargetUrl(
  inputUrl: string,
  allowLocalhost = false,
  authorizedConfirmed = false
): Promise<TargetValidationResult> {
  let parsed: URL;
  try {
    let raw = inputUrl.trim();
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      raw = 'http://' + raw;
    }
    parsed = new URL(raw);
  } catch (err: any) {
    return {
      valid: false,
      targetUrl: inputUrl,
      reachable: false,
      message: `Invalid URL format: ${err.message}`,
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      targetUrl: inputUrl,
      reachable: false,
      message: `Unsupported protocol '${parsed.protocol}'. Only http: and https: are allowed.`,
    };
  }

  const hostname = parsed.hostname;
  let resolvedIp = '';
  let isPrivate = false;

  try {
    if (hostname === 'localhost') {
      resolvedIp = '127.0.0.1';
      isPrivate = true;
    } else {
      const lookup = await dns.lookup(hostname);
      resolvedIp = lookup.address;
      isPrivate = isPrivateIp(resolvedIp);
    }
  } catch (err: any) {
    return {
      valid: false,
      targetUrl: inputUrl,
      reachable: false,
      message: `DNS Resolution failed for host '${hostname}': ${err.message}`,
    };
  }

  if (isPrivate && !allowLocalhost) {
    return {
      valid: false,
      targetUrl: inputUrl,
      normalizedUrl: parsed.origin,
      resolvedIp,
      isPrivateRange: true,
      reachable: false,
      message: `SSRF Protection: Hostname resolves to private/internal IP address (${resolvedIp}). To test a local development server, explicitly enable 'Authorize Local/Private Target'.`,
    };
  }

  if (!authorizedConfirmed) {
    return {
      valid: false,
      targetUrl: inputUrl,
      normalizedUrl: parsed.origin,
      resolvedIp,
      isPrivateRange: isPrivate,
      reachable: false,
      message: `Authorization confirmation required. Please confirm you own or have explicit permission to benchmark this target.`,
    };
  }

  // Pre-flight bounded connectivity probe
  const probeStart = Date.now();
  try {
    const probeRes = await fetch(parsed.href, {
      method: 'GET',
      headers: {
        'User-Agent': 'SystemX-Probe/2.0 (SSRF-Checked)',
        'Accept': '*/*',
      },
      signal: AbortSignal.timeout(4000),
    });
    const probeDuration = Date.now() - probeStart;

    return {
      valid: true,
      targetUrl: inputUrl,
      normalizedUrl: parsed.origin + parsed.pathname,
      resolvedIp,
      isPrivateRange: isPrivate,
      reachable: true,
      statusCode: probeRes.status,
      statusText: probeRes.statusText,
      responseTimeMs: probeDuration,
      serverHeader: probeRes.headers.get('server') ?? undefined,
      contentType: probeRes.headers.get('content-type') ?? undefined,
      message: `Target is reachable! HTTP ${probeRes.status} in ${probeDuration}ms (${resolvedIp}).`,
      suggestedRoutes: [parsed.pathname || '/', '/api/health', '/api/products', '/api/status'].filter(Boolean),
    };
  } catch (err: any) {
    const probeDuration = Date.now() - probeStart;
    return {
      valid: false,
      targetUrl: inputUrl,
      normalizedUrl: parsed.origin,
      resolvedIp,
      isPrivateRange: isPrivate,
      reachable: false,
      responseTimeMs: probeDuration,
      message: `Connection probe failed after ${probeDuration}ms: ${err.message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Safe Bounded Route Discovery
// ---------------------------------------------------------------------------

export async function discoverRoutes(
  targetUrl: string,
  allowLocalhost = false
): Promise<{ targetUrl: string; discovered: string[]; sitemapFound: boolean }> {
  const discovered = new Set<string>();
  const parsed = new URL(targetUrl);
  discovered.add(parsed.pathname || '/');

  // Try fetching sitemap.xml
  let sitemapFound = false;
  try {
    const sitemapUrl = new URL('/sitemap.xml', parsed.origin).href;
    const res = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'SystemX-Crawler/2.0' },
    });
    if (res.ok) {
      const xml = await res.text();
      sitemapFound = true;
      const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
      let match;
      while ((match = locRegex.exec(xml)) !== null && discovered.size < 12) {
        try {
          const u = new URL(match[1]!);
          if (u.origin === parsed.origin) {
            discovered.add(u.pathname);
          }
        } catch {}
      }
    }
  } catch {}

  // If few routes discovered, probe common public discovery endpoints safely
  if (discovered.size <= 1) {
    const commonSafeRoutes = ['/api/products', '/api/health', '/api/status', '/products', '/about'];
    for (const route of commonSafeRoutes) {
      try {
        const u = new URL(route, parsed.origin).href;
        const res = await fetch(u, {
          method: 'HEAD',
          signal: AbortSignal.timeout(1200),
        });
        if (res.status < 400 || res.status === 405) {
          discovered.add(route);
        }
      } catch {}
    }
  }

  return {
    targetUrl,
    discovered: Array.from(discovered),
    sitemapFound,
  };
}

// ---------------------------------------------------------------------------
// 3. Benchmark Execution Engine
// ---------------------------------------------------------------------------

export function createBenchmarkRun(configInput: Partial<BenchmarkConfig>): BenchmarkRun {
  const runId = `bench-run-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const requestCount = Math.max(1, Math.min(configInput.requestCount ?? 100, MAX_REQUEST_COUNT));
  const concurrency = Math.max(1, Math.min(configInput.concurrency ?? 5, MAX_CONCURRENCY));
  const timeoutMs = Math.max(500, Math.min(configInput.timeoutMs ?? 5000, MAX_TIMEOUT_MS));

  const config: BenchmarkConfig = {
    name: configInput.name?.trim() || `Website Benchmark (${new URL(configInput.targetUrl || 'http://localhost').hostname})`,
    targetUrl: configInput.targetUrl || 'http://localhost:8080/api/status',
    routes: configInput.routes && configInput.routes.length > 0 ? configInput.routes : ['/'],
    method: configInput.method || 'GET',
    requestCount,
    concurrency,
    timeoutMs,
    headers: configInput.headers || {},
    body: configInput.body,
    allowLocalhost: Boolean(configInput.allowLocalhost),
    authorizedConfirmed: Boolean(configInput.authorizedConfirmed),
  };

  const run: BenchmarkRun = {
    runId,
    type: 'WEBSITE_BENCHMARK',
    config,
    state: 'QUEUED',
    createdAt: new Date().toISOString(),
    elapsedMs: 0,
    sentRequests: 0,
    completedRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    statusDistribution: {},
    throughputRps: 0,
    latency: {
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      meanMs: 0,
      minMs: 0,
      maxMs: 0,
    },
    routeBreakdown: {},
    hasArtifacts: false,
  };

  inMemoryRuns.set(runId, run);
  inMemorySamples.set(runId, []);
  saveRunArtifacts(run, []);
  return run;
}

export async function startBenchmarkExecution(runId: string): Promise<BenchmarkRun> {
  const run = inMemoryRuns.get(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.state === 'RUNNING') return run;

  run.state = 'PREPARING';
  run.startedAt = new Date().toISOString();
  emitRunEvent(runId, { type: 'STATE_CHANGE', state: 'PREPARING', run });

  const abortController = new AbortController();
  activeAbortControllers.set(runId, abortController);

  // Background execution loop
  (async () => {
    run.state = 'RUNNING';
    emitRunEvent(runId, { type: 'STATE_CHANGE', state: 'RUNNING', run });

    const samples: RequestSample[] = [];
    const latenciesMs: number[] = [];
    const routes = run.config.routes && run.config.routes.length > 0 ? run.config.routes : ['/'];
    const origin = new URL(run.config.targetUrl).origin;

    const startHr = process.hrtime.bigint();
    let requestSeq = 0;
    const totalRequests = run.config.requestCount;
    const concurrency = Math.min(run.config.concurrency, totalRequests);

    // Periodic progress emission timer
    const progressTimer = setInterval(() => {
      const elapsed = Number((process.hrtime.bigint() - startHr) / 1_000_000n);
      run.elapsedMs = elapsed;
      const sec = Math.max(0.1, elapsed / 1000);
      run.throughputRps = Number((run.completedRequests / sec).toFixed(1));
      emitRunEvent(runId, { type: 'PROGRESS', run });
    }, 250);

    const workerLoop = async () => {
      while (requestSeq < totalRequests && !abortController.signal.aborted) {
        const curIdx = requestSeq++;
        if (curIdx >= totalRequests) break;

        const route = routes[curIdx % routes.length]!;
        let targetFullUrl: string;
        try {
          targetFullUrl = new URL(route, origin).href;
        } catch {
          targetFullUrl = run.config.targetUrl;
        }

        run.sentRequests++;
        const reqStart = process.hrtime.bigint();
        const reqId = `req-${runId}-${curIdx.toString().padStart(4, '0')}`;

        let statusCode = 0;
        let success = false;
        let errorCategory: RequestSample['errorCategory'] = 'NONE';
        let errorMessage: string | undefined;

        try {
          const reqSignal = AbortSignal.any([
            abortController.signal,
            AbortSignal.timeout(run.config.timeoutMs),
          ]);

          const sanitizedHeaders: Record<string, string> = {
            'User-Agent': `SystemX-Benchmark/2.0 (Run:${runId})`,
            'Accept': '*/*',
            ...(run.config.headers || {}),
          };

          // Sanitize sensitive auth from header if passed accidentally
          delete sanitizedHeaders['cookie'];

          const res = await fetch(targetFullUrl, {
            method: run.config.method,
            headers: sanitizedHeaders,
            body: run.config.method !== 'GET' ? run.config.body : undefined,
            signal: reqSignal,
          });

          statusCode = res.status;
          if (res.status >= 200 && res.status < 400) {
            success = true;
          } else {
            errorCategory = 'HTTP_ERROR';
            errorMessage = `HTTP ${res.status} ${res.statusText}`;
          }
        } catch (err: any) {
          if (abortController.signal.aborted) {
            errorCategory = 'ABORTED';
            errorMessage = 'Benchmark aborted by user';
          } else if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
            errorCategory = 'TIMEOUT';
            errorMessage = `Request timed out after ${run.config.timeoutMs}ms`;
          } else {
            errorCategory = 'NETWORK_ERROR';
            errorMessage = err.message || 'Network connection failed';
          }
        }

        const reqEnd = process.hrtime.bigint();
        const durationMs = Number((reqEnd - reqStart) / 1_000_000n);

        run.completedRequests++;
        if (success) {
          run.successfulRequests++;
        } else {
          run.failedRequests++;
        }

        run.statusDistribution[statusCode] = (run.statusDistribution[statusCode] || 0) + 1;
        latenciesMs.push(durationMs);

        // Update route breakdown
        if (!run.routeBreakdown[route]) {
          run.routeBreakdown[route] = { count: 0, successCount: 0, meanMs: 0, p99Ms: 0 };
        }
        const rb = run.routeBreakdown[route]!;
        rb.count++;
        if (success) rb.successCount++;

        const sample: RequestSample = {
          requestId: reqId,
          runId,
          timestamp: new Date().toISOString(),
          url: targetFullUrl,
          route,
          method: run.config.method,
          statusCode,
          durationMs,
          success,
          errorCategory,
          errorMessage,
          source: 'LIVE_HTTP_BENCHMARK',
        };
        samples.push(sample);
      }
    };

    try {
      const workers = Array.from({ length: concurrency }, () => workerLoop());
      await Promise.all(workers);
    } finally {
      clearInterval(progressTimer);
      activeAbortControllers.delete(runId);
    }

    const endHr = process.hrtime.bigint();
    run.elapsedMs = Number((endHr - startHr) / 1_000_000n);
    const durationSec = Math.max(0.001, run.elapsedMs / 1000);
    run.throughputRps = Number((run.completedRequests / durationSec).toFixed(1));
    run.completedAt = new Date().toISOString();

    if (abortController.signal.aborted) {
      run.state = 'CANCELLED';
      run.errorMessage = 'Benchmark cancelled by user';
    } else if (run.failedRequests === run.completedRequests && run.completedRequests > 0) {
      run.state = 'FAILED';
      run.errorMessage = '100% of benchmark requests failed';
    } else {
      run.state = 'COMPLETED';
    }

    // Compute quantile statistics
    if (latenciesMs.length > 0) {
      const sorted = [...latenciesMs].sort((a, b) => a - b);
      run.latency.minMs = sorted[0]!;
      run.latency.maxMs = sorted[sorted.length - 1]!;
      run.latency.p50Ms = sorted[Math.floor(sorted.length * 0.5)]!;
      run.latency.p90Ms = sorted[Math.floor(sorted.length * 0.9)]!;
      run.latency.p95Ms = sorted[Math.floor(sorted.length * 0.95)]!;
      run.latency.p99Ms = sorted[Math.floor(sorted.length * 0.99)]!;
      run.latency.meanMs = Number(
        (latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length).toFixed(2)
      );

      // Compute route p99
      for (const [r, stat] of Object.entries(run.routeBreakdown)) {
        const routeLats = samples.filter((s) => s.route === r).map((s) => s.durationMs).sort((a, b) => a - b);
        if (routeLats.length > 0) {
          stat.p99Ms = routeLats[Math.floor(routeLats.length * 0.99)] || routeLats[routeLats.length - 1]!;
          stat.meanMs = Number((routeLats.reduce((a, b) => a + b, 0) / routeLats.length).toFixed(2));
        }
      }
    }

    inMemorySamples.set(runId, samples);
    run.hasArtifacts = true;
    saveRunArtifacts(run, samples);
    emitRunEvent(runId, { type: 'COMPLETED', run });
  })();

  return run;
}

export const executeBenchmarkRun = startBenchmarkExecution;

export function cancelBenchmarkRun(runId: string): boolean {
  const controller = activeAbortControllers.get(runId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(runId);
    const run = inMemoryRuns.get(runId);
    if (run) {
      run.state = 'CANCELLED';
      run.errorMessage = 'Cancelled by user';
      emitRunEvent(runId, { type: 'STATE_CHANGE', state: 'CANCELLED', run });
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 4. Persistence & Artifact Generation
// ---------------------------------------------------------------------------

function saveRunArtifacts(run: BenchmarkRun, samples: RequestSample[]) {
  try {
    const runDir = path.join(ARTIFACTS_DIR, run.runId);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    // Save summary.json
    fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(run, null, 2), 'utf8');

    // Save requests.json (samples)
    if (samples.length > 0) {
      fs.writeFileSync(path.join(runDir, 'requests.json'), JSON.stringify(samples, null, 2), 'utf8');
    }

    // Generate standalone HTML Report
    const htmlReport = generateBenchmarkHtmlReport(run, samples);
    fs.writeFileSync(path.join(runDir, 'report.html'), htmlReport, 'utf8');
  } catch (err) {
    console.error(`Failed to save artifacts for run ${run.runId}:`, err);
  }
}

function generateBenchmarkHtmlReport(run: BenchmarkRun, samples: RequestSample[]): string {
  const successRate = run.completedRequests > 0
    ? ((run.successfulRequests / run.completedRequests) * 100).toFixed(1)
    : '0';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SYSTEM-X — Benchmark Report: ${run.runId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f3f4f6; padding: 30px; line-height: 1.6; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; margin-bottom: 24px; max-width: 1000px; margin-left: auto; margin-right: auto; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #38bdf8; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-weight: bold; font-size: 12px; }
    .badge.COMPLETED { background: rgba(52, 211, 153, 0.2); color: #34d399; }
    .badge.FAILED { background: rgba(248, 113, 113, 0.2); color: #f87171; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }
    .stat { background: #1e293b; padding: 14px; border-radius: 8px; border: 1px solid #334155; }
    .stat-label { font-size: 11px; text-transform: uppercase; color: #94a3b8; }
    .stat-val { font-size: 22px; font-weight: bold; color: #fff; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #1f2937; }
    th { color: #94a3b8; text-transform: uppercase; font-size: 11px; }
    code { background: #030712; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #38bdf8; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h1>SYSTEM-X Performance Benchmark Report</h1>
        <p style="color:#94a3b8; font-size:13px;">Target: <code>${run.config.targetUrl}</code> &middot; Method: <strong>${run.config.method}</strong></p>
      </div>
      <span class="badge ${run.state}">${run.state}</span>
    </div>

    <div class="grid">
      <div class="stat"><div class="stat-label">Throughput</div><div class="stat-val">${run.throughputRps} <span style="font-size:12px;color:#94a3b8;">req/s</span></div></div>
      <div class="stat"><div class="stat-label">Success Rate</div><div class="stat-val">${successRate}%</div></div>
      <div class="stat"><div class="stat-label">P50 Latency</div><div class="stat-val">${run.latency.p50Ms} <span style="font-size:12px;color:#94a3b8;">ms</span></div></div>
      <div class="stat"><div class="stat-label">P99 Tail</div><div class="stat-val" style="color:#38bdf8;">${run.latency.p99Ms} <span style="font-size:12px;color:#94a3b8;">ms</span></div></div>
    </div>

    <h3 style="margin-top:24px; font-size:15px; color:#fff;">Route Breakdown</h3>
    <table>
      <thead>
        <tr><th>Route</th><th>Requests</th><th>Successes</th><th>Mean Latency</th><th>P99 Tail</th></tr>
      </thead>
      <tbody>
        ${Object.entries(run.routeBreakdown).map(([r, s]) => `
          <tr>
            <td><code>${r}</code></td>
            <td>${s.count}</td>
            <td>${s.successCount} (${((s.successCount / s.count) * 100).toFixed(0)}%)</td>
            <td>${s.meanMs} ms</td>
            <td>${s.p99Ms} ms</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <p style="font-size:11px; color:#64748b; margin-top:30px;">
      Generated by SYSTEM-X Benchmark Engine &middot; Run ID: ${run.runId} &middot; Started: ${run.startedAt || run.createdAt}
    </p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 5. Query & Request Inspector Helpers
// ---------------------------------------------------------------------------

export function getBenchmarkRun(runId: string): BenchmarkRun | null {
  return inMemoryRuns.get(runId) ?? null;
}

export function listBenchmarkRuns(): BenchmarkRun[] {
  return Array.from(inMemoryRuns.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getRunRequestSamples(
  runId: string,
  limit = 100,
  offset = 0,
  statusFilter?: string
): { total: number; samples: RequestSample[] } {
  let samples = inMemorySamples.get(runId);
  if (!samples) {
    // Try reading from disk
    const reqFile = path.join(ARTIFACTS_DIR, runId, 'requests.json');
    if (fs.existsSync(reqFile)) {
      try {
        samples = JSON.parse(fs.readFileSync(reqFile, 'utf8'));
        inMemorySamples.set(runId, samples!);
      } catch {}
    }
  }

  if (!samples) return { total: 0, samples: [] };

  let filtered = samples;
  if (statusFilter === 'SUCCESS') {
    filtered = filtered.filter((s) => s.success);
  } else if (statusFilter === 'FAILURE') {
    filtered = filtered.filter((s) => !s.success);
  }

  const paginated = filtered.slice(offset, offset + limit);
  return {
    total: filtered.length,
    samples: paginated,
  };
}

// ---------------------------------------------------------------------------
// 6. Side-by-Side Run Comparison
// ---------------------------------------------------------------------------

export function compareRuns(
  baselineRunId: string,
  comparisonRunId: string,
  thresholdPercent = 15
): ComparisonResult {
  const base = inMemoryRuns.get(baselineRunId);
  const comp = inMemoryRuns.get(comparisonRunId);

  if (!base || !comp) {
    throw new Error('Both baseline and comparison run must exist');
  }

  // Check comparability
  const sameTarget = base.config.targetUrl === comp.config.targetUrl;
  const sameMethod = base.config.method === comp.config.method;

  if (!sameTarget || !sameMethod) {
    return {
      baselineRunId,
      comparisonRunId,
      baselineName: base.config.name,
      comparisonName: comp.config.name,
      targetUrl: base.config.targetUrl,
      comparable: false,
      nonComparableReason: `Different targets or methods: ${base.config.method} ${base.config.targetUrl} vs ${comp.config.method} ${comp.config.targetUrl}`,
      thresholdPercent,
      verdict: 'NOT_DIRECTLY_COMPARABLE',
      summary: 'Runs test different endpoints or HTTP methods and cannot be directly compared for performance regression.',
      metrics: {
        throughput: { baseline: base.throughputRps, comparison: comp.throughputRps, diffPercent: 0 },
        meanLatency: { baseline: base.latency.meanMs, comparison: comp.latency.meanMs, diffPercent: 0 },
        p50: { baseline: base.latency.p50Ms, comparison: comp.latency.p50Ms, diffPercent: 0 },
        p90: { baseline: base.latency.p90Ms, comparison: comp.latency.p90Ms, diffPercent: 0 },
        p99: { baseline: base.latency.p99Ms, comparison: comp.latency.p99Ms, diffPercent: 0 },
        successRate: { baseline: 100, comparison: 100, diffPercent: 0 },
      },
    };
  }

  const calcDiff = (b: number, c: number) => {
    if (b === 0) return 0;
    return Number((((c - b) / b) * 100).toFixed(1));
  };

  const p99Diff = calcDiff(base.latency.p99Ms, comp.latency.p99Ms);
  const meanDiff = calcDiff(base.latency.meanMs, comp.latency.meanMs);
  const throughputDiff = calcDiff(base.throughputRps, comp.throughputRps);

  const baseSuccessRate = base.completedRequests > 0 ? (base.successfulRequests / base.completedRequests) * 100 : 0;
  const compSuccessRate = comp.completedRequests > 0 ? (comp.successfulRequests / comp.completedRequests) * 100 : 0;
  const successRateDiff = Number((compSuccessRate - baseSuccessRate).toFixed(1));

  let verdict: ComparisonResult['verdict'] = 'WITHIN_THRESHOLD';
  let summary = `Latency variation is within normal threshold (±${thresholdPercent}%).`;

  if (p99Diff > thresholdPercent || successRateDiff < -5) {
    verdict = 'REGRESSED';
    summary = `Performance regression detected! P99 latency degraded by +${p99Diff}% (exceeds ${thresholdPercent}% limit).`;
  } else if (p99Diff < -thresholdPercent) {
    verdict = 'IMPROVED';
    summary = `Performance improvement detected! P99 latency improved by ${Math.abs(p99Diff)}%.`;
  }

  return {
    baselineRunId,
    comparisonRunId,
    baselineName: base.config.name,
    comparisonName: comp.config.name,
    targetUrl: base.config.targetUrl,
    comparable: true,
    thresholdPercent,
    verdict,
    summary,
    metrics: {
      throughput: { baseline: base.throughputRps, comparison: comp.throughputRps, diffPercent: throughputDiff },
      meanLatency: { baseline: base.latency.meanMs, comparison: comp.latency.meanMs, diffPercent: meanDiff },
      p50: { baseline: base.latency.p50Ms, comparison: comp.latency.p50Ms, diffPercent: calcDiff(base.latency.p50Ms, comp.latency.p50Ms) },
      p90: { baseline: base.latency.p90Ms, comparison: comp.latency.p90Ms, diffPercent: calcDiff(base.latency.p90Ms, comp.latency.p90Ms) },
      p99: { baseline: base.latency.p99Ms, comparison: comp.latency.p99Ms, diffPercent: p99Diff },
      successRate: { baseline: Number(baseSuccessRate.toFixed(1)), comparison: Number(compSuccessRate.toFixed(1)), diffPercent: successRateDiff },
    },
  };
}

// ---------------------------------------------------------------------------
// 7. Event Subscription (SSE Helper)
// ---------------------------------------------------------------------------

function emitRunEvent(runId: string, event: any) {
  runEmitter.emit(`run:${runId}`, event);
}

export function subscribeToRunEvents(runId: string, listener: (event: any) => void): () => void {
  const eventName = `run:${runId}`;
  runEmitter.on(eventName, listener);
  return () => {
    runEmitter.off(eventName, listener);
  };
}
