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
import { authorizeTarget, requestTarget, resolveBenchmarkRoute } from './benchmarkTarget.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
const ARTIFACTS_DIR = path.resolve(process.env.SYSTEM_X_ARTIFACTS_DIR ?? 'artifacts');
const approvedTargets = new Map();
const requestPayloads = new Map();
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const runEmitter = new EventEmitter();
const activeAbortControllers = new Map();
const inMemoryRuns = new Map();
const inMemorySamples = new Map();
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
        if (!fs.existsSync(ARTIFACTS_DIR))
            return;
        const entries = fs.readdirSync(ARTIFACTS_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.startsWith('bench-')) {
                const sumFile = path.join(ARTIFACTS_DIR, entry.name, 'summary.json');
                if (fs.existsSync(sumFile)) {
                    const data = JSON.parse(fs.readFileSync(sumFile, 'utf8'));
                    if (data && data.runId === entry.name) {
                        if (['RUNNING', 'QUEUED'].includes(data.state)) {
                            data.state = 'FAILED';
                            data.errorMessage = 'The server restarted before the run finished.';
                        }
                        inMemoryRuns.set(data.runId, data);
                    }
                }
            }
        }
    }
    catch { }
})();
// ---------------------------------------------------------------------------
// 1. SSRF & Target Validation
// ---------------------------------------------------------------------------
export async function validateTargetUrl(inputUrl, allowLocalhost = false, authorizedConfirmed = false) {
    const t0 = performance.now();
    try {
        const target = await authorizeTarget(inputUrl, allowLocalhost, authorizedConfirmed);
        const response = await requestTarget(target, target.url, { signal: AbortSignal.timeout(4000), maxBytes: 512 * 1024 });
        const durationMs = Math.round(performance.now() - t0);
        const redirect = response.status >= 300 && response.status < 400;
        return {
            valid: !redirect, reachable: true, normalizedUrl: target.url.href, statusCode: response.status,
            responseTimeMs: durationMs, resolvedIp: target.address, isPrivateRange: target.local,
            message: redirect ? 'This URL redirects. Enter the final destination directly.' : 'Target responded with HTTP ' + response.status + '.',
            suggestedRoutes: [target.url.pathname + target.url.search],
        };
    } catch (error) {
        return { valid: false, reachable: false, message: error.message };
    }
}

export async function discoverRoutes(targetUrl, allowLocalhost, authorizedConfirmed) {
    const target = await authorizeTarget(targetUrl, allowLocalhost, authorizedConfirmed);
    const discovered = new Set([target.url.pathname + target.url.search]);
    let sitemapFound = false;
    try {
        const response = await requestTarget(target, new URL('/sitemap.xml', target.url), {
            signal: AbortSignal.timeout(3000), maxBytes: 256 * 1024, collect: true,
        });
        if (response.status === 200) {
            sitemapFound = true;
            for (const match of response.text.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)) {
                if (discovered.size >= 12) break;
                try {
                    const url = new URL(match[1].trim().replaceAll('&amp;', '&'));
                    if (url.origin === target.url.origin) discovered.add(url.pathname + url.search);
                } catch { /* Invalid sitemap entries are ignored. */ }
            }
        }
    } catch { /* The validated starting route remains available. */ }
    return { targetUrl: target.url.href, discovered: [...discovered], sitemapFound };
}


export function createBenchmarkRun(configInput, approvedTarget) {
    if (activeAbortControllers.size + approvedTargets.size >= 2) throw new Error('Two benchmarks are already queued or running.');
    const method = configInput.method ?? "GET";
    if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new Error("Unsupported HTTP method.");
    const routes = configInput.routes?.length ? configInput.routes : [approvedTarget.url.pathname + approvedTarget.url.search];
    if (routes.length > 12) throw new Error("Use at most 12 routes.");
    const normalizedRoutes = [...new Set(routes.map(route => {
        const url = resolveBenchmarkRoute(route, approvedTarget);
        return url.pathname + url.search;
    }))];
    for (const key of ["requestCount", "concurrency", "timeoutMs"]) {
        if (configInput[key] !== undefined && !Number.isSafeInteger(configInput[key])) throw new Error(key + " must be a whole number.");
    }
    const body = configInput.body;
    if (body !== undefined && (typeof body !== "string" || Buffer.byteLength(body) > 65536)) throw new Error("Body must be text of at most 64 KiB.");
    if (body && ["GET", "HEAD"].includes(method)) throw new Error("GET and HEAD requests cannot include a body.");
    if (body) JSON.parse(body);
    const runId = `bench-run-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const requestCount = Math.max(1, Math.min(configInput.requestCount ?? 100, MAX_REQUEST_COUNT));
    const concurrency = Math.max(1, Math.min(configInput.concurrency ?? 5, MAX_CONCURRENCY));
    const timeoutMs = Math.max(500, Math.min(configInput.timeoutMs ?? 5000, MAX_TIMEOUT_MS));
    const config = {
        name: typeof configInput.name === "string" && configInput.name.trim() ? configInput.name.trim().slice(0, 120) : "HTTP benchmark",
        targetUrl: approvedTarget.url.href,
        routes: normalizedRoutes,
        method,
        requestCount,
        concurrency,
        timeoutMs,
        allowLocalhost: Boolean(configInput.allowLocalhost),
        authorizedConfirmed: Boolean(configInput.authorizedConfirmed),
    };
    const run = {
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
    approvedTargets.set(runId, approvedTarget);
    requestPayloads.set(runId, body);
    inMemorySamples.set(runId, []);
    run.hasArtifacts = saveRunArtifacts(run, []);
    return run;
}
export async function startBenchmarkExecution(runId) {
    const run = inMemoryRuns.get(runId);
    if (!run)
        throw new Error(`Run ${runId} not found`);
    if (run.state === 'RUNNING')
        return run;
    run.state = 'PREPARING';
    run.startedAt = new Date().toISOString();
    emitRunEvent(runId, { type: 'STATE_CHANGE', state: 'PREPARING', run });
    const target = approvedTargets.get(runId);
    const body = requestPayloads.get(runId);
    if (!target) throw new Error("Run has no approved target.");
    approvedTargets.delete(runId);
    requestPayloads.delete(runId);
    const abortController = new AbortController();
    activeAbortControllers.set(runId, abortController);
    // Background execution loop
    (async () => {
        run.state = 'RUNNING';
        emitRunEvent(runId, { type: 'STATE_CHANGE', state: 'RUNNING', run });
        const samples = [];
        const latenciesMs = [];
        const routes = run.config.routes && run.config.routes.length > 0 ? run.config.routes : ['/'];
        const startHr = process.hrtime.bigint();
        let requestSeq = 0;
        const totalRequests = run.config.requestCount;
        const concurrency = Math.min(run.config.concurrency, totalRequests);
        // Periodic progress emission timer
        const progressTimer = setInterval(() => {
            const elapsed = Number((process.hrtime.bigint() - startHr) / 1000000n);
            run.elapsedMs = elapsed;
            const sec = Math.max(0.1, elapsed / 1000);
            run.throughputRps = Number((run.completedRequests / sec).toFixed(1));
            if (latenciesMs.length) {
                const sorted = [...latenciesMs].sort((a, b) => a - b);
                run.latency.p50Ms = sorted[Math.ceil(sorted.length * 0.5) - 1];
                run.latency.p99Ms = sorted[Math.ceil(sorted.length * 0.99) - 1];
            }
            emitRunEvent(runId, { type: 'PROGRESS', run });
        }, 250);
        const workerLoop = async () => {
            while (requestSeq < totalRequests && !abortController.signal.aborted) {
                const curIdx = requestSeq++;
                if (curIdx >= totalRequests)
                    break;
                const route = routes[curIdx % routes.length];
                const targetUrl = resolveBenchmarkRoute(route, target);
                const targetFullUrl = targetUrl.href;
                run.sentRequests++;
                const reqStart = process.hrtime.bigint();
                const reqId = `req-${runId}-${curIdx.toString().padStart(4, '0')}`;
                let statusCode = 0;
                let success = false;
                let errorCategory = 'NONE';
                let errorMessage;
                try {
                    const reqSignal = AbortSignal.any([
                        abortController.signal,
                        AbortSignal.timeout(run.config.timeoutMs),
                    ]);
                    const headers = { "User-Agent": "SystemX-Benchmark/2.0", Accept: "*/*",
                        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}) };
                    const res = await requestTarget(target, targetUrl, { method: run.config.method, headers, body, signal: reqSignal });
                    statusCode = res.status;
                    if (res.status >= 200 && res.status < 300) {
                        success = true;
                    }
                    else {
                        errorCategory = 'HTTP_ERROR';
                        errorMessage = `HTTP ${res.status} ${res.statusText}`;
                    }
                }
                catch (err) {
                    if (abortController.signal.aborted) {
                        errorCategory = 'ABORTED';
                        errorMessage = 'Benchmark aborted by user';
                    }
                    else if (err.name === 'TimeoutError' || err.cause?.name === 'TimeoutError' || err.message?.includes('timeout')) {
                        errorCategory = 'TIMEOUT';
                        errorMessage = `Request timed out after ${run.config.timeoutMs}ms`;
                    }
                    else {
                        errorCategory = 'NETWORK_ERROR';
                        errorMessage = err.message || 'Network connection failed';
                    }
                }
                const reqEnd = process.hrtime.bigint();
                const durationMs = Number((Number(reqEnd - reqStart) / 1e6).toFixed(2));
                run.completedRequests++;
                if (success) {
                    run.successfulRequests++;
                }
                else {
                    run.failedRequests++;
                }
                run.statusDistribution[statusCode] = (run.statusDistribution[statusCode] || 0) + 1;
                latenciesMs.push(durationMs);
                // Update route breakdown
                if (!run.routeBreakdown[route]) {
                    run.routeBreakdown[route] = { count: 0, successCount: 0, meanMs: 0, p99Ms: 0 };
                }
                const rb = run.routeBreakdown[route];
                rb.count++;
                if (success)
                    rb.successCount++;
                const sample = {
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
        }
        finally {
            clearInterval(progressTimer);
        }
        const endHr = process.hrtime.bigint();
        run.elapsedMs = Number((endHr - startHr) / 1000000n);
        const durationSec = Math.max(0.001, run.elapsedMs / 1000);
        run.throughputRps = Number((run.completedRequests / durationSec).toFixed(1));
        run.completedAt = new Date().toISOString();
        if (abortController.signal.aborted) {
            run.state = 'CANCELLED';
            run.errorMessage = 'Benchmark cancelled by user';
        }
        else if (run.failedRequests === run.completedRequests && run.completedRequests > 0) {
            run.state = 'FAILED';
            run.errorMessage = '100% of benchmark requests failed';
        }
        else {
            run.state = 'COMPLETED';
        }
        // Compute quantile statistics
        if (latenciesMs.length > 0) {
            const sorted = [...latenciesMs].sort((a, b) => a - b);
            run.latency.minMs = sorted[0];
            run.latency.maxMs = sorted[sorted.length - 1];
            run.latency.p50Ms = sorted[Math.floor(sorted.length * 0.5)];
            run.latency.p90Ms = sorted[Math.floor(sorted.length * 0.9)];
            run.latency.p95Ms = sorted[Math.floor(sorted.length * 0.95)];
            run.latency.p99Ms = sorted[Math.floor(sorted.length * 0.99)];
            run.latency.meanMs = Number((latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length).toFixed(2));
            // Compute route p99
            for (const [r, stat] of Object.entries(run.routeBreakdown)) {
                const routeLats = samples.filter((s) => s.route === r).map((s) => s.durationMs).sort((a, b) => a - b);
                if (routeLats.length > 0) {
                    stat.p99Ms = routeLats[Math.floor(routeLats.length * 0.99)] || routeLats[routeLats.length - 1];
                    stat.meanMs = Number((routeLats.reduce((a, b) => a + b, 0) / routeLats.length).toFixed(2));
                }
            }
        }
        inMemorySamples.set(runId, samples);
        run.hasArtifacts = saveRunArtifacts(run, samples);
        emitRunEvent(runId, { type: 'COMPLETED', run });
    })().catch(error => {
        run.state = 'FAILED';
        run.errorMessage = 'Benchmark execution failed';
        console.error('Benchmark execution failed:', error);
        emitRunEvent(runId, { type: 'COMPLETED', run });
    }).finally(() => activeAbortControllers.delete(runId));
    return run;
}
export const executeBenchmarkRun = startBenchmarkExecution;
export function cancelBenchmarkRun(runId) {
    const controller = activeAbortControllers.get(runId);
    if (controller) {
        controller.abort();
        return true;
    }
    return false;
}
// ---------------------------------------------------------------------------
// 4. Persistence & Artifact Generation
// ---------------------------------------------------------------------------
function saveRunArtifacts(run, samples) {
    try {
        const runDir = path.join(ARTIFACTS_DIR, run.runId);
        if (!fs.existsSync(runDir)) {
            fs.mkdirSync(runDir, { recursive: true });
        }
        // Save requests.json (samples)
        if (samples.length > 0) {
            fs.writeFileSync(path.join(runDir, 'requests.json'), JSON.stringify(samples, null, 2), 'utf8');
        }
        // Generate standalone HTML Report
        const htmlReport = generateBenchmarkHtmlReport(run, samples);
        fs.writeFileSync(path.join(runDir, 'report.html'), htmlReport, 'utf8');
        const summary = path.join(runDir, 'summary.json');
        fs.writeFileSync(summary + '.tmp', JSON.stringify({ ...run, hasArtifacts: true }, null, 2), 'utf8');
        fs.renameSync(summary + '.tmp', summary);
        return true;
    }
    catch (err) {
        console.error(`Failed to save artifacts for run ${run.runId}:`, err);
        return false;
    }
}
function generateBenchmarkHtmlReport(run, samples) {
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
        <p style="color:#94a3b8; font-size:13px;">Target: <code>${escapeHtml(run.config.targetUrl)}</code> &middot; Method: <strong>${run.config.method}</strong></p>
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
            <td><code>${escapeHtml(r)}</code></td>
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
export function getBenchmarkRun(runId) {
    return inMemoryRuns.get(runId) ?? null;
}
export function listBenchmarkRuns() {
    return Array.from(inMemoryRuns.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export function getRunRequestSamples(runId, limit = 100, offset = 0, statusFilter) {
    let samples = inMemorySamples.get(runId);
    if (!samples) {
        // Try reading from disk
        const reqFile = path.join(ARTIFACTS_DIR, runId, 'requests.json');
        if (fs.existsSync(reqFile)) {
            try {
                samples = JSON.parse(fs.readFileSync(reqFile, 'utf8'));
                inMemorySamples.set(runId, samples);
            }
            catch { }
        }
    }
    if (!samples)
        return { total: 0, samples: [] };
    let filtered = samples;
    if (statusFilter === 'SUCCESS') {
        filtered = filtered.filter((s) => s.success);
    }
    else if (statusFilter === 'FAILURE') {
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
export function compareRuns(baselineRunId, comparisonRunId, thresholdPercent = 15) {
    const base = inMemoryRuns.get(baselineRunId);
    const comp = inMemoryRuns.get(comparisonRunId);
    if (!base || !comp) {
        throw new Error('Both baseline and comparison run must exist');
    }
    if (baselineRunId === comparisonRunId || base.state !== 'COMPLETED' || comp.state !== 'COMPLETED') {
        throw new Error('Select two different completed benchmarks.');
    }
    if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0 || thresholdPercent > 100) {
        throw new Error('The comparison threshold must be between 0 and 100 percent.');
    }
    // Check comparability
    const sameTarget = base.config.targetUrl === comp.config.targetUrl;
    const sameMethod = base.config.method === comp.config.method;
    const sameRoutes = JSON.stringify(base.config.routes) === JSON.stringify(comp.config.routes);
    const sameLoad = base.config.concurrency === comp.config.concurrency && base.config.requestCount === comp.config.requestCount && base.config.timeoutMs === comp.config.timeoutMs;
    if (!sameTarget || !sameMethod || !sameRoutes || !sameLoad) {
        return {
            baselineRunId,
            comparisonRunId,
            baselineName: base.config.name,
            comparisonName: comp.config.name,
            targetUrl: base.config.targetUrl,
            comparable: false,
            nonComparableReason: 'Target, method, routes, and load settings must match.',
            thresholdPercent,
            verdict: 'NOT_DIRECTLY_COMPARABLE',
            summary: 'Select runs with matching targets, HTTP methods, routes, and load settings.',
            metrics: {},
        };
    }
    const calcDiff = (b, c) => {
        if (b === 0)
            return 0;
        return Number((((c - b) / b) * 100).toFixed(1));
    };
    const p99Diff = calcDiff(base.latency.p99Ms, comp.latency.p99Ms);
    const meanDiff = calcDiff(base.latency.meanMs, comp.latency.meanMs);
    const throughputDiff = calcDiff(base.throughputRps, comp.throughputRps);
    const baseSuccessRate = base.completedRequests > 0 ? (base.successfulRequests / base.completedRequests) * 100 : 0;
    const compSuccessRate = comp.completedRequests > 0 ? (comp.successfulRequests / comp.completedRequests) * 100 : 0;
    const successRateDiff = Number((compSuccessRate - baseSuccessRate).toFixed(1));
    let verdict = 'WITHIN_THRESHOLD';
    let summary = `Latency variation is within normal threshold (±${thresholdPercent}%).`;
    if (p99Diff > thresholdPercent || successRateDiff < -5) {
        verdict = 'REGRESSED';
        summary = successRateDiff < -5
            ? `Success rate fell by ${Math.abs(successRateDiff)} percentage points.`
            : `P99 latency increased by ${p99Diff}%, above the ${thresholdPercent}% threshold.`;
    }
    else if (p99Diff < -thresholdPercent) {
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
function emitRunEvent(runId, event) {
    runEmitter.emit(`run:${runId}`, event);
}
export function subscribeToRunEvents(runId, listener) {
    const eventName = `run:${runId}`;
    runEmitter.on(eventName, listener);
    return () => {
        runEmitter.off(eventName, listener);
    };
}
