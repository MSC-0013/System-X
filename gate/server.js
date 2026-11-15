/**
 * SYSTEM-X UNIFIED CONTROL SERVER & TESTING CONTROL CENTER BACKEND
 *
 * Exposes:
 *  - Native HTTP REST Control API
 *  - Real-time ecosystem health monitoring (Blackbox-X, Quorum Lab, MinIO, CRT)
 *  - On-demand closed-loop master experiment execution (/api/experiment/run)
 *  - Real Website HTTP Benchmark Engine (/api/benchmarks/*):
 *      * SSRF validation & preflight probe
 *      * Route discovery
 *      * Real-load HTTP dispatcher with process.hrtime.bigint precision
 *      * Real-time Server-Sent Events (SSE) streaming (/api/benchmarks/runs/:id/stream)
 *      * Request inspector drilldown (/api/benchmarks/runs/:id/requests)
 *      * Side-by-side run comparison engine (/api/benchmarks/compare)
 *  - Commerce Reliability Testbed (CRT) Scenario runner proxy (/api/crt/*)
 *  - Artifact & report server (/artifacts/*)
 *  - Monochrome Testing Control Center Interactive UI (GET /)
 */
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { authorizeTarget } from './benchmarkTarget.js';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { renderWebDashboard } from './dashboardTemplate.js';
import { validateTargetUrl, discoverRoutes, createBenchmarkRun, executeBenchmarkRun, cancelBenchmarkRun, getBenchmarkRun, listBenchmarkRuns, getRunRequestSamples, compareRuns, subscribeToRunEvents, } from './benchmarkRunner.js';
const execAsync = promisify(execFile);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env['PORT'] ?? process.env['CONTROL_API_PORT'] ?? '8080', 10);
const HOST = process.env['HOST'] ?? '127.0.0.1';
const ARTIFACTS_DIR = path.resolve(process.env.SYSTEM_X_ARTIFACTS_DIR ?? path.join(ROOT_DIR, 'artifacts'));
const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);
const remoteBind = !localHostnames.has(HOST === '::1' ? '[::1]' : HOST);
const accessToken = process.env.SYSTEM_X_ACCESS_TOKEN ?? '';
if (remoteBind && accessToken.length < 24) throw new Error('Set SYSTEM_X_ACCESS_TOKEN to at least 24 characters before binding beyond loopback.');
const expectedAuth = Buffer.from('Basic ' + Buffer.from('system-x:' + accessToken).toString('base64'));
function hasAccess(header) {
    if (!accessToken) return true;
    const supplied = Buffer.from(header ?? '');
    return supplied.length === expectedAuth.length && timingSafeEqual(supplied, expectedAuth);
}
// Ensure artifacts dir exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}
let isExperimentRunning = false;
let lastExperimentLog = '';
let lastExperimentError = false;
let crtScenarioSuiteInstance = null;
let crtCommerceRouter = null;
async function bootstrapCrtEmbedded() {
    try {
        const { bootstrap: bootstrapCrt } = await import('../crt/server.js');
        const crtApp = await bootstrapCrt();
        crtScenarioSuiteInstance = crtApp.scenarioSuite;
        crtCommerceRouter = crtApp.commerceRouter;
        console.log('[SYSTEM-X] Embedded Commerce Reliability Testbed (CRT) initialized on port 4200.');
    }
    catch (err) {
        console.warn('[SYSTEM-X] CRT embedded daemon auto-start notice:', err.message);
    }
}
// Start CRT daemon in background on server boot
if (process.env['SYSTEM_X_EMBED_CRT'] === 'true')
    void bootstrapCrtEmbedded();
async function checkHealth(url, timeoutMs = 2500) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        await res.body?.cancel();
        return res.ok ? 'ONLINE' : 'OFFLINE';
    }
    catch {
        return 'OFFLINE';
    }
}
function getHistoricRuns() {
    if (!fs.existsSync(ARTIFACTS_DIR))
        return [];
    const entries = fs.readdirSync(ARTIFACTS_DIR, { withFileTypes: true });
    return entries
        .filter((d) => d.isDirectory() && (d.name.startsWith('run-') || d.name.startsWith('bench-run-')))
        .map((d) => {
        const runDir = path.join(ARTIFACTS_DIR, d.name);
        let summary = null;
        let hasReport = fs.existsSync(path.join(runDir, 'report.html'));
        try {
            const sumPath = path.join(runDir, 'summary.json');
            if (fs.existsSync(sumPath)) {
                summary = JSON.parse(fs.readFileSync(sumPath, 'utf8'));
            }
        }
        catch { }
        const stats = fs.statSync(runDir);
        return {
            runId: d.name,
            type: d.name.startsWith('bench-') ? 'WEBSITE_BENCHMARK' : 'CLOSED_LOOP_VERIFICATION',
            createdAt: stats.birthtime || stats.mtime,
            hasReport,
            state: d.name.startsWith('bench-') ? undefined : summary?.evidenceVersion === 2 ? 'MEASURED' : 'LEGACY UNVERIFIED',
            summary,
        };
    })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
async function readJsonBody(req) {
    let body = '';
    for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 1024 * 1024)
            throw new Error('JSON payload exceeds 1 MiB');
    }
    if (!body.trim())
        return {};
    try {
        return JSON.parse(body);
    }
    catch (err) {
        throw new Error('Invalid JSON payload: ' + err.message);
    }
}
const CRT_SCENARIOS = [
    ['01', 'Checkout lifecycle', 'Checkout', 'Place an order and verify its confirmed state.', 'Confirmed order'],
    ['02', 'Idempotent checkout', 'Checkout', 'Replay a purchase and check that the order ID matches.', 'One order'],
    ['03', 'One item, 20 buyers', 'Inventory', 'Run 20 concurrent checkouts against one item.', 'One confirmation and zero overselling'],
    ['04', 'Crash and restart', 'Fault tolerance', 'Node restart evidence is still required.', 'Unverified'],
    ['05', 'Partition availability', 'Fault tolerance', 'Commerce traffic under partition still needs verification.', 'Unverified'],
    ['06', 'Concurrent updates', 'Consistency', 'Confirm a versioned value is readable after concurrent writes.', 'Readable version'],
    ['07', 'Network healing', 'Consistency', 'Replica convergence after network healing still needs verification.', 'Unverified'],
    ['08', 'Delete followed by repair', 'Consistency', 'Tombstone behavior across repair still needs verification.', 'Unverified'],
    ['09', 'Sustained throughput', 'Performance', 'A sustained workload with measured outcomes is required.', 'Unverified'],
    ['10', 'Leader fencing', 'Fault tolerance', 'Leader failover and stale writes still need verification.', 'Unverified'],
    ['11', 'Simulation fidelity', 'Performance', 'The commerce workload has yet to be compared with an independent model.', 'Unverified'],
    ['12', 'Held-out calibration', 'Performance', 'A fitted model needs evaluation on held-out commerce samples.', 'Unverified'],
    ['13', 'Duplicate event delivery', 'Events', 'Publish a duplicate event and count handler invocations.', 'One invocation'],
    ['14', 'Tenant isolation', 'Isolation', 'Same-key tenant isolation still needs verification.', 'Unverified'],
    ['15', 'Artifact retention', 'Evidence', 'Versioned storage and object retention still need verification.', 'Unverified'],
].map(([id, name, category, description, targetTolerance]) => ({ id: 'CRT-' + id, name, category, description, targetTolerance }));

let crtRunActive = false;
async function runCrtScenario(scenarioId) {
    const { QuorumAdapter } = await import("../crt/adapter/quorumAdapter.js");
    const { CrtScenarioSuite } = await import("../crt/scenarios/crtScenarios.js");
    const testRoot = fs.mkdtempSync(path.join(tmpdir(), "system-x-crt-"));
    const adapter = new QuorumAdapter({ dataRoot: testRoot });
    try {
        await adapter.initializeCluster();
        const suite = new CrtScenarioSuite(adapter);
        return await (scenarioId ? suite.runScenario(scenarioId) : suite.runAll());
    } finally {
        await adapter.shutdownCluster();
        if (path.dirname(path.resolve(testRoot)) === path.resolve(tmpdir()) && path.basename(testRoot).startsWith("system-x-crt-")) {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
    }
}
async function handleRequest(req, res) {
    let url;
    try {
        url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
        res.writeHead(400);
        res.end('Invalid request URL');
        return;
    }
    const pathname = url.pathname;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (pathname !== '/health') {
        if (!remoteBind && !localHostnames.has(url.hostname)) {
            res.writeHead(403); res.end('Use a loopback host name.'); return;
        }
        const commerceBearerRequest = crtCommerceRouter && /^\/api\/(?:inventory|cart|checkout|orders)(?:\/|$)/.test(pathname) &&
            /^Bearer /i.test(req.headers.authorization ?? '');
        if (!commerceBearerRequest && !hasAccess(req.headers.authorization)) {
            res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="System-X", charset="UTF-8"' });
            res.end('Authentication required'); return;
        }
        const origin = req.headers.origin;
        if (req.method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site' ||
            (origin && origin !== 'http://' + req.headers.host && origin !== 'https://' + req.headers.host))) {
            res.writeHead(403); res.end('Cross-origin requests are blocked.'); return;
        }
        res.setHeader('Cache-Control', 'no-store');
    }
    // -------------------------------------------------------------------------
    // 1. Health & Ecosystem Status
    // -------------------------------------------------------------------------
    if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UP', service: 'system-x-control-server', timestamp: new Date().toISOString() }));
        return;
    }
    if (pathname === '/api/status') {
        const blackboxTarget = new URL('/health/live', process.env['BLACKBOX_URL'] || 'http://127.0.0.1:4000').href;
        const quorumTarget = new URL('/health', process.env['QUORUM_URL'] || 'http://127.0.0.1:3000').href;
        const [blackboxStatus, quorumStatus, minioStatus, crtStatus] = await Promise.all([
            checkHealth(blackboxTarget).catch(() => 'OFFLINE'),
            checkHealth(quorumTarget).catch(() => 'OFFLINE'),
            checkHealth(new URL('/minio/health/live', process.env['MINIO_URL'] || 'http://127.0.0.1:9000').href, 800).catch(() => 'OFFLINE'),
            checkHealth('http://127.0.0.1:4200/api/products', 1200).catch(() => 'OFFLINE'),
        ]);
        const crtOnline = crtStatus === 'ONLINE' || crtScenarioSuiteInstance !== null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            systemX: 'ONLINE',
            blackboxApi: blackboxStatus,
            quorumApi: quorumStatus,
            minioStorage: minioStatus,
            crtTestbed: crtOnline ? 'ONLINE' : 'OFFLINE',
            isExperimentRunning,
            runsCount: getHistoricRuns().length,
            benchmarkRunsCount: listBenchmarkRuns().length,
        }));
        return;
    }
    // -------------------------------------------------------------------------
    // 2. Closed-Loop Master Experiment Endpoints
    // -------------------------------------------------------------------------
    if (pathname === '/api/runs') {
        const runs = getHistoricRuns();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runs));
        return;
    }
    if (pathname === '/api/experiment/run' && req.method === 'POST') {
        if (isExperimentRunning) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Experiment execution already in progress.' }));
            return;
        }
        isExperimentRunning = true;
        lastExperimentError = false;
        lastExperimentLog = 'Starting measured local baseline: real gRPC peers, independent simulation and network faults. Calibration and WORM certification are not performed by this runner.\n';
        // Execute in background
        (async () => {
            try {
                const { stdout, stderr } = await execAsync(process.execPath, ['gate/runRealDemo.js'], {
                    cwd: ROOT_DIR,
                    timeout: 120000,
                    maxBuffer: 10 * 1024 * 1024,
                });
                lastExperimentLog = stdout + (stderr ? '\n' + stderr : '');
            }
            catch (err) {
                lastExperimentError = true;
                lastExperimentLog = `Execution error: ${err.message}\n` + (err.stdout ?? '');
            }
            finally {
                isExperimentRunning = false;
            }
        })();
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Experiment started', status: 'RUNNING' }));
        return;
    }
    if (pathname === '/api/experiment/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            running: isExperimentRunning,
            error: lastExperimentError,
            output: lastExperimentLog,
            latestRun: getHistoricRuns().find(run => run.summary?.evidenceVersion === 2) ?? null,
        }));
        return;
    }
    // -------------------------------------------------------------------------
    // 3. Website Performance Benchmark Endpoints
    // -------------------------------------------------------------------------
    if (pathname === '/api/benchmarks/validate-target' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const urlInput = body.url || body.targetUrl || '';
            if (!urlInput) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ valid: false, message: 'URL parameter is required.' }));
                return;
            }
            const result = await validateTargetUrl(urlInput, body.allowLocalhost === true, body.authorizedConfirmed === true);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, message: err.message }));
            return;
        }
    }
    if (pathname === '/api/benchmarks/discover-routes' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const urlInput = body.url || body.targetUrl || '';
            if (!urlInput) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'URL parameter is required.' }));
                return;
            }
            const result = await discoverRoutes(urlInput, body.allowLocalhost === true, body.authorizedConfirmed === true);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }
        catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return;
        }
    }
    if (pathname === '/api/benchmarks/start' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const targetUrl = body.targetUrl || body.url || '';
            if (!targetUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'targetUrl is required' }));
                return;
            }
            const target = await authorizeTarget(targetUrl, body.allowLocalhost === true, body.authorizedConfirmed === true);
            const run = createBenchmarkRun({
                name: body.name,
                targetUrl,
                routes: Array.isArray(body.routes) ? body.routes : [],
                method: body.method || 'GET',
                requestCount: body.requestCount,
                concurrency: body.concurrency,
                timeoutMs: body.timeoutMs,
                body: body.body,
                allowLocalhost: body.allowLocalhost === true,
                authorizedConfirmed: body.authorizedConfirmed === true,
            }, target);
            // Start execution in background
            await executeBenchmarkRun(run.runId);
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'Benchmark execution started',
                runId: run.runId,
                status: run.state,
                run,
            }));
            return;
        }
        catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return;
        }
    }
    if (pathname === '/api/benchmarks/runs' && req.method === 'GET') {
        const runs = listBenchmarkRuns();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runs));
        return;
    }
    // Handle /api/benchmarks/runs/:id/...
    if (pathname.startsWith('/api/benchmarks/runs/')) {
        const parts = pathname.replace(/^\/api\/benchmarks\/runs\//, '').split('/');
        const runId = parts[0];
        const subAction = parts[1];
        if (!/^bench-run-[a-z0-9-]+$/.test(runId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Run ID missing' }));
            return;
        }
        // SSE Real-time Progress Stream: GET /api/benchmarks/runs/:id/stream
        if (subAction === 'stream' && req.method === 'GET') {
            const run = getBenchmarkRun(runId);
            if (!run) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Run ${runId} not found` }));
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
            });
            // Send initial run state
            res.write(`data: ${JSON.stringify({ type: 'INIT', run })}\n\n`);
            if (run.state === 'COMPLETED' || run.state === 'FAILED' || run.state === 'CANCELLED') {
                res.end();
                return;
            }
            const unsubscribe = subscribeToRunEvents(runId, (event) => {
                try {
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                    if (event.type === 'COMPLETED' || event.state === 'COMPLETED' || event.state === 'FAILED' || event.state === 'CANCELLED') {
                        res.end();
                    }
                }
                catch {
                    unsubscribe();
                }
            });
            res.on('close', () => {
                unsubscribe();
            });
            return;
        }
        // Cancel Run: POST /api/benchmarks/runs/:id/cancel
        if (subAction === 'cancel' && req.method === 'POST') {
            const cancelled = cancelBenchmarkRun(runId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cancelled, runId }));
            return;
        }
        // Request Inspector: GET /api/benchmarks/runs/:id/requests
        if (subAction === 'requests' && req.method === 'GET') {
            const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit'), 10) || 100));
            const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset'), 10) || 0);
            const statusFilter = url.searchParams.get('status') || undefined;
            const data = getRunRequestSamples(runId, limit, offset, statusFilter);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
            return;
        }
        // Single Run Details: GET /api/benchmarks/runs/:id
        if (!subAction && req.method === 'GET') {
            const run = getBenchmarkRun(runId);
            if (!run) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Run ${runId} not found` }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(run));
            return;
        }
    }
    // Side-by-Side Run Comparison: POST /api/benchmarks/compare
    if (pathname === '/api/benchmarks/compare' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const { baselineRunId, comparisonRunId, thresholdPercent } = body;
            if (!baselineRunId || !comparisonRunId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Both baselineRunId and comparisonRunId are required' }));
                return;
            }
            const comparison = compareRuns(baselineRunId, comparisonRunId, thresholdPercent ? Number(thresholdPercent) : 15);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(comparison));
            return;
        }
        catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return;
        }
    }
    // -------------------------------------------------------------------------
    // 4. Commerce Reliability Testbed (CRT) Integration
    // -------------------------------------------------------------------------
    if (pathname === '/api/products' ||
        pathname.startsWith('/api/products/') ||
        pathname.startsWith('/api/inventory') ||
        pathname.startsWith('/api/cart') ||
        pathname.startsWith('/api/checkout') ||
        pathname.startsWith('/api/orders')) {
        if (crtCommerceRouter) {
            let bodyText = '';
            for await (const chunk of req) {
                bodyText += chunk;
            }
            const handled = await crtCommerceRouter(req, res, pathname, bodyText);
            if (handled)
                return;
        }
    }
    if (pathname === '/api/crt/scenarios' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(CRT_SCENARIOS));
        return;
    }
    if (req.method === "POST" && (pathname === "/api/crt/scenarios/run-all" || pathname.startsWith("/api/crt/scenarios/run/"))) {
        const scenarioId = pathname === "/api/crt/scenarios/run-all" ? null : pathname.slice("/api/crt/scenarios/run/".length);
        if (scenarioId !== null && !CRT_SCENARIOS.some(scenario => scenario.id === scenarioId)) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unknown commerce scenario." }));
            return;
        }
        if (crtRunActive) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "A commerce scenario is already running." }));
            return;
        }
        crtRunActive = true;
        try {
            const result = await runCrtScenario(scenarioId);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
        } finally {
            crtRunActive = false;
        }
        return;
    }
    // -------------------------------------------------------------------------
    // 5. Static Serve: Artifact Reports (/artifacts/run-xyz/report.html)
    // -------------------------------------------------------------------------
    if (pathname.startsWith('/artifacts/')) {
        let targetFile;
        try {
            targetFile = path.resolve(ARTIFACTS_DIR, decodeURIComponent(pathname.slice('/artifacts/'.length)));
        } catch { res.writeHead(400); res.end('Invalid artifact path'); return; }
        const relative = path.relative(ARTIFACTS_DIR, targetFile);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile() &&
            isWithinArtifacts(fs.realpathSync(ARTIFACTS_DIR), fs.realpathSync(targetFile))) {
            res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:");
            let contentType = 'text/plain';
            if (targetFile.endsWith('.html'))
                contentType = 'text/html';
            else if (targetFile.endsWith('.json'))
                contentType = 'application/json';
            else if (targetFile.endsWith('.svg'))
                contentType = 'image/svg+xml';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(targetFile).pipe(res);
            return;
        }
    }
    if (req.method === 'GET' && pathname === '/api/qa/results' && !remoteBind) {
        const manifest = await fs.promises.readFile(path.join(ROOT_DIR, 'qa', 'feature-manifest.json'), 'utf8')
            .then(JSON.parse, error => {
                if (error.code !== 'ENOENT') throw error;
                return null;
            });
        const checks = manifest?.executedChecks.map(({ featureId, project, label, runtimeMode, counts, status }) =>
            ({ featureId, project, label, runtimeMode, counts, status })) ?? [];
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ generatedAt: manifest?.generatedAt ?? null, checks }));
        return;
    }
    if (req.method === 'GET' && pathname === '/qa' && !remoteBind) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Evidence · System-X</title><link rel="stylesheet" href="/portal.css"><script type="module" src="/qa-panel.js"></script>
<main class="qa-panel"><a href="/">Control Center</a><h1>QA evidence</h1>
<p id="qa-status" role="status">Loading recorded results…</p>
<label for="qa-check">Check</label> <select id="qa-check" disabled></select>
<dl id="qa-detail"></dl><p>Use <code>node qa/run.mjs</code> to execute checks and <code>node qa/report.mjs</code> to update this view.</p></main></html>`);
        return;
    }
    if (pathname === '/client.js' || pathname === '/portal.css' || (pathname === '/qa-panel.js' && !remoteBind)) {
        const clientFile = path.join(ROOT_DIR, 'gate', pathname.slice(1));
        if (fs.existsSync(clientFile)) {
            res.writeHead(200, { 'Content-Type': pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8' });
            fs.createReadStream(clientFile).pipe(res);
            return;
        }
    }
    // -------------------------------------------------------------------------
    // 6. Interactive Testing Control Center UI
    // -------------------------------------------------------------------------
    if (pathname === '/' || pathname === '/index.html') {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderWebDashboard({ showQa: !remoteBind }));
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
}
function isWithinArtifacts(root, file) {
    const relative = path.relative(root, file);
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(error => {
        console.error('Portal request failed:', error);
        if (res.headersSent) res.destroy();
        else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'The portal could not complete this request.' }));
        }
    });
});
server.listen(PORT, HOST, () => {
    console.log(`[SYSTEM-X] Unified Control Server listening on http://${HOST}:${PORT}`);
});
