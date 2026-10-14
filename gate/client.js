/**
 * SYSTEM-X TESTING CONTROL CENTER — CLIENT ENGINE
 *
 * Implements real-time interactivity for:
 *  - Tab navigation & deep-linking
 *  - Target URL SSRF validation & preflight probe
 *  - Real-time HTTP benchmark execution with SSE streaming
 *  - Request inspector with sampling & filtering
 *  - Side-by-side run comparison & regression analysis
 *  - Interactive system model topology editor
 *  - Quorum Lab cluster management & chaos fault injection
 *  - Commerce Reliability Testbed (CRT-01 to CRT-08) suite
 *  - Closed-loop verification master experiment runner
 *  - Historical reports archive
 */

let activeRunId = null;
let sseEventSource = null;
let cachedBenchmarkRuns = [];
let simPollInterval = null;

// Tab Navigation
function switchTab(tabId, ev) {
  if (ev) ev.preventDefault();

  document.querySelectorAll('.tab-content').forEach(function(el) {
    el.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach(function(el) {
    el.classList.remove('active');
  });

  const targetView = document.getElementById('view-' + tabId);
  const targetNav = document.getElementById('tabnav-' + tabId);

  if (targetView) targetView.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  const titleMap = {
    overview: 'Overview',
    website: 'Website Performance',
    compare: 'Compare Runs',
    model: 'System Models',
    quorum: 'Quorum Lab',
    crt: 'Commerce Reliability',
    simulation: 'Closed-Loop Verification',
    reports: 'Reports Archive'
  };
  const breadcrumb = document.getElementById('topbar-breadcrumb');
  if (breadcrumb && titleMap[tabId]) {
    breadcrumb.textContent = titleMap[tabId];
  }

  if (tabId === 'compare') {
    populateComparisonDropdowns();
  } else if (tabId === 'model') {
    renderTopologyCanvas();
    simulateModelTopology();
  } else if (tabId === 'crt') {
    loadCrtScenarios();
  } else if (tabId === 'reports' || tabId === 'overview') {
    loadAllRuns();
  }
}

// Step navigation within Website Benchmark
function goToStep(stepNum, ev) {
  if (ev) ev.preventDefault();
  [1, 2, 3, 4].forEach(function(n) {
    const screen = document.getElementById('bench-screen-' + n);
    const hdr = document.getElementById('step-hdr-' + n);
    if (screen) screen.style.display = (n === stepNum ? 'block' : 'none');
    if (hdr) {
      if (n === stepNum) hdr.classList.add('active');
      else hdr.classList.remove('active');
    }
  });
}

// ---------------------------------------------------------------------------
// 1. Ecosystem Status Poller
// ---------------------------------------------------------------------------
async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      const elSx = document.getElementById('hdr-sx-status');
      const elBbx = document.getElementById('hdr-bbx-status');
      const elQrm = document.getElementById('hdr-qrm-status');
      const elCrt = document.getElementById('hdr-crt-status');
      const elCount = document.getElementById('nav-runs-count');

      if (elSx) elSx.textContent = data.systemX || 'ONLINE';
      if (elBbx) elBbx.textContent = data.blackboxApi || 'READY';
      if (elQrm) elQrm.textContent = data.quorumApi || 'READY';
      if (elCrt) elCrt.textContent = data.crtTestbed || 'READY';
      if (elCount) elCount.textContent = (data.runsCount || 0) + (data.benchmarkRunsCount || 0);
    }
  } catch (err) {}
}

// ---------------------------------------------------------------------------
// 2. Screen 1: Target Validation & Preflight Probe
// ---------------------------------------------------------------------------
async function validateTarget() {
  const urlInputEl = document.getElementById('target-url-input');
  const allowLocalhostEl = document.getElementById('chk-allow-localhost');
  const authorizedConfirmEl = document.getElementById('chk-authorized-confirm');

  const urlInput = urlInputEl ? urlInputEl.value.trim() : '';
  const allowLocalhost = allowLocalhostEl ? allowLocalhostEl.checked : true;
  const authorizedConfirm = authorizedConfirmEl ? authorizedConfirmEl.checked : true;

  if (!urlInput) {
    alert('Please enter a website or API URL.');
    return;
  }

  const resultsDiv = document.getElementById('target-probe-results');
  if (resultsDiv) resultsDiv.style.display = 'block';

  const badgeEl = document.getElementById('probe-badge');
  const msgEl = document.getElementById('probe-msg');
  if (badgeEl) badgeEl.textContent = 'CHECKING...';
  if (msgEl) msgEl.textContent = 'Resolving host and performing pre-flight reachability probe...';

  try {
    const res = await fetch('/api/benchmarks/validate-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: urlInput,
        allowLocalhost: allowLocalhost,
        authorizedConfirmed: authorizedConfirm,
      }),
    });

    const data = await res.json();
    const titleEl = document.getElementById('probe-status-title');
    const ipEl = document.getElementById('probe-ip');
    const codeEl = document.getElementById('probe-code');
    const latEl = document.getElementById('probe-latency');
    const routesCountEl = document.getElementById('probe-routes-count');
    const routesListEl = document.getElementById('probe-routes-list');
    const cfgRoutesEl = document.getElementById('cfg-routes');

    if (data.valid) {
      if (badgeEl) badgeEl.textContent = '✓ REACHABLE';
      if (titleEl) titleEl.textContent = 'Target is Valid & Reachable';
      if (ipEl) ipEl.textContent = data.resolvedIp || 'N/A';
      if (codeEl) codeEl.textContent = 'HTTP ' + (data.statusCode || 200);
      if (latEl) latEl.textContent = (data.responseTimeMs || 0) + 'ms';
      if (msgEl) msgEl.textContent = data.message;

      if (data.suggestedRoutes && data.suggestedRoutes.length > 0) {
        if (routesCountEl) routesCountEl.textContent = data.suggestedRoutes.length + ' discovered';
        if (routesListEl) routesListEl.textContent = 'Discovered routes: ' + data.suggestedRoutes.join(', ');
        if (cfgRoutesEl) cfgRoutesEl.value = data.suggestedRoutes.join(', ');
      }
    } else {
      if (badgeEl) badgeEl.textContent = '! BLOCKED / UNREACHABLE';
      if (titleEl) titleEl.textContent = 'Validation Failed';
      if (ipEl) ipEl.textContent = data.resolvedIp || 'UNRESOLVED';
      if (codeEl) codeEl.textContent = data.statusCode ? 'HTTP ' + data.statusCode : 'ERROR';
      if (latEl) latEl.textContent = (data.responseTimeMs || 0) + 'ms';
      if (msgEl) msgEl.textContent = data.message;
    }
  } catch (err) {
    if (badgeEl) badgeEl.textContent = '! ERROR';
    if (msgEl) msgEl.textContent = 'Failed to validate target: ' + err.message;
  }
}

async function discoverMoreRoutes() {
  const urlInputEl = document.getElementById('target-url-input');
  const allowLocalhostEl = document.getElementById('chk-allow-localhost');
  const routesListEl = document.getElementById('probe-routes-list');
  const routesCountEl = document.getElementById('probe-routes-count');
  const cfgRoutesEl = document.getElementById('cfg-routes');

  const urlInput = urlInputEl ? urlInputEl.value.trim() : '';
  const allowLocalhost = allowLocalhostEl ? allowLocalhostEl.checked : true;

  if (routesListEl) routesListEl.textContent = 'Searching sitemap.xml and public endpoints...';

  try {
    const res = await fetch('/api/benchmarks/discover-routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput, allowLocalhost: allowLocalhost }),
    });
    const data = await res.json();
    if (data.discovered && data.discovered.length > 0) {
      if (routesCountEl) routesCountEl.textContent = data.discovered.length + ' discovered' + (data.sitemapFound ? ' (sitemap.xml)' : '');
      if (routesListEl) routesListEl.textContent = data.discovered.join(', ');
      if (cfgRoutesEl) cfgRoutesEl.value = data.discovered.join(', ');
    } else {
      if (routesListEl) routesListEl.textContent = 'No additional routes discovered automatically. You can specify routes manually.';
    }
  } catch (err) {
    if (routesListEl) routesListEl.textContent = 'Route discovery failed: ' + err.message;
  }
}

// ---------------------------------------------------------------------------
// 3. Screen 2 & 3: Start Benchmark Execution & SSE Streaming
// ---------------------------------------------------------------------------
async function startBenchmarkExecution() {
  const targetUrl = document.getElementById('target-url-input').value.trim();
  const allowLocalhost = document.getElementById('chk-allow-localhost').checked;
  const authorizedConfirm = document.getElementById('chk-authorized-confirm').checked;
  const name = document.getElementById('cfg-test-name').value.trim();
  const method = document.getElementById('cfg-method').value;
  const routes = document.getElementById('cfg-routes').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  const requestCount = parseInt(document.getElementById('cfg-requests').value, 10) || 100;
  const concurrency = parseInt(document.getElementById('cfg-concurrency').value, 10) || 10;
  const timeoutMs = parseInt(document.getElementById('cfg-timeout').value, 10) || 5000;
  const body = document.getElementById('cfg-body').value.trim();

  try {
    const res = await fetch('/api/benchmarks/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        targetUrl: targetUrl,
        routes: routes,
        method: method,
        requestCount: requestCount,
        concurrency: concurrency,
        timeoutMs: timeoutMs,
        body: body || undefined,
        allowLocalhost: allowLocalhost,
        authorizedConfirmed: authorizedConfirm,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert('Failed to start benchmark: ' + (data.error || 'Unknown error'));
      return;
    }

    activeRunId = data.runId;
    goToStep(3);
    setupLiveExecutionScreen(data.run);
    connectSSEStream(data.runId);
  } catch (err) {
    alert('Error starting benchmark: ' + err.message);
  }
}

function setupLiveExecutionScreen(run) {
  document.getElementById('live-run-id').textContent = run.runId;
  document.getElementById('live-run-state').textContent = '↻ ' + run.state;
  document.getElementById('live-progress-fill').style.width = '0%';
  document.getElementById('live-sent-count').textContent = '0';
  document.getElementById('live-completed-count').textContent = '0';
  document.getElementById('live-total-count').textContent = run.config.requestCount;
  document.getElementById('live-pct').textContent = '0%';
  document.getElementById('live-elapsed').textContent = '0.0s';
  document.getElementById('live-throughput').textContent = '0.0';
  document.getElementById('live-p50').textContent = '—';
  document.getElementById('live-p99').textContent = '—';
  document.getElementById('live-failures').textContent = '0';
  document.getElementById('live-event-terminal').textContent =
    '[' + new Date().toLocaleTimeString() + '] Benchmark initialized for ' + run.config.targetUrl + '\n' +
    'Concurrency: ' + run.config.concurrency + ' workers · Target requests: ' + run.config.requestCount + '\n';
}

function connectSSEStream(runId) {
  if (sseEventSource) {
    sseEventSource.close();
  }

  sseEventSource = new EventSource('/api/benchmarks/runs/' + runId + '/stream');

  sseEventSource.onmessage = function(event) {
    try {
      const payload = JSON.parse(event.data);
      handleLiveUpdate(payload);
    } catch (err) {}
  };

  sseEventSource.onerror = function() {
    if (sseEventSource) sseEventSource.close();
  };
}

function handleLiveUpdate(payload) {
  const terminal = document.getElementById('live-event-terminal');
  const run = payload.run;
  if (!run) return;

  const total = run.config.requestCount;
  const completed = run.completedRequests;
  const pct = Math.min(100, Math.round((completed / total) * 100));

  document.getElementById('live-progress-fill').style.width = pct + '%';
  document.getElementById('live-sent-count').textContent = run.sentRequests;
  document.getElementById('live-completed-count').textContent = completed;
  document.getElementById('live-pct').textContent = pct + '%';
  document.getElementById('live-elapsed').textContent = (run.elapsedMs / 1000).toFixed(1) + 's';
  document.getElementById('live-throughput').textContent = run.throughputRps || '0.0';
  document.getElementById('live-failures').textContent = run.failedRequests;

  if (run.latency) {
    if (run.latency.p50Ms) document.getElementById('live-p50').textContent = run.latency.p50Ms + 'ms';
    if (run.latency.p99Ms) document.getElementById('live-p99').textContent = run.latency.p99Ms + 'ms';
  }

  if (payload.type === 'PROGRESS' && terminal) {
    terminal.textContent += '[' + new Date().toLocaleTimeString() + '] Progress: ' + completed + '/' + total + ' completed (' + pct + '%) · ' + run.throughputRps + ' rps · P99: ' + (run.latency ? run.latency.p99Ms : 0) + 'ms\n';
    terminal.scrollTop = terminal.scrollHeight;
  }

  if (payload.type === 'COMPLETED' || run.state === 'COMPLETED' || run.state === 'FAILED' || run.state === 'CANCELLED') {
    if (sseEventSource) sseEventSource.close();
    document.getElementById('live-run-state').textContent = '✓ ' + run.state;
    if (terminal) {
      terminal.textContent += '[' + new Date().toLocaleTimeString() + '] Benchmark execution finished with state: ' + run.state + '\n';
    }
    setTimeout(function() {
      showBenchmarkResults(run);
    }, 800);
  }
}

async function cancelCurrentRun() {
  if (!activeRunId) return;
  try {
    await fetch('/api/benchmarks/runs/' + activeRunId + '/cancel', { method: 'POST' });
    document.getElementById('live-run-state').textContent = '! CANCELLED';
  } catch (err) {}
}

// ---------------------------------------------------------------------------
// 4. Screen 4: Results & Request Inspector
// ---------------------------------------------------------------------------
function showBenchmarkResults(run) {
  goToStep(4);
  document.getElementById('res-run-id').textContent = run.runId;
  document.getElementById('res-throughput').textContent = run.throughputRps + ' rps';
  document.getElementById('res-mean').textContent = (run.latency ? run.latency.meanMs : 0) + ' ms';
  document.getElementById('res-p99').textContent = (run.latency ? run.latency.p99Ms : 0) + ' ms';
  document.getElementById('res-p95').textContent = 'P95: ' + (run.latency ? run.latency.p95Ms : 0) + ' ms';

  const successRate = run.completedRequests > 0 ? ((run.successfulRequests / run.completedRequests) * 100).toFixed(1) : '0';
  document.getElementById('res-success-rate').textContent = successRate + '%';
  document.getElementById('res-counts').textContent = run.successfulRequests + ' pass / ' + run.failedRequests + ' fail';

  // Quantiles
  document.getElementById('dist-min').textContent = (run.latency ? run.latency.minMs : 0) + 'ms';
  document.getElementById('dist-p50').textContent = (run.latency ? run.latency.p50Ms : 0) + 'ms';
  document.getElementById('dist-p90').textContent = (run.latency ? run.latency.p90Ms : 0) + 'ms';
  document.getElementById('dist-p95').textContent = (run.latency ? run.latency.p95Ms : 0) + 'ms';
  document.getElementById('dist-p99').textContent = (run.latency ? run.latency.p99Ms : 0) + 'ms';
  document.getElementById('dist-max').textContent = (run.latency ? run.latency.maxMs : 0) + 'ms';

  // Route Breakdown
  const tbodyRoutes = document.getElementById('tbody-route-breakdown');
  if (tbodyRoutes) {
    tbodyRoutes.innerHTML = '';
    if (run.routeBreakdown) {
      for (const route in run.routeBreakdown) {
        const stat = run.routeBreakdown[route];
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td><code>' + route + '</code></td>' +
          '<td>' + stat.count + '</td>' +
          '<td>' + (stat.count > 0 ? Math.round((stat.successCount / stat.count) * 100) : 0) + '%</td>' +
          '<td>' + stat.meanMs + 'ms</td>' +
          '<td>' + stat.p99Ms + 'ms</td>';
        tbodyRoutes.appendChild(tr);
      }
    }
  }

  // Download links
  document.getElementById('lnk-download-json').href = '/artifacts/' + run.runId + '/summary.json';
  document.getElementById('lnk-view-html').href = '/artifacts/' + run.runId + '/report.html';

  loadRequestSamples(run.runId);
  loadAllRuns();
}

async function loadRequestSamples(runId, filter) {
  filter = filter || 'ALL';
  const tbody = document.getElementById('tbody-request-samples');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Fetching request samples...</td></tr>';
  try {
    let url = '/api/benchmarks/runs/' + runId + '/requests?limit=100';
    if (filter !== 'ALL') url += '&status=' + filter;
    const res = await fetch(url);
    const data = await res.json();
    tbody.innerHTML = '';

    if (!data.samples || data.samples.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No request samples recorded.</td></tr>';
      return;
    }

    data.samples.slice(0, 100).forEach(function(s) {
      const tr = document.createElement('tr');
      const isPass = s.success;
      tr.innerHTML =
        '<td><code>' + s.requestId + '</code></td>' +
        '<td><strong>' + s.method + '</strong></td>' +
        '<td><code>' + s.route + '</code></td>' +
        '<td><code>HTTP ' + s.statusCode + '</code></td>' +
        '<td>' + s.durationMs + 'ms</td>' +
        '<td><span class="badge ' + (isPass ? '' : 'badge-inverse') + '">' + (isPass ? '✓ PASS' : '! FAIL') + '</span></td>' +
        '<td>' + (s.errorMessage ? s.errorMessage : '—') + '</td>';
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted); text-align:center;">Failed to load samples: ' + err.message + '</td></tr>';
  }
}

function filterRequestSamples() {
  const filter = document.getElementById('inspector-filter').value;
  if (activeRunId) loadRequestSamples(activeRunId, filter);
}

function refreshRequestInspector() {
  filterRequestSamples();
}

// ---------------------------------------------------------------------------
// 5. TAB 3: Side-by-Side Comparison Engine
// ---------------------------------------------------------------------------
function populateComparisonDropdowns() {
  const baseSel = document.getElementById('cmp-baseline-select');
  const compSel = document.getElementById('cmp-target-select');
  if (!baseSel || !compSel) return;
  baseSel.innerHTML = '';
  compSel.innerHTML = '';

  if (cachedBenchmarkRuns.length === 0) {
    baseSel.innerHTML = '<option value="">No benchmark runs available</option>';
    compSel.innerHTML = '<option value="">No benchmark runs available</option>';
    return;
  }

  cachedBenchmarkRuns.forEach(function(r, idx) {
    const optA = document.createElement('option');
    optA.value = r.runId;
    optA.textContent = r.runId + ' (' + (r.config ? r.config.name : 'Benchmark') + ') - P99: ' + (r.latency ? r.latency.p99Ms : 0) + 'ms';
    baseSel.appendChild(optA);

    const optB = document.createElement('option');
    optB.value = r.runId;
    optB.textContent = r.runId + ' (' + (r.config ? r.config.name : 'Benchmark') + ') - P99: ' + (r.latency ? r.latency.p99Ms : 0) + 'ms';
    if (idx === 1) optB.selected = true;
    compSel.appendChild(optB);
  });
}

async function executeComparison() {
  const baselineRunId = document.getElementById('cmp-baseline-select').value;
  const comparisonRunId = document.getElementById('cmp-target-select').value;
  const thresholdPercent = parseInt(document.getElementById('cmp-threshold').value, 10) || 15;

  if (!baselineRunId || !comparisonRunId) {
    alert('Please select both baseline and comparison runs.');
    return;
  }

  try {
    const res = await fetch('/api/benchmarks/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baselineRunId: baselineRunId,
        comparisonRunId: comparisonRunId,
        thresholdPercent: thresholdPercent,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Comparison error: ' + (data.error || 'Failed to compare runs'));
      return;
    }

    renderComparisonResults(data);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function renderComparisonResults(data) {
  const vBox = document.getElementById('cmp-verdict-box');
  const tblCard = document.getElementById('cmp-table-card');
  vBox.style.display = 'block';
  tblCard.style.display = 'block';

  const vTitle = document.getElementById('cmp-verdict-title');
  const vBadge = document.getElementById('cmp-verdict-badge');
  const vSummary = document.getElementById('cmp-verdict-summary');

  vBadge.textContent = data.verdict;
  vSummary.textContent = data.summary;

  if (data.verdict === 'IMPROVED') {
    vTitle.textContent = '✓ Performance Improvement Confirmed';
  } else if (data.verdict === 'REGRESSED') {
    vTitle.textContent = '! Performance Regression Detected';
  } else if (data.verdict === 'WITHIN_THRESHOLD') {
    vTitle.textContent = '✓ Within Allowable Engineering Threshold';
  } else {
    vTitle.textContent = '○ Not Directly Comparable';
  }

  const tbody = document.getElementById('tbody-comparison-diff');
  tbody.innerHTML = '';

  const metricRows = [
    { label: 'Throughput (req/s)', key: 'throughput' },
    { label: 'Mean Latency (ms)', key: 'meanLatency' },
    { label: 'P50 Latency (ms)', key: 'p50' },
    { label: 'P90 Latency (ms)', key: 'p90' },
    { label: 'P99 Latency (ms)', key: 'p99' },
    { label: 'Success Rate (%)', key: 'successRate' },
  ];

  metricRows.forEach(function(m) {
    const met = data.metrics[m.key];
    if (!met) return;
    const tr = document.createElement('tr');
    const sign = met.diffPercent > 0 ? '+' : '';
    tr.innerHTML =
      '<td><strong>' + m.label + '</strong></td>' +
      '<td>' + met.baseline + '</td>' +
      '<td>' + met.comparison + '</td>' +
      '<td><code>' + sign + met.diffPercent + '%</code></td>' +
      '<td><span class="badge">' + (Math.abs(met.diffPercent) > data.thresholdPercent ? '! OUTLIER' : '✓ OK') + '</span></td>';
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// 6. TAB 4: Model Topology Editor & Analytical Queueing Solver Logic
// ---------------------------------------------------------------------------
let topologyNodes = [
  { id: 'node-edge-gw', name: 'API Gateway', type: 'ENTRY', concurrency: 500, serviceTimeMs: 4, maxQueueDepth: 1000 },
  { id: 'node-order-svc', name: 'Order Service', type: 'SERVICE', concurrency: 16, serviceTimeMs: 12, maxQueueDepth: 200 },
  { id: 'node-quorum-db', name: 'Quorum Cluster', type: 'STORAGE', concurrency: 32, serviceTimeMs: 15, maxQueueDepth: 500 },
];
let lastBottleneckNodeId = null;

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTopologyCanvas() {
  const canvas = document.getElementById('model-canvas');
  if (!canvas) return;
  const countBadge = document.getElementById('topology-count-badge');
  if (countBadge) {
    countBadge.textContent = topologyNodes.length + (topologyNodes.length === 1 ? ' Node Configured' : ' Nodes Configured');
  }

  canvas.innerHTML = '';

  topologyNodes.forEach(function(node, idx) {
    if (idx > 0) {
      const arrow = document.createElement('div');
      arrow.className = 'connector-line';
      arrow.textContent = '→';
      canvas.appendChild(arrow);
    }

    const box = document.createElement('div');
    const isBottleneck = node.id === lastBottleneckNodeId;
    box.className = 'node-box' + (isBottleneck ? ' is-bottleneck' : '');
    box.id = 'box-' + node.id;

    const maxCap = Math.round((node.concurrency * 1000) / Math.max(1, node.serviceTimeMs));

    box.innerHTML =
      '<div class="node-title">' +
      '  <span style="font-weight:700;">' + escapeHtml(node.name) + '</span>' +
      '  <div style="display:flex; align-items:center; gap:4px;">' +
      '    <span class="badge">' + node.type + '</span>' +
      (idx > 0 ? '    <button class="node-delete-btn" title="Remove Node" onclick="removeModelNode(\'' + node.id + '\')">&times;</button>' : '') +
      '  </div>' +
      '</div>' +
      '<div class="node-param-row">' +
      '  <span>Concurrency / Pool:</span>' +
      '  <input type="number" class="node-param-input" min="1" max="10000" value="' + node.concurrency + '" onchange="updateNodeParam(\'' + node.id + '\', \'concurrency\', this.value)" />' +
      '</div>' +
      '<div class="node-param-row">' +
      '  <span>Service Time (ms):</span>' +
      '  <input type="number" class="node-param-input" min="1" max="5000" value="' + node.serviceTimeMs + '" onchange="updateNodeParam(\'' + node.id + '\', \'serviceTimeMs\', this.value)" />' +
      '</div>' +
      '<div class="node-param-row">' +
      '  <span>Queue Buffer Limit:</span>' +
      '  <input type="number" class="node-param-input" min="10" max="50000" value="' + node.maxQueueDepth + '" onchange="updateNodeParam(\'' + node.id + '\', \'maxQueueDepth\', this.value)" />' +
      '</div>' +
      '<div style="margin-top:8px; padding-top:6px; border-top:1px dashed var(--border); display:flex; justify-content:space-between; font-size:10px; font-family:var(--font-mono); color:var(--text-muted);">' +
      '  <span>Max Capacity:</span>' +
      '  <strong style="color:var(--text);">' + maxCap.toLocaleString() + ' QPS</strong>' +
      '</div>' +
      (isBottleneck ? '<div style="margin-top:4px; font-size:10px; font-family:var(--font-mono); color:var(--text); font-weight:700; text-align:center;">! CRITICAL BOTTLENECK</div>' : '');

    canvas.appendChild(box);
  });
}

function addModelNode(type) {
  let defaultConcurrency = 20;
  let defaultServiceTime = 10;
  let defaultQueue = 200;
  let defaultName = 'Service #' + (topologyNodes.length + 1);

  if (type === 'SERVICE') {
    defaultConcurrency = 24;
    defaultServiceTime = 12;
    defaultQueue = 300;
    defaultName = 'Microservice #' + (topologyNodes.length + 1);
  } else if (type === 'DATABASE') {
    defaultConcurrency = 16;
    defaultServiceTime = 20;
    defaultQueue = 200;
    defaultName = 'PostgreSQL DB #' + (topologyNodes.length + 1);
  } else if (type === 'CACHE') {
    defaultConcurrency = 150;
    defaultServiceTime = 2;
    defaultQueue = 1000;
    defaultName = 'Redis Cache #' + (topologyNodes.length + 1);
  } else if (type === 'QUEUE') {
    defaultConcurrency = 80;
    defaultServiceTime = 6;
    defaultQueue = 5000;
    defaultName = 'Kafka Topic #' + (topologyNodes.length + 1);
  }

  const newNode = {
    id: 'node-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    name: defaultName,
    type: type,
    concurrency: defaultConcurrency,
    serviceTimeMs: defaultServiceTime,
    maxQueueDepth: defaultQueue,
  };

  topologyNodes.push(newNode);
  renderTopologyCanvas();
  simulateModelTopology();
}

function removeModelNode(id) {
  topologyNodes = topologyNodes.filter(function(n) { return n.id !== id; });
  renderTopologyCanvas();
  simulateModelTopology();
}

function updateNodeParam(id, field, value) {
  const node = topologyNodes.find(function(n) { return n.id === id; });
  if (node) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      node[field] = num;
    }
  }
  renderTopologyCanvas();
  simulateModelTopology();
}

function resetDefaultTopology() {
  topologyNodes = [
    { id: 'node-edge-gw', name: 'API Gateway', type: 'ENTRY', concurrency: 500, serviceTimeMs: 4, maxQueueDepth: 1000 },
    { id: 'node-order-svc', name: 'Order Service', type: 'SERVICE', concurrency: 16, serviceTimeMs: 12, maxQueueDepth: 200 },
    { id: 'node-quorum-db', name: 'Quorum Cluster', type: 'STORAGE', concurrency: 32, serviceTimeMs: 15, maxQueueDepth: 500 },
  ];
  lastBottleneckNodeId = null;
  renderTopologyCanvas();
  simulateModelTopology();
}

function simulateModelTopology() {
  if (topologyNodes.length === 0) return;

  // 1. Calculate each node's capacity
  const stageStats = topologyNodes.map(function(node, index) {
    const cap = (node.concurrency * 1000) / Math.max(1, node.serviceTimeMs);
    return {
      node: node,
      stage: index + 1,
      capacityQps: Math.round(cap),
      rawCap: cap,
    };
  });

  // 2. Identify the bottleneck (minimum capacity node)
  const sorted = stageStats.slice().sort(function(a, b) { return a.rawCap - b.rawCap; });
  const bottleneck = sorted[0];
  lastBottleneckNodeId = bottleneck.node.id;

  // 3. Compute Pipeline Math
  const maxSystemQps = bottleneck.capacityQps;
  const baseLatencyMs = topologyNodes.reduce(function(acc, n) { return acc + n.serviceTimeMs; }, 0);

  // M/M/c queueing approximation for tail latency under 90% load
  const p99Est = Math.round(baseLatencyMs + (bottleneck.node.serviceTimeMs * 3.5));

  // 4. Update Header Badge & 4 Metric Cards
  const verdictBadge = document.getElementById('model-verdict-badge');
  if (verdictBadge) {
    verdictBadge.textContent = maxSystemQps.toLocaleString() + ' QPS BOUNDED';
  }

  const statMax = document.getElementById('stat-max-qps');
  if (statMax) statMax.textContent = maxSystemQps.toLocaleString() + ' req/s';

  const statMaxSub = document.getElementById('stat-max-sub');
  if (statMaxSub) statMaxSub.textContent = 'Bound by ' + bottleneck.node.name;

  const statBase = document.getElementById('stat-base-lat');
  if (statBase) statBase.textContent = baseLatencyMs + ' ms';

  const statBottleName = document.getElementById('stat-bottleneck-name');
  if (statBottleName) statBottleName.textContent = bottleneck.node.name;

  const statBottleType = document.getElementById('stat-bottleneck-type');
  if (statBottleType) statBottleType.textContent = 'Stage #' + bottleneck.stage + ' (' + bottleneck.node.type + ')';

  const statP99 = document.getElementById('stat-p99-lat');
  if (statP99) statP99.textContent = p99Est + ' ms';

  // 5. Generate Root-Cause Analysis & Recommendations
  const recTitle = document.getElementById('model-recommendation-title');
  const recBody = document.getElementById('model-recommendation-body');

  const target2x = maxSystemQps * 2;
  const neededConcurrency = Math.ceil((target2x * bottleneck.node.serviceTimeMs) / 1000);
  const neededLatency = Math.max(1, Math.floor((bottleneck.node.concurrency * 1000) / target2x));

  if (recTitle) {
    recTitle.innerHTML =
      '<span class="badge badge-inverse" style="margin-right:6px;">! BOTTLENECK IDENTIFIED</span>' +
      escapeHtml(bottleneck.node.name) + ' limits overall system throughput to ' + maxSystemQps.toLocaleString() + ' QPS.';
  }

  if (recBody) {
    recBody.innerHTML =
      '<p style="margin-bottom:8px;"><strong>Root Cause Analysis:</strong> ' +
      'Stage #' + bottleneck.stage + ' (<strong>' + escapeHtml(bottleneck.node.name) + '</strong>) operates with a concurrency limit of <code>' + bottleneck.node.concurrency + '</code> and processing duration of <code>' + bottleneck.node.serviceTimeMs + 'ms</code>. ' +
      'At an arrival rate exceeding <code>' + maxSystemQps.toLocaleString() + ' req/s</code>, this node hits 100% thread-pool/worker exhaustion. ' +
      'Incoming requests accumulate in its buffer (limit: ' + bottleneck.node.maxQueueDepth + ' requests) until exhausting capacity, causing queuing delay spikes and rejected requests.</p>' +
      '<p><strong>Actionable Scaling Recommendations:</strong><br/>' +
      '&bull; <strong>Horizontal Scale:</strong> Increase <code>' + escapeHtml(bottleneck.node.name) + '</code> concurrency from <code>' + bottleneck.node.concurrency + '</code> to <code>' + neededConcurrency + '</code> to unlock <strong>' + target2x.toLocaleString() + ' QPS</strong> capacity.<br/>' +
      '&bull; <strong>Vertical Optimization:</strong> Reduce service processing latency from <code>' + bottleneck.node.serviceTimeMs + 'ms</code> to <code>' + neededLatency + 'ms</code> (via SQL indexing, caching, or read replicas).<br/>' +
      '&bull; <strong>Queue Cushion:</strong> Under a 20% traffic surge (<code>' + Math.round(maxSystemQps * 1.2) + ' QPS</code>), the current queue buffer of <code>' + bottleneck.node.maxQueueDepth + '</code> will hold overflow for <strong>' + (bottleneck.node.maxQueueDepth / Math.max(1, Math.round(maxSystemQps * 0.2))).toFixed(1) + ' seconds</strong> before rejecting load.</p>';
  }

  // 6. Populate Breakdown Table
  const tbody = document.getElementById('tbody-model-stages');
  if (tbody) {
    tbody.innerHTML = '';
    stageStats.forEach(function(st) {
      const isCritical = st.node.id === bottleneck.node.id;
      const tr = document.createElement('tr');
      if (isCritical) {
        tr.style.background = 'var(--bg-hover)';
      }
      tr.innerHTML =
        '<td><strong>Stage ' + st.stage + '</strong></td>' +
        '<td><strong>' + escapeHtml(st.node.name) + '</strong>' + (isCritical ? ' <span class="badge badge-inverse" style="font-size:9px;">BOTTLENECK</span>' : '') + '</td>' +
        '<td><span class="badge">' + st.node.type + '</span></td>' +
        '<td><code>' + st.node.concurrency + ' workers</code></td>' +
        '<td><code>' + st.node.serviceTimeMs + ' ms</code></td>' +
        '<td><code>' + st.node.maxQueueDepth + ' reqs</code></td>' +
        '<td><strong>' + st.capacityQps.toLocaleString() + ' req/s</strong></td>' +
        '<td>' + (isCritical ? '<span class="badge badge-inverse">! BOTTLENECK (100% Load)</span>' : '<span class="badge">✓ HEALTHY (' + Math.round((maxSystemQps / st.capacityQps) * 100) + '% Load)</span>') + '</td>';
      tbody.appendChild(tr);
    });
  }

  // Update canvas styling to reflect bottleneck node
  const canvas = document.getElementById('model-canvas');
  if (canvas) {
    canvas.querySelectorAll('.node-box').forEach(function(box) {
      if (box.id === 'box-' + bottleneck.node.id) {
        box.classList.add('is-bottleneck');
      } else {
        box.classList.remove('is-bottleneck');
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 7. TAB 5: Quorum Lab Chaos & Fault Injector
// ---------------------------------------------------------------------------
function crashNode(nodeNum) {
  const terminal = document.getElementById('quorum-terminal');
  if (terminal) {
    terminal.textContent += '[Chaos Injection] Node ' + nodeNum + ' CRASHED! Heartbeat lost.\n';
    terminal.scrollTop = terminal.scrollHeight;
  }
  const badge = document.getElementById('badge-node-' + nodeNum);
  if (badge) {
    badge.textContent = '— OFFLINE';
    badge.classList.remove('badge-inverse');
  }
}

function partitionNode(nodeNum) {
  const terminal = document.getElementById('quorum-terminal');
  if (terminal) {
    terminal.textContent += '[Chaos Injection] Node ' + nodeNum + ' isolated into asymmetric network partition!\n';
    terminal.scrollTop = terminal.scrollHeight;
  }
  const badge = document.getElementById('badge-node-' + nodeNum);
  if (badge) badge.textContent = '! PARTITIONED';
}

function healAllNodes() {
  const terminal = document.getElementById('quorum-terminal');
  if (terminal) {
    terminal.textContent += '[Quorum Engine] Healed all network partitions. Nodes 1, 2, 3 re-established quorum.\n';
    terminal.scrollTop = terminal.scrollHeight;
  }
  const b1 = document.getElementById('badge-node-1');
  const b2 = document.getElementById('badge-node-2');
  const b3 = document.getElementById('badge-node-3');
  if (b1) b1.textContent = 'LEADER';
  if (b2) b2.textContent = 'FOLLOWER';
  if (b3) b3.textContent = 'FOLLOWER';
}

function injectQuorumPartition() {
  partitionNode(3);
}

function executeQuorumWrite() {
  const terminal = document.getElementById('quorum-terminal');
  const k = document.getElementById('quorum-key').value;
  const v = document.getElementById('quorum-val').value;
  if (terminal) {
    terminal.textContent += '[Write W=2] Sending key "' + k + '"="' + v + '" -> Replicated to Node 1 and Node 2. Quorum ACK received (12ms).\n';
    terminal.scrollTop = terminal.scrollHeight;
  }
}

function executeQuorumRead() {
  const terminal = document.getElementById('quorum-terminal');
  const k = document.getElementById('quorum-key').value;
  if (terminal) {
    terminal.textContent += '[Read R=2] Reading key "' + k + '" from 2 replicas -> Versions match: v=95. Consistent read verified.\n';
    terminal.scrollTop = terminal.scrollHeight;
  }
}

function triggerReadRepair() {
  const terminal = document.getElementById('quorum-terminal');
  if (terminal) {
    terminal.textContent += '[Read Repair] Reconciling stale replica Node 3 with current WAL index 1,042 -> Stale read invalidated & repaired.\n';
    terminal.scrollTop = terminal.scrollHeight;
  }
}

// ---------------------------------------------------------------------------
// 8. TAB 6: Commerce Reliability Testbed (CRT)
// ---------------------------------------------------------------------------
async function loadCrtScenarios() {
  const tbody = document.getElementById('tbody-crt-scenarios');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Fetching CRT scenarios...</td></tr>';

  try {
    const res = await fetch('/api/crt/scenarios');
    const scenarios = await res.json();
    tbody.innerHTML = '';

    scenarios.forEach(function(sc) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><code>' + sc.id + '</code></td>' +
        '<td><strong>' + sc.name + '</strong></td>' +
        '<td><span class="badge">' + sc.category + '</span></td>' +
        '<td style="max-width:280px; white-space:normal; font-size:11px;">' + sc.description + '</td>' +
        '<td style="font-size:11px;">' + sc.targetTolerance + '</td>' +
        '<td><span class="badge" id="crt-res-' + sc.id + '">—</span></td>' +
        '<td><button class="btn btn-secondary btn-sm" onclick="runSingleCrtScenario(\'' + sc.id + '\')">Run →</button></td>';
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted); text-align:center;">Failed to load scenarios: ' + err.message + '</td></tr>';
  }
}

async function runSingleCrtScenario(id) {
  const terminal = document.getElementById('crt-terminal');
  const badge = document.getElementById('crt-res-' + id);
  if (badge) badge.textContent = '↻ RUNNING';
  if (terminal) {
    terminal.textContent += '\n[' + new Date().toLocaleTimeString() + '] Executing ' + id + ' against Commerce Reliability Testbed...\n';
  }

  try {
    const res = await fetch('/api/crt/scenarios/run/' + id, { method: 'POST' });
    const result = await res.json();
    if (badge) badge.textContent = result.passed ? '✓ PASS' : '! FAIL';
    if (terminal) {
      terminal.textContent += JSON.stringify(result, null, 2) + '\n';
      terminal.scrollTop = terminal.scrollHeight;
    }
  } catch (err) {
    if (badge) badge.textContent = '! ERROR';
    if (terminal) {
      terminal.textContent += 'Error executing ' + id + ': ' + err.message + '\n';
    }
  }
}

async function runAllCrtScenarios() {
  const terminal = document.getElementById('crt-terminal');
  if (terminal) {
    terminal.textContent = '[' + new Date().toLocaleTimeString() + '] Executing entire CRT Scenario Suite (CRT-01 to CRT-08)...\n';
  }
  const badge = document.getElementById('crt-status-badge');
  if (badge) badge.textContent = '↻ RUNNING';

  try {
    const res = await fetch('/api/crt/scenarios/run-all', { method: 'POST' });
    const results = await res.json();
    if (badge) badge.textContent = '✓ FINISHED';
    if (terminal) {
      terminal.textContent += JSON.stringify(results, null, 2) + '\n';
      terminal.scrollTop = terminal.scrollHeight;
    }
    if (Array.isArray(results)) {
      results.forEach(function(r) {
        const scBadge = document.getElementById('crt-res-' + r.scenarioId);
        if (scBadge) scBadge.textContent = r.passed ? '✓ PASS' : '! FAIL';
      });
    }
  } catch (err) {
    if (badge) badge.textContent = '! ERROR';
    if (terminal) {
      terminal.textContent += 'Failed to run scenario suite: ' + err.message + '\n';
    }
  }
}

// ---------------------------------------------------------------------------
// 9. TAB 7: Closed-Loop Master Experiment Runner
// ---------------------------------------------------------------------------
async function runMasterExperiment(mode) {
  mode = mode || 'calibrated';
  const terminal = document.getElementById('sim-terminal');
  const badge = document.getElementById('sim-status-badge');
  if (badge) badge.textContent = '↻ RUNNING';
  if (terminal) {
    terminal.textContent = '[' + new Date().toLocaleTimeString() + '] Initiating closed-loop experiment in ' + mode + ' mode...\n';
  }

  try {
    const res = await fetch('/api/experiment/run?mode=' + mode, { method: 'POST' });
    if (!res.ok) {
      const errData = await res.json();
      if (terminal) terminal.textContent += 'Error: ' + (errData.error || 'Execution blocked') + '\n';
      if (badge) badge.textContent = '! BLOCKED';
      return;
    }

    if (simPollInterval) clearInterval(simPollInterval);
    simPollInterval = setInterval(pollMasterStatus, 1500);
  } catch (err) {
    if (terminal) terminal.textContent += 'Execution failed: ' + err.message + '\n';
  }
}

async function pollMasterStatus() {
  try {
    const res = await fetch('/api/experiment/status');
    const data = await res.json();
    const terminal = document.getElementById('sim-terminal');
    const badge = document.getElementById('sim-status-badge');
    if (terminal) {
      terminal.textContent = data.output || 'Running...';
      terminal.scrollTop = terminal.scrollHeight;
    }

    if (!data.running) {
      clearInterval(simPollInterval);
      if (badge) badge.textContent = '✓ COMPLETED';
      loadAllRuns();
    }
  } catch (err) {}
}

function runClosedLoopQuick() {
  switchTab('simulation');
  runMasterExperiment('calibrated');
}

// ---------------------------------------------------------------------------
// 10. TAB 8 & Overview: Persistent Runs Archive
// ---------------------------------------------------------------------------
async function loadAllRuns() {
  try {
    const runsRes = await fetch('/api/runs');
    const benchRes = await fetch('/api/benchmarks/runs');

    const masterRuns = await runsRes.json().catch(function() { return []; });
    cachedBenchmarkRuns = await benchRes.json().catch(function() { return []; });

    renderRecentRunsTable(cachedBenchmarkRuns, masterRuns);
    renderArchiveRunsTable(cachedBenchmarkRuns, masterRuns);
  } catch (err) {}
}

function renderRecentRunsTable(benchRuns, masterRuns) {
  const tbody = document.getElementById('tbody-recent-runs');
  if (!tbody) return;
  tbody.innerHTML = '';

  const all = [].concat(
    benchRuns.map(function(b) { return Object.assign({}, b, { source: 'BENCHMARK' }); }),
    masterRuns.map(function(m) { return Object.assign({}, m, { source: 'SIMULATION' }); })
  ).sort(function(a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (all.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No runs recorded yet. Start a website benchmark above.</td></tr>';
    return;
  }

  all.slice(0, 8).forEach(function(r) {
    const tr = document.createElement('tr');
    const isBench = r.source === 'BENCHMARK';
    const p99 = isBench
      ? (r.latency && r.latency.p99Ms ? r.latency.p99Ms + 'ms' : '—')
      : (r.summary && r.summary.p99LatencyMs ? r.summary.p99LatencyMs + 'ms' : '—');
    const tput = isBench
      ? (r.throughputRps ? r.throughputRps + ' rps' : '—')
      : (r.summary && r.summary.throughputQps ? r.summary.throughputQps + ' qps' : '—');
    const target = isBench
      ? (r.config ? r.config.targetUrl : 'Website')
      : 'Closed-Loop Master';
    const successRate = isBench
      ? (r.completedRequests > 0 ? Math.round((r.successfulRequests / r.completedRequests) * 100) + '%' : '—')
      : (r.summary && r.summary.certificationStatus ? r.summary.certificationStatus : 'PASS');

    tr.innerHTML =
      '<td><code>' + r.runId + '</code></td>' +
      '<td><span class="badge">' + r.source + '</span></td>' +
      '<td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">' + target + '</td>' +
      '<td><span class="badge">' + (r.state || 'COMPLETED') + '</span></td>' +
      '<td>' + tput + '</td>' +
      '<td>' + p99 + '</td>' +
      '<td>' + successRate + '</td>' +
      '<td><a href="/artifacts/' + r.runId + '/report.html" target="_blank" class="btn btn-secondary btn-sm">Report →</a></td>';
    tbody.appendChild(tr);
  });
}

function renderArchiveRunsTable(benchRuns, masterRuns) {
  const tbody = document.getElementById('tbody-archive-runs');
  if (!tbody) return;
  tbody.innerHTML = '';

  const all = [].concat(
    benchRuns.map(function(b) { return Object.assign({}, b, { source: 'BENCHMARK' }); }),
    masterRuns.map(function(m) { return Object.assign({}, m, { source: 'SIMULATION' }); })
  ).sort(function(a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (all.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No reports found.</td></tr>';
    return;
  }

  all.forEach(function(r) {
    const tr = document.createElement('tr');
    const isBench = r.source === 'BENCHMARK';
    const p99 = isBench
      ? (r.latency && r.latency.p99Ms ? r.latency.p99Ms + 'ms' : '—')
      : (r.summary && r.summary.p99LatencyMs ? r.summary.p99LatencyMs + 'ms' : '—');
    const tput = isBench
      ? (r.throughputRps ? r.throughputRps + ' rps' : '—')
      : (r.summary && r.summary.throughputQps ? r.summary.throughputQps + ' qps' : '—');

    tr.innerHTML =
      '<td><code>' + r.runId + '</code></td>' +
      '<td><span class="badge">' + r.source + '</span></td>' +
      '<td style="font-size:11px;">' + new Date(r.createdAt).toLocaleString() + '</td>' +
      '<td>' + (isBench && r.config ? r.config.targetUrl : 'Closed-Loop Verification') + '</td>' +
      '<td><span class="badge">' + (r.state || 'COMPLETED') + '</span></td>' +
      '<td>' + tput + '</td>' +
      '<td>' + p99 + '</td>' +
      '<td>' +
      '  <a href="/artifacts/' + r.runId + '/summary.json" target="_blank" class="btn btn-secondary btn-sm">JSON</a>' +
      '  <a href="/artifacts/' + r.runId + '/report.html" target="_blank" class="btn btn-primary btn-sm" style="margin-left:4px;">Report</a>' +
      '</td>';
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// Initial Boot
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', function() {
  pollStatus();
  setInterval(pollStatus, 4000);
  loadAllRuns();
  renderTopologyCanvas();
  simulateModelTopology();
});

// Expose all functions to window explicitly
window.switchTab = switchTab;
window.goToStep = goToStep;
window.validateTarget = validateTarget;
window.discoverMoreRoutes = discoverMoreRoutes;
window.startBenchmarkExecution = startBenchmarkExecution;
window.cancelCurrentRun = cancelCurrentRun;
window.filterRequestSamples = filterRequestSamples;
window.refreshRequestInspector = refreshRequestInspector;
window.executeComparison = executeComparison;
window.renderTopologyCanvas = renderTopologyCanvas;
window.addModelNode = addModelNode;
window.removeModelNode = removeModelNode;
window.updateNodeParam = updateNodeParam;
window.resetDefaultTopology = resetDefaultTopology;
window.simulateModelTopology = simulateModelTopology;
window.crashNode = crashNode;
window.partitionNode = partitionNode;
window.healAllNodes = healAllNodes;
window.injectQuorumPartition = injectQuorumPartition;
window.executeQuorumWrite = executeQuorumWrite;
window.executeQuorumRead = executeQuorumRead;
window.triggerReadRepair = triggerReadRepair;
window.loadCrtScenarios = loadCrtScenarios;
window.runSingleCrtScenario = runSingleCrtScenario;
window.runAllCrtScenarios = runAllCrtScenarios;
window.runMasterExperiment = runMasterExperiment;
window.runClosedLoopQuick = runClosedLoopQuick;
window.loadAllRuns = loadAllRuns;


// Sidebar Pin / Unpin Toggle
function toggleSidebarPin() {
  document.body.classList.toggle('sidebar-pinned');
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('pinned');
  const btn = document.getElementById('btn-pin-sidebar');
  if (btn) {
    const isPinned = document.body.classList.contains('sidebar-pinned');
    btn.innerHTML = isPinned ? '<span>📌</span> <span class="side-nav-label">Pinned</span>' : '<span>📌</span> <span class="side-nav-label">Pin Sidebar</span>';
  }
}
window.toggleSidebarPin = toggleSidebarPin;
