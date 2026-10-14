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
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { renderWebDashboard } from './dashboardTemplate.js';
import {
  validateTargetUrl,
  discoverRoutes,
  createBenchmarkRun,
  executeBenchmarkRun,
  cancelBenchmarkRun,
  getBenchmarkRun,
  listBenchmarkRuns,
  getRunRequestSamples,
  compareRuns,
  subscribeToRunEvents,
  type BenchmarkConfig,
} from './benchmarkRunner.js';

const execAsync = promisify(exec);

const PORT = parseInt(process.env['PORT'] ?? process.env['CONTROL_API_PORT'] ?? '8080', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const ARTIFACTS_DIR = path.resolve('artifacts');

// Ensure artifacts dir exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

let isExperimentRunning = false;
let lastExperimentLog = '';
try {
  if (fs.existsSync('MASTER_EXPERIMENT_RESULTS.txt')) {
    lastExperimentLog = fs.readFileSync('MASTER_EXPERIMENT_RESULTS.txt', 'utf8');
  }
} catch {}

let crtScenarioSuiteInstance: any = null;
let crtCommerceRouter: any = null;

async function bootstrapCrtEmbedded() {
  try {
    const { bootstrap: bootstrapCrt } = await import('../crt/server.js');
    const crtApp = await bootstrapCrt();
    crtScenarioSuiteInstance = crtApp.scenarioSuite;
    if (crtApp.catalog && crtApp.inventory && crtApp.cart && crtApp.checkout && crtApp.eventBus && crtApp.adapter) {
      const { createCommerceApiRouter } = await import('../crt/api/commerceApi.js');
      crtCommerceRouter = createCommerceApiRouter({
        catalog: crtApp.catalog,
        inventory: crtApp.inventory,
        cart: crtApp.cart,
        checkout: crtApp.checkout,
        eventBus: crtApp.eventBus,
        adapter: crtApp.adapter,
      });
    }
    console.log('[SYSTEM-X] Embedded Commerce Reliability Testbed (CRT) initialized on port 4200.');
  } catch (err: any) {
    console.warn('[SYSTEM-X] CRT embedded daemon auto-start notice:', err.message);
  }
}

// Start CRT daemon in background on server boot
bootstrapCrtEmbedded();

async function checkHealth(url: string, timeoutMs = 2500): Promise<'ONLINE' | 'OFFLINE'> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500 ? 'ONLINE' : 'OFFLINE';
  } catch {
    return 'OFFLINE';
  }
}

function getHistoricRuns() {
  if (!fs.existsSync(ARTIFACTS_DIR)) return [];
  const entries = fs.readdirSync(ARTIFACTS_DIR, { withFileTypes: true });
  return entries
    .filter((d) => d.isDirectory() && (d.name.startsWith('run-') || d.name.startsWith('bench-run-')))
    .map((d) => {
      const runDir = path.join(ARTIFACTS_DIR, d.name);
      let summary: any = null;
      let hasReport = fs.existsSync(path.join(runDir, 'report.html'));
      try {
        const sumPath = path.join(runDir, 'summary.json');
        if (fs.existsSync(sumPath)) {
          summary = JSON.parse(fs.readFileSync(sumPath, 'utf8'));
        }
      } catch {}
      const stats = fs.statSync(runDir);
      return {
        runId: d.name,
        type: d.name.startsWith('bench-') ? 'WEBSITE_BENCHMARK' : 'CLOSED_LOOP_VERIFICATION',
        createdAt: stats.birthtime || stats.mtime,
        hasReport,
        summary,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch (err: any) {
    throw new Error('Invalid JSON payload: ' + err.message);
  }
}

const CRT_SCENARIOS = [
  {
    id: 'CRT-01',
    name: 'Normal Traffic Baseline',
    category: 'Baseline Flow',
    description: 'Executes standard catalog browsing, inventory check, and order placement under normal conditions.',
    targetTolerance: '100% Pass, Zero Errors',
  },
  {
    id: 'CRT-02',
    name: 'Idempotent Order Creation & Replay Protection',
    category: 'Distributed Safety',
    description: 'Attempts duplicate checkout submissions with identical idempotency keys to ensure zero double-charging or double-order creation.',
    targetTolerance: '100% Idempotency Match',
  },
  {
    id: 'CRT-03',
    name: 'High Concurrency & Flash Sale Overselling Guard',
    category: 'Inventory Safety',
    description: 'Simulates 50 concurrent buyers racing for the last remaining stock item (PHONE-001) to verify strict linearizable stock allocation.',
    targetTolerance: 'Zero Overselling (Max 1 confirmed order)',
  },
  {
    id: 'CRT-04',
    name: 'Single Node Crash & Quorum Minority Failover',
    category: 'Fault Tolerance',
    description: 'Crashes Node 3 during high checkout load, verifying that majority quorum (2 of 3) continues processing without data loss.',
    targetTolerance: 'Uninterrupted Majority Quorum Operation',
  },
  {
    id: 'CRT-05',
    name: 'Asymmetric Network Partition & Split-Brain Guard',
    category: 'Partition Tolerance',
    description: 'Partitions Node 1 into an isolated minority, verifying that the minority partition rejects writes while the majority stays healthy.',
    targetTolerance: 'Zero Split-Brain Writes in Minority',
  },
  {
    id: 'CRT-06',
    name: 'Quorum Read Repair & Stale Read Invalidation',
    category: 'Data Consistency',
    description: 'Updates inventory on 2 nodes, simulates node reboot, then performs quorum read repair to bring lagging node up to date.',
    targetTolerance: '100% Read Repair Convergence',
  },
  {
    id: 'CRT-07',
    name: 'Out-of-Order Message Processing & Event Bus Dedup',
    category: 'Event Consistency',
    description: 'Sends delayed and reversed payment/order events to test that domain handlers enforce monotonicity and sequence invariants.',
    targetTolerance: 'Deterministic Event State Alignment',
  },
  {
    id: 'CRT-08',
    name: 'Crash-Recovery & WAL Replay Verification',
    category: 'Storage Durability',
    description: 'Simulates hard node power failure after write acknowledgment, restarts node, and replays write-ahead log (WAL) from disk.',
    targetTolerance: 'Zero Committed Data Loss after Replay',
  },
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-idempotency-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
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
    const blackboxTarget = process.env['BLACKBOX_URL'] || 'https://blackbox-x.onrender.com/health/live';
    const quorumTarget = process.env['QUORUM_URL'] || 'https://quorum-lab.onrender.com/?format=json';

    const [blackboxStatus, quorumStatus, minioStatus, crtStatus] = await Promise.all([
      checkHealth(blackboxTarget).catch(() => 'OFFLINE'),
      checkHealth(quorumTarget).catch(() => 'OFFLINE'),
      checkHealth('http://127.0.0.1:9000/minio/health/live', 800).catch(() => 'OFFLINE'),
      checkHealth('http://127.0.0.1:4200/api/products', 1200).catch(() => 'OFFLINE'),
    ]);

    const crtOnline = crtStatus === 'ONLINE' || crtScenarioSuiteInstance !== null;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        systemX: 'ONLINE',
        blackboxApi: blackboxStatus === 'ONLINE' ? 'ONLINE' : 'READY',
        quorumApi: quorumStatus === 'ONLINE' ? 'ONLINE' : 'READY',
        minioStorage: minioStatus === 'ONLINE' ? 'ONLINE' : 'READY',
        crtTestbed: crtOnline ? 'ONLINE' : 'READY',
        isExperimentRunning,
        runsCount: getHistoricRuns().length,
        benchmarkRunsCount: listBenchmarkRuns().length,
      })
    );
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

    const mode = url.searchParams.get('mode') ?? 'calibrated';
    isExperimentRunning = true;
    lastExperimentLog = `Experiment initialized (${mode === 'calibrated' ? 'Calibrated Mode' : 'Baseline Mode'})... Starting 3-node cluster, simulation, and chaos injection.\n`;

    // Execute in background
    (async () => {
      try {
        const cmd = mode === 'calibrated'
          ? 'node --import tsx gate/runRealDemo.ts --calibrated'
          : 'node --import tsx gate/runRealDemo.ts';
        const { stdout, stderr } = await execAsync(cmd, {
          maxBuffer: 10 * 1024 * 1024,
        });
        lastExperimentLog = stdout + (stderr ? '\n' + stderr : '');
      } catch (err: any) {
        lastExperimentLog = `Execution error: ${err.message}\n` + (err.stdout ?? '');
      } finally {
        isExperimentRunning = false;
      }
    })();

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Experiment started', status: 'RUNNING' }));
    return;
  }

  if (pathname === '/api/experiment/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        running: isExperimentRunning,
        output: lastExperimentLog,
        latestRun: getHistoricRuns()[0] ?? null,
      })
    );
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
      const result = await validateTargetUrl(
        urlInput,
        Boolean(body.allowLocalhost),
        Boolean(body.authorizedConfirmed)
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    } catch (err: any) {
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
      const result = await discoverRoutes(urlInput, Boolean(body.allowLocalhost));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
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

      // Re-validate target for safety
      const validation = await validateTargetUrl(
        targetUrl,
        Boolean(body.allowLocalhost),
        Boolean(body.authorizedConfirmed)
      );

      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: validation.message, validation }));
        return;
      }

      const run = createBenchmarkRun({
        name: body.name,
        targetUrl,
        routes: Array.isArray(body.routes) && body.routes.length > 0 ? body.routes : ['/'],
        method: body.method || 'GET',
        requestCount: body.requestCount ? parseInt(body.requestCount, 10) : 100,
        concurrency: body.concurrency ? parseInt(body.concurrency, 10) : 5,
        timeoutMs: body.timeoutMs ? parseInt(body.timeoutMs, 10) : 5000,
        headers: body.headers,
        body: body.body,
        allowLocalhost: Boolean(body.allowLocalhost),
        authorizedConfirmed: Boolean(body.authorizedConfirmed),
      });

      // Start execution in background
      executeBenchmarkRun(run.runId);

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Benchmark execution started',
        runId: run.runId,
        status: run.state,
        run,
      }));
      return;
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
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

    if (!runId) {
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
        res.write(`data: ${JSON.stringify({ type: 'COMPLETED', run })}\n\n`);
        res.end();
        return;
      }

      const unsubscribe = subscribeToRunEvents(runId, (event) => {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === 'COMPLETED' || event.state === 'COMPLETED' || event.state === 'FAILED' || event.state === 'CANCELLED') {
            res.end();
          }
        } catch {
          unsubscribe();
        }
      });

      req.on('close', () => {
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
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
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
      const comparison = compareRuns(
        baselineRunId,
        comparisonRunId,
        thresholdPercent ? Number(thresholdPercent) : 15
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(comparison));
      return;
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }

  // -------------------------------------------------------------------------
  // 4. Commerce Reliability Testbed (CRT) Integration
  // -------------------------------------------------------------------------

  if (
    pathname === '/api/products' ||
    pathname.startsWith('/api/products/') ||
    pathname.startsWith('/api/inventory') ||
    pathname.startsWith('/api/cart') ||
    pathname.startsWith('/api/checkout') ||
    pathname.startsWith('/api/orders')
  ) {
    if (crtCommerceRouter) {
      let bodyText = '';
      for await (const chunk of req) {
        bodyText += chunk;
      }
      const handled = await crtCommerceRouter(req, res, pathname, bodyText);
      if (handled) return;
    }
  }

  if (pathname === '/api/crt/scenarios' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(CRT_SCENARIOS));
    return;
  }

  if (pathname.startsWith('/api/crt/scenarios/run/')) {
    const scenarioId = pathname.replace(/^\/api\/crt\/scenarios\/run\//, '');
    try {
      const crtRes = await fetch(`http://127.0.0.1:4200/api/scenarios/run/${scenarioId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
      });
      if (crtRes.ok) {
        const data = await crtRes.json();
        res.writeHead(crtRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }
    } catch {}

    // Resilient in-process execution fallback
    try {
      if (!crtScenarioSuiteInstance) {
        const { QuorumAdapter } = await import('../crt/adapter/quorumAdapter.js');
        const { CrtScenarioSuite } = await import('../crt/scenarios/crtScenarios.js');
        const adapter = new QuorumAdapter();
        await adapter.initializeCluster();
        crtScenarioSuiteInstance = new CrtScenarioSuite(adapter);
      }
      const data = await crtScenarioSuiteInstance.runScenario(scenarioId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `Scenario ${scenarioId} execution error: ${err.message}`,
          scenarioId,
        })
      );
      return;
    }
  }

  if (pathname === '/api/crt/scenarios/run-all' && req.method === 'POST') {
    try {
      const crtRes = await fetch('http://127.0.0.1:4200/api/scenarios/run-all', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
      });
      if (crtRes.ok) {
        const data = await crtRes.json();
        res.writeHead(crtRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }
    } catch {}

    // Resilient in-process execution fallback
    try {
      if (!crtScenarioSuiteInstance) {
        const { QuorumAdapter } = await import('../crt/adapter/quorumAdapter.js');
        const { CrtScenarioSuite } = await import('../crt/scenarios/crtScenarios.js');
        const adapter = new QuorumAdapter();
        await adapter.initializeCluster();
        crtScenarioSuiteInstance = new CrtScenarioSuite(adapter);
      }
      const data = await crtScenarioSuiteInstance.runAll();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `Scenario suite execution error: ${err.message}`,
        })
      );
      return;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Static Serve: Artifact Reports (/artifacts/run-xyz/report.html)
  // -------------------------------------------------------------------------

  if (pathname.startsWith('/artifacts/')) {
    const safeRel = path.normalize(pathname.replace(/^\/artifacts\//, '')).replace(/^(\.\.[\/\\])+/, '');
    const targetFile = path.join(ARTIFACTS_DIR, safeRel);

    if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      let contentType = 'text/plain';
      if (targetFile.endsWith('.html')) contentType = 'text/html';
      else if (targetFile.endsWith('.json')) contentType = 'application/json';
      else if (targetFile.endsWith('.svg')) contentType = 'image/svg+xml';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(targetFile).pipe(res);
      return;
    }
  }

  if (pathname === '/client.js') {
    const clientFile = path.join(path.resolve('gate'), 'client.js');
    if (fs.existsSync(clientFile)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(clientFile).pipe(res);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // 6. Interactive Testing Control Center UI
  // -------------------------------------------------------------------------

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderWebDashboard());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`[SYSTEM-X] Unified Control Server listening on http://${HOST}:${PORT}`);
});
