/**
 * SYSTEM-X TESTING CONTROL CENTER & UNIFIED DASHBOARD
 *
 * Implements a strict monochrome design system (white background, deep black text,
 * neutral gray borders, monospaced metrics, monochrome status indicators).
 *
 * Sections:
 *  1. Overview & Ecosystem Status
 *  2. Website Performance Benchmark (Validation -> Config -> Live SSE -> Request Inspector)
 *  3. Side-by-Side Run Comparison & Regression Analysis
 *  4. System Model Topology & Architecture Editor
 *  5. Quorum Lab Distributed Cluster Explorer & Chaos Fault Injector
 *  6. Commerce Reliability Testbed (CRT-01 to CRT-08) Interactive Suite
 *  7. Closed-Loop Simulation & Calibration Master Runner
 *  8. Persistent Reports & Artifact Archive
 */

export function renderWebDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SYSTEM-X &mdash; Testing Control Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #ffffff;
      --bg-subtle: #fafafa;
      --bg-card: #ffffff;
      --bg-hover: #f4f4f5;
      --border: #e4e4e7;
      --border-dark: #18181b;
      --border-light: #f4f4f5;
      --text: #09090b;
      --text-muted: #71717a;
      --text-dim: #a1a1aa;
      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --radius-sm: 4px;
      --radius-md: 6px;
      --radius-lg: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* Strict Monochrome Global Rules: No colored badges or gradients */
    a { color: var(--text); text-decoration: underline; text-underline-offset: 3px; }
    a:hover { color: var(--text-muted); }
    code, pre, .mono { font-family: var(--font-mono); font-feature-settings: "tnum"; }

    /* Left Collapsible Hover Sidebar */
    .sidebar {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      width: 64px;
      background: var(--bg);
      border-right: 1px solid var(--border);
      z-index: 200;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: width 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease;
      overflow-x: hidden;
      overflow-y: auto;
      white-space: nowrap;
    }
    .sidebar:hover, .sidebar.pinned {
      width: 250px;
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
    }

    .sidebar-header {
      height: 60px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 14px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      flex-shrink: 0;
    }
    .sidebar-logo {
      width: 32px;
      height: 32px;
      background: var(--text);
      color: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      flex-shrink: 0;
    }
    .sidebar-brand-text {
      opacity: 0;
      transform: translateX(-8px);
      transition: opacity 0.18s ease, transform 0.18s ease;
      pointer-events: none;
    }
    .sidebar:hover .sidebar-brand-text, .sidebar.pinned .sidebar-brand-text {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }
    .sidebar-brand-title {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .sidebar-brand-sub {
      font-size: 10px;
      color: var(--text-muted);
      font-family: var(--font-mono);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .sidebar-nav {
      padding: 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex-grow: 1;
    }

    .side-nav-item {
      width: 100%;
      height: 44px;
      border-radius: var(--radius-sm);
      background: none;
      border: 1px solid transparent;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 14px;
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 500;
      text-align: left;
      transition: all 0.12s ease;
      position: relative;
    }
    .side-nav-item:hover {
      background: var(--bg-hover);
      color: var(--text);
    }
    .side-nav-item.active {
      background: var(--bg-subtle);
      border-color: var(--border);
      color: var(--text);
      font-weight: 700;
    }
    .side-nav-item.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 8px;
      bottom: 8px;
      width: 3px;
      background: var(--text);
      border-radius: 0 2px 2px 0;
    }

    .side-nav-icon {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text);
    }

    .side-nav-label-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: calc(100% - 36px);
      opacity: 0;
      transform: translateX(-8px);
      transition: opacity 0.18s ease, transform 0.18s ease;
      pointer-events: none;
    }
    .sidebar:hover .side-nav-label-wrap, .sidebar.pinned .side-nav-label-wrap {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }
    .side-nav-label {
      font-size: 13px;
      white-space: nowrap;
    }
    .side-nav-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 1px 6px;
      border: 1px solid var(--border);
      border-radius: 10px;
    }

    .sidebar-footer {
      padding: 12px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .sidebar-pin-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      justify-content: center;
    }
    .sidebar-pin-btn:hover {
      background: var(--bg-hover);
      color: var(--text);
    }

    /* Top Sticky Status Bar */
    .top-bar {
      margin-left: 64px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
      position: sticky;
      top: 0;
      z-index: 100;
      transition: margin-left 0.22s ease;
    }
    .top-bar-inner {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 24px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    /* Status Bar in Header */
    .header-status {
      display: flex;
      align-items: center;
      gap: 14px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
    }
    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-symbol {
      font-weight: bold;
    }

    /* Main Container & Responsive Layout */
    .main-wrap {
      margin-left: 64px;
      max-width: 1400px;
      padding: 24px 32px;
      min-height: calc(100vh - 120px);
      transition: margin-left 0.22s ease;
    }

    .footer {
      margin-left: 64px;
      transition: margin-left 0.22s ease;
    }

    body.sidebar-pinned .top-bar,
    body.sidebar-pinned .main-wrap,
    body.sidebar-pinned .footer {
      margin-left: 250px;
    }

    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
      animation: fadeIn 0.15s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Page Header */
    .page-header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .page-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 4px;
    }
    .page-desc {
      color: var(--text-muted);
      font-size: 13px;
    }

    /* UI Primitives */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-sans);
      border-radius: var(--radius-sm);
      cursor: pointer;
      text-decoration: none;
      transition: all 0.12s ease;
      white-space: nowrap;
    }
    .btn-primary {
      background: var(--text);
      color: var(--bg);
      border: 1px solid var(--text);
    }
    .btn-primary:hover {
      background: #27272a;
      border-color: #27272a;
    }
    .btn-secondary {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: var(--bg-hover);
      border-color: #d4d4d8;
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }
    .btn-danger {
      background: #ffffff;
      color: #09090b;
      border: 1px solid #18181b;
    }
    .btn-danger:hover {
      background: #09090b;
      color: #ffffff;
    }

    .card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 20px;
      margin-bottom: 16px;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-light);
    }
    .card-title {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Grid Layouts */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    @media (max-width: 900px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    }

    /* Stat Box (Monochrome) */
    .stat-box {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px 16px;
      background: var(--bg);
    }
    .stat-label {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 22px;
      font-weight: 700;
      font-family: var(--font-mono);
      letter-spacing: -0.02em;
    }
    .stat-sub {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
      font-family: var(--font-mono);
    }

    /* Monochrome Status Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 600;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg);
      color: var(--text);
      text-transform: uppercase;
    }
    .badge-inverse {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
    }

    /* Forms & Inputs */
    .form-group {
      margin-bottom: 14px;
    }
    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text);
    }
    .form-hint {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .input-text, .input-select, .input-textarea {
      width: 100%;
      padding: 8px 12px;
      font-size: 13px;
      font-family: var(--font-mono);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
      outline: none;
      transition: border-color 0.12s ease;
    }
    .input-text:focus, .input-select:focus, .input-textarea:focus {
      border-color: var(--border-dark);
    }
    .checkbox-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      margin-top: 8px;
      cursor: pointer;
    }

    /* Data Tables */
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
    }
    table.data-table th {
      background: var(--bg-subtle);
      padding: 10px 14px;
      font-weight: 600;
      font-family: var(--font-mono);
      font-size: 11px;
      text-transform: uppercase;
      border-bottom: 1px solid var(--border);
      color: var(--text-muted);
      white-space: nowrap;
    }
    table.data-table td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-light);
      font-family: var(--font-mono);
      white-space: nowrap;
    }
    table.data-table tr:last-child td {
      border-bottom: none;
    }
    table.data-table tr:hover td {
      background: var(--bg-hover);
    }

    /* Progress Bar */
    .progress-bar-wrap {
      width: 100%;
      height: 8px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: hidden;
      margin: 12px 0;
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--text);
      width: 0%;
      transition: width 0.2s linear;
    }

    /* Live Event Terminal Box */
    .terminal-box {
      background: #fafafa;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.6;
      max-height: 240px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Step Indicators (Screen 1 -> Screen 4) */
    .step-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .step-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
    }
    .step-item.active {
      color: var(--text);
      font-weight: 700;
    }
    .step-num {
      width: 20px;
      height: 20px;
      border: 1px solid var(--border);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-mono);
      font-size: 10px;
    }
    .step-item.active .step-num {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
    }
    .step-sep {
      color: var(--border);
      font-size: 12px;
    }

    /* System Model Node Editor Canvas */
    .model-canvas {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      min-height: 380px;
      background: #fafafa;
      position: relative;
      padding: 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }
    .node-box {
      border: 1px solid var(--border-dark);
      background: #ffffff;
      padding: 14px 18px;
      border-radius: var(--radius-sm);
      width: 200px;
      box-shadow: 2px 2px 0px rgba(0,0,0,0.06);
    }
    .node-title {
      font-weight: 700;
      font-size: 12px;
      font-family: var(--font-mono);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .node-attr {
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
      line-height: 1.5;
    }
    .connector-line {
      font-family: var(--font-mono);
      font-size: 18px;
      color: var(--text-muted);
    }

    /* Footer */
    .footer {
      border-top: 1px solid var(--border);
      padding: 24px;
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
      max-width: 1360px;
      margin: 0 auto;
    }
  </style>
</head>
<body>

    <!-- Left Collapsible Hover Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header" onclick="switchTab('overview', event)" title="SYSTEM-X Testing Control Center">
      <div class="sidebar-logo">SX</div>
      <div class="sidebar-brand-text">
        <div class="sidebar-brand-title">SYSTEM-X</div>
        <div class="sidebar-brand-sub">Control Center</div>
      </div>
    </div>

    <nav class="sidebar-nav">
      <button class="side-nav-item tab-btn active" type="button" onclick="switchTab('overview', event)" id="tabnav-overview" title="Overview">
        <span class="side-nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </span>
        <div class="side-nav-label-wrap">
          <span class="side-nav-label">Overview</span>
        </div>
      </button>

      <button class="side-nav-item tab-btn" type="button" onclick="switchTab('website', event)" id="tabnav-website" title="Website Performance Benchmark">
        <span class="side-nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/><path d="m13 11 3-3"/></svg>
        </span>
        <div class="side-nav-label-wrap">
          <span class="side-nav-label">Website Performance</span>
        </div>
      </button>

      <button class="side-nav-item tab-btn" type="button" onclick="switchTab('compare', event)" id="tabnav-compare" title="Compare Executions">
        <span class="side-nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>
        </span>
        <div class="side-nav-label-wrap">
          <span class="side-nav-label">Compare Runs</span>
        </div>
      </button>

      <button class="side-nav-item tab-btn" type="button" onclick="switchTab('model', event)" id="tabnav-model" title="System Architecture Modeling">
        <span class="side-nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v4"/><path d="M6 17v-3a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3"/></svg>
        </span>
        <div class="side-nav-label-wrap">
          <span class="side-nav-label">System Models</span>
        </div>
      </button>

      <button class="side-nav-item tab-btn" type="button" onclick="switchTab('quorum', event)" id="tabnav-quorum" title="Quorum Lab Cluster Explorer">
        <span class="side-nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
        </span>
        <div class="side-nav-label-wrap">
          <span class="side-nav-label">Quorum Lab</span>
        </div>
      </button>

      <button class="side-nav-item tab-btn" type="button" onclick="switchTab('crt', event)" id="tabnav-crt" title="Commerce Reliability Scenarios">
        <span class="side-nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </span>
        <div class="side-nav-label-wrap">
          <span class="side-nav-label">Commerce Reliability</span>
        </div>
      </button>

      <button class="side-nav-item tab-btn" type="button" onclick="switchTab('simulation', event)" id="tabnav-simulation" title="Closed-Loop Verification">
        <span class="side-nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </span>
        <div class="side-nav-label-wrap">
          <span class="side-nav-label">Closed-Loop Verification</span>
        </div>
      </button>

      <button class="side-nav-item tab-btn" type="button" onclick="switchTab('reports', event)" id="tabnav-reports" title="Persistent Reports Archive">
        <span class="side-nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
        </span>
        <div class="side-nav-label-wrap">
          <span class="side-nav-label">Reports Archive</span>
          <span class="side-nav-badge" id="nav-runs-count">0</span>
        </div>
      </button>
    </nav>

    <div class="sidebar-footer">
      <button class="sidebar-pin-btn" id="btn-pin-sidebar" type="button" onclick="toggleSidebarPin()" title="Pin or unpin sidebar">
        <span>📌</span> <span class="side-nav-label">Pin Sidebar</span>
      </button>
    </div>
  </aside>

  <!-- Clean Top Bar with Breadcrumb & Health Status -->
  <header class="top-bar">
    <div class="top-bar-inner">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); text-transform:uppercase;">Section /</span>
        <span id="topbar-breadcrumb" style="font-size:14px; font-weight:700;">Overview</span>
      </div>

      <div class="header-status">
        <div class="status-item" title="SYSTEM-X Gate Daemon Port 8080">
          <span class="status-symbol">&bull;</span> SX: <span id="hdr-sx-status">ONLINE</span>
        </div>
        <div class="status-item" title="Blackbox-X HTTP Benchmarking Service">
          <span class="status-symbol">&bull;</span> BBX: <span id="hdr-bbx-status">ONLINE</span>
        </div>
        <div class="status-item" title="Quorum Lab Node Cluster Engine">
          <span class="status-symbol">&bull;</span> QRM: <span id="hdr-qrm-status">ONLINE</span>
        </div>
        <div class="status-item" title="Commerce Reliability Testbed Port 4200">
          <span class="status-symbol">&bull;</span> CRT: <span id="hdr-crt-status">ONLINE</span>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Viewports -->
  <main class="main-wrap">

    <!-- ===================================================================
         TAB 1: OVERVIEW & ECOSYSTEM STATUS
         =================================================================== -->
    <section id="view-overview" class="tab-content active">
      <div class="page-header">
        <div>
          <h1 class="page-title">Testing Control Center</h1>
          <p class="page-desc">Test your website. Model your architecture. Verify distributed quorum. Compare results.</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" onclick="switchTab('website')">+ New Website Benchmark</button>
          <button class="btn btn-secondary" onclick="runClosedLoopQuick()">Run Master Verification</button>
        </div>
      </div>

      <!-- Ecosystem Architecture Card -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Integrated Product Architecture</div>
          <span class="badge">Verified Active</span>
        </div>
        <div class="grid-3">
          <div class="stat-box">
            <div class="stat-label">Application 1</div>
            <div class="stat-value" style="font-size:16px;">BLACKBOX-X</div>
            <p style="font-size:12px; margin-top:8px; color:var(--text-muted);">
              HTTP benchmarking, system modeling, capacity search, bottleneck attribution, and real HTTP execution.
            </p>
            <div style="margin-top:12px;">
              <button class="btn btn-secondary btn-sm" onclick="switchTab('website')">Open Benchmark Engine &rarr;</button>
            </div>
          </div>

          <div class="stat-box">
            <div class="stat-label">Application 2</div>
            <div class="stat-value" style="font-size:16px;">QUORUM LAB</div>
            <p style="font-size:12px; margin-top:8px; color:var(--text-muted);">
              Distributed storage consistency, quorum replication (W/R), write-ahead logs, and chaos fault injection.
            </p>
            <div style="margin-top:12px;">
              <button class="btn btn-secondary btn-sm" onclick="switchTab('quorum')">Open Quorum Explorer &rarr;</button>
            </div>
          </div>

          <div class="stat-box">
            <div class="stat-label">Application 3</div>
            <div class="stat-value" style="font-size:16px;">SYSTEM-X</div>
            <p style="font-size:12px; margin-top:8px; color:var(--text-muted);">
              Cross-system experiment coordinator, closed-loop model calibration, divergence validation, and unified reports.
            </p>
            <div style="margin-top:12px;">
              <button class="btn btn-secondary btn-sm" onclick="switchTab('simulation')">Open Master Gate &rarr;</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Action Cards -->
      <div class="grid-4" style="margin-bottom:16px;">
        <div class="card" style="cursor:pointer;" onclick="switchTab('website')">
          <div class="stat-label">Quick Workflow 01</div>
          <div style="font-weight:700; font-size:14px; margin-top:4px;">Website URL Test</div>
          <p style="font-size:12px; color:var(--text-muted); margin-top:6px;">
            Enter any website URL, validate target, select load profile, and run real HTTP requests with live quantile streaming.
          </p>
        </div>

        <div class="card" style="cursor:pointer;" onclick="switchTab('compare')">
          <div class="stat-label">Quick Workflow 02</div>
          <div style="font-weight:700; font-size:14px; margin-top:4px;">Compare Runs</div>
          <p style="font-size:12px; color:var(--text-muted); margin-top:6px;">
            Select two benchmark executions side-by-side to evaluate P99 latency regressions and throughput variations.
          </p>
        </div>

        <div class="card" style="cursor:pointer;" onclick="switchTab('crt')">
          <div class="stat-label">Quick Workflow 03</div>
          <div style="font-weight:700; font-size:14px; margin-top:4px;">Commerce Reliability</div>
          <p style="font-size:12px; color:var(--text-muted); margin-top:6px;">
            Execute deterministic e-commerce scenarios (CRT-01 to CRT-08) testing flash sales, double-charging, and node crashes.
          </p>
        </div>

        <div class="card" style="cursor:pointer;" onclick="switchTab('model')">
          <div class="stat-label">Quick Workflow 04</div>
          <div style="font-weight:700; font-size:14px; margin-top:4px;">System Model Editor</div>
          <p style="font-size:12px; color:var(--text-muted); margin-top:6px;">
            Graphically assemble backend topologies with services, databases, queues, thread pools, and network latency.
          </p>
        </div>
      </div>

      <!-- Recent Executions Table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Recent Test Executions</div>
          <button class="btn btn-secondary btn-sm" onclick="loadAllRuns()">Refresh</button>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-recent-runs">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Type</th>
                <th>Target / Profile</th>
                <th>State</th>
                <th>Throughput</th>
                <th>P99 Latency</th>
                <th>Success</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="tbody-recent-runs">
              <tr>
                <td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">
                  Loading execution runs...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ===================================================================
         TAB 2: WEBSITE PERFORMANCE BENCHMARK (Screen 1 to 4)
         =================================================================== -->
    <section id="view-website" class="tab-content">
      <div class="page-header">
        <div>
          <h1 class="page-title">Website Performance Benchmark</h1>
          <p class="page-desc">Enter any website URL, validate target reachability, execute real HTTP benchmarks, and drill into individual requests.</p>
        </div>
      </div>

      <!-- Multi-step Indicator -->
      <div class="step-indicator">
        <div class="step-item active" id="step-hdr-1">
          <div class="step-num">1</div> Target Selection &amp; Pre-Flight
        </div>
        <div class="step-sep">&rarr;</div>
        <div class="step-item" id="step-hdr-2">
          <div class="step-num">2</div> Guided Configuration
        </div>
        <div class="step-sep">&rarr;</div>
        <div class="step-item" id="step-hdr-3">
          <div class="step-num">3</div> Live Execution
        </div>
        <div class="step-sep">&rarr;</div>
        <div class="step-item" id="step-hdr-4">
          <div class="step-num">4</div> Results &amp; Request Inspector
        </div>
      </div>

      <!-- SCREEN 1: Target Input & SSRF Preflight -->
      <div id="bench-screen-1">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Step 1: Enter Target Website URL</div>
            <span class="badge">SSRF Protected</span>
          </div>

          <div class="form-group">
            <label class="form-label">Target Website or API URL</label>
            <div style="display:flex; gap:8px;">
              <input type="text" id="target-url-input" class="input-text" placeholder="https://httpbin.org/get or http://localhost:4200/api/products" value="http://localhost:4200/api/products" />
              <button class="btn btn-primary" onclick="validateTarget()">Validate Target &rarr;</button>
            </div>
            <div class="form-hint">
              Target will undergo DNS resolution, IP range safety checks, and a bounded 4000ms pre-flight probe.
            </div>
          </div>

          <div style="margin-top:12px; padding:12px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-subtle);">
            <label class="checkbox-wrap">
              <input type="checkbox" id="chk-allow-localhost" checked />
              <span>Allow Localhost &amp; RFC1918 Private Addresses (e.g. 127.0.0.1, Port 4200 CRT Testbed)</span>
            </label>
            <label class="checkbox-wrap" style="margin-top:6px;">
              <input type="checkbox" id="chk-authorized-confirm" checked />
              <span>[Confirmed] I verify that I own or have explicit authorization to benchmark this target endpoint.</span>
            </label>
          </div>

          <!-- Pre-flight Probe Card (Hidden until validated) -->
          <div id="target-probe-results" style="display:none; margin-top:16px; padding:16px; border:1px solid var(--border); border-radius:var(--radius-sm);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <div style="font-weight:700; font-size:13px;" id="probe-status-title">Target Pre-Flight Status</div>
              <span class="badge badge-inverse" id="probe-badge">&mdash;</span>
            </div>

            <div class="grid-3" style="margin-bottom:12px;">
              <div class="stat-box">
                <div class="stat-label">Resolved IP</div>
                <div class="stat-value" style="font-size:15px;" id="probe-ip">&mdash;</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Probe Status</div>
                <div class="stat-value" style="font-size:15px;" id="probe-code">&mdash;</div>
              </div>
              <div class="stat-box">
                <div class="stat-label">Response Latency</div>
                <div class="stat-value" style="font-size:15px;" id="probe-latency">&mdash;</div>
              </div>
            </div>

            <div style="font-size:12px; margin-bottom:12px; font-family:var(--font-mono); color:var(--text-muted);" id="probe-msg"></div>

            <!-- Route Discovery -->
            <div style="border-top:1px solid var(--border); padding-top:12px; display:flex; align-items:center; justify-content:space-between;">
              <div style="font-size:12px;">
                <strong>Discovered Routes:</strong> <span id="probe-routes-count">0 found</span>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary btn-sm" onclick="discoverMoreRoutes()">Discover Routes via Sitemap</button>
                <button class="btn btn-primary btn-sm" onclick="goToStep(2)">Proceed to Configuration &rarr;</button>
              </div>
            </div>
            <div id="probe-routes-list" style="margin-top:8px; font-family:var(--font-mono); font-size:11px; color:var(--text-muted);"></div>
          </div>
        </div>
      </div>

      <!-- SCREEN 2: Guided Benchmark Configuration -->
      <div id="bench-screen-2" style="display:none;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Step 2: Guided Benchmark Configuration</div>
            <button class="btn btn-secondary btn-sm" onclick="goToStep(1)">&larr; Back to Target</button>
          </div>

          <div class="grid-2">
            <div>
              <div class="form-group">
                <label class="form-label">Test Name</label>
                <input type="text" id="cfg-test-name" class="input-text" value="Website Benchmark Execution" />
              </div>

              <div class="form-group">
                <label class="form-label">HTTP Method</label>
                <select id="cfg-method" class="input-select">
                  <option value="GET">GET (Standard Read Load)</option>
                  <option value="POST">POST (Write / Mutation Load)</option>
                  <option value="PUT">PUT (Update Resource)</option>
                  <option value="DELETE">DELETE (Delete Resource)</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Benchmark Route(s)</label>
                <input type="text" id="cfg-routes" class="input-text" value="/api/products" />
                <div class="form-hint">Comma-separated routes to distribute traffic across.</div>
              </div>
            </div>

            <div>
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label">Total Requests</label>
                  <input type="number" id="cfg-requests" class="input-text" value="200" min="10" max="5000" />
                  <div class="form-hint">Safe limit: max 5,000 reqs.</div>
                </div>

                <div class="form-group">
                  <label class="form-label">Concurrency Level</label>
                  <input type="number" id="cfg-concurrency" class="input-text" value="10" min="1" max="50" />
                  <div class="form-hint">Parallel worker loops (max 50).</div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Request Timeout (ms)</label>
                <input type="number" id="cfg-timeout" class="input-text" value="5000" min="500" max="60000" />
              </div>

              <div class="form-group">
                <label class="form-label">Optional Request Body (JSON or raw)</label>
                <textarea id="cfg-body" class="input-textarea" rows="2" placeholder='{"key": "value"}'></textarea>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid var(--border); padding-top:16px; margin-top:8px; display:flex; justify-content:flex-end;">
            <button class="btn btn-primary" onclick="startBenchmarkExecution()">
              Start Benchmark Execution &rarr;
            </button>
          </div>
        </div>
      </div>

      <!-- SCREEN 3: Live Execution Screen (SSE Streaming) -->
      <div id="bench-screen-3" style="display:none;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <span id="live-run-state-icon">&bull;</span>
              <span>Executing Benchmark:</span>
              <span class="mono" id="live-run-id">&mdash;</span>
            </div>
            <div style="display:flex; gap:8px;">
              <span class="badge" id="live-run-state">&mdash;</span>
              <button class="btn btn-danger btn-sm" onclick="cancelCurrentRun()">Cancel Execution</button>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" id="live-progress-fill"></div>
          </div>

          <div style="display:flex; justify-content:space-between; font-size:11px; font-family:var(--font-mono); color:var(--text-muted); margin-bottom:16px;">
            <span>Dispatched: <strong id="live-sent-count">0</strong></span>
            <span>Completed: <strong id="live-completed-count">0</strong> / <span id="live-total-count">0</span> (<span id="live-pct">0%</span>)</span>
            <span>Elapsed: <strong id="live-elapsed">0.0s</strong></span>
          </div>

          <!-- Live Metrics Grid -->
          <div class="grid-4" style="margin-bottom:16px;">
            <div class="stat-box">
              <div class="stat-label">Throughput</div>
              <div class="stat-value" id="live-throughput">0.0</div>
              <div class="stat-sub">req / sec</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">P50 Latency</div>
              <div class="stat-value" id="live-p50">&mdash;</div>
              <div class="stat-sub">milliseconds</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">P99 Latency</div>
              <div class="stat-value" id="live-p99">&mdash;</div>
              <div class="stat-sub">milliseconds</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Failures / Errors</div>
              <div class="stat-value" id="live-failures">0</div>
              <div class="stat-sub" id="live-success-rate">100% success</div>
            </div>
          </div>

          <!-- Real-time Event Log -->
          <div style="margin-bottom:8px; font-size:12px; font-weight:600;">Real-Time Execution Event Log (SSE Stream)</div>
          <div class="terminal-box" id="live-event-terminal">Connecting to SSE telemetry stream...</div>
        </div>
      </div>

      <!-- SCREEN 4: Results & Request Inspector -->
      <div id="bench-screen-4" style="display:none;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <span>Benchmark Results:</span>
              <span class="mono" id="res-run-id">&mdash;</span>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary btn-sm" onclick="goToStep(1)">Run Another Test</button>
              <a id="lnk-download-json" href="#" target="_blank" class="btn btn-secondary btn-sm">summary.json</a>
              <a id="lnk-view-html" href="#" target="_blank" class="btn btn-primary btn-sm">Standalone Report &rarr;</a>
            </div>
          </div>

          <!-- Quantile Stats Table -->
          <div class="grid-4" style="margin-bottom:16px;">
            <div class="stat-box">
              <div class="stat-label">Total Throughput</div>
              <div class="stat-value" id="res-throughput">0.0</div>
              <div class="stat-sub">requests / second</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Mean Latency</div>
              <div class="stat-value" id="res-mean">0.00</div>
              <div class="stat-sub">milliseconds</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">P95 / P99 Latency</div>
              <div class="stat-value" id="res-p99">0.00</div>
              <div class="stat-sub" id="res-p95">P95: 0.00ms</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Success Rate</div>
              <div class="stat-value" id="res-success-rate">100%</div>
              <div class="stat-sub" id="res-counts">0 / 0 requests</div>
            </div>
          </div>

          <!-- Latency Distribution Detail -->
          <div class="card" style="margin-bottom:16px; padding:14px;">
            <div style="font-weight:700; font-size:12px; margin-bottom:8px; text-transform:uppercase; font-family:var(--font-mono); color:var(--text-muted);">
              Latency Quantile Distribution
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Min</th>
                    <th>P50 (Median)</th>
                    <th>P90</th>
                    <th>P95</th>
                    <th>P99</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td id="dist-min">&mdash;</td>
                    <td id="dist-p50">&mdash;</td>
                    <td id="dist-p90">&mdash;</td>
                    <td id="dist-p95">&mdash;</td>
                    <td id="dist-p99">&mdash;</td>
                    <td id="dist-max">&mdash;</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Route Breakdown -->
          <div class="card" style="margin-bottom:16px; padding:14px;">
            <div style="font-weight:700; font-size:12px; margin-bottom:8px; text-transform:uppercase; font-family:var(--font-mono); color:var(--text-muted);">
              Route Performance Breakdown
            </div>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Total Requests</th>
                    <th>Success Count</th>
                    <th>Mean Latency</th>
                    <th>P99 Latency</th>
                  </tr>
                </thead>
                <tbody id="tbody-route-breakdown">
                  <tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No routes recorded</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Request Inspector -->
          <div class="card" style="padding:14px;">
            <div class="card-header" style="margin-bottom:12px;">
              <div class="card-title">Request Inspector (Sampled Live Requests)</div>
              <div style="display:flex; gap:8px;">
                <select id="inspector-filter" class="input-select" style="width:140px; padding:4px 8px; font-size:11px;" onchange="filterRequestSamples()">
                  <option value="ALL">All Requests</option>
                  <option value="SUCCESS">Success Only (2xx)</option>
                  <option value="FAILURE">Failures Only (4xx/5xx/timeout)</option>
                </select>
                <button class="btn btn-secondary btn-sm" onclick="refreshRequestInspector()">Refresh</button>
              </div>
            </div>

            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Method</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Result</th>
                    <th>Error Detail</th>
                  </tr>
                </thead>
                <tbody id="tbody-request-samples">
                  <tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:16px;">Loading request samples...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================================================================
         TAB 3: COMPARE RUNS (Side-by-side Regression Analysis)
         =================================================================== -->
    <section id="view-compare" class="tab-content">
      <div class="page-header">
        <div>
          <h1 class="page-title">Side-by-Side Run Comparison</h1>
          <p class="page-desc">Select two benchmark executions to compare throughput, P99 latency regressions, and quantile variations against SLA limits.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Select Comparison Runs</div>
          <span class="badge">Regression Analyzer</span>
        </div>

        <div class="grid-3">
          <div class="form-group">
            <label class="form-label">Baseline Execution (Run A)</label>
            <select id="cmp-baseline-select" class="input-select"></select>
          </div>

          <div class="form-group">
            <label class="form-label">Comparison Execution (Run B)</label>
            <select id="cmp-target-select" class="input-select"></select>
          </div>

          <div class="form-group">
            <label class="form-label">Regression Threshold (%)</label>
            <div style="display:flex; gap:8px;">
              <input type="number" id="cmp-threshold" class="input-text" value="15" min="1" max="100" />
              <button class="btn btn-primary" onclick="executeComparison()">Compare Runs &rarr;</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Comparison Verdict Banner -->
      <div id="cmp-verdict-box" style="display:none; margin-bottom:16px; padding:16px; border:1px solid var(--border-dark); border-radius:var(--radius-sm); background:var(--bg);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <div style="font-size:16px; font-weight:700;" id="cmp-verdict-title">&mdash;</div>
          <span class="badge badge-inverse" id="cmp-verdict-badge">&mdash;</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted);" id="cmp-verdict-summary">&mdash;</p>
      </div>

      <!-- Comparison Metrics Diff Table -->
      <div class="card" id="cmp-table-card" style="display:none;">
        <div class="card-header">
          <div class="card-title">Detailed Metric Deltas</div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Run A (Baseline)</th>
                <th>Run B (Comparison)</th>
                <th>Delta (%)</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody id="tbody-comparison-diff"></tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ===================================================================
         TAB 4: SYSTEM MODEL EDITOR
         =================================================================== -->
    <section id="view-model" class="tab-content">
      <div class="page-header">
        <div>
          <h1 class="page-title">System Model Topology &amp; Architecture Editor</h1>
          <p class="page-desc">Define services, databases, queues, and concurrency limits to validate performance before deployment.</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="addModelNode('SERVICE')">+ Add Service</button>
          <button class="btn btn-secondary" onclick="addModelNode('DATABASE')">+ Add Database</button>
          <button class="btn btn-secondary" onclick="addModelNode('CACHE')">+ Add Cache</button>
          <button class="btn btn-primary" onclick="simulateModelTopology()">Simulate Model &rarr;</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Interactive Topology Canvas</div>
          <span class="badge">Analytical Solver</span>
        </div>

        <div class="model-canvas" id="model-canvas">
          <div class="node-box" id="node-edge-gw">
            <div class="node-title">
              <span>API Gateway</span>
              <span class="badge">ENTRY</span>
            </div>
            <div class="node-attr">Concurrency: 500</div>
            <div class="node-attr">Timeout: 3000ms</div>
            <div class="node-attr">Route: /api/*</div>
          </div>

          <div class="connector-line">&rarr;</div>

          <div class="node-box" id="node-order-svc">
            <div class="node-title">
              <span>Order Service</span>
              <span class="badge">SERVICE</span>
            </div>
            <div class="node-attr">Threads: 16</div>
            <div class="node-attr">Processing: 12ms</div>
            <div class="node-attr">Max QPS: 1200</div>
          </div>

          <div class="connector-line">&rarr;</div>

          <div class="node-box" id="node-quorum-db">
            <div class="node-title">
              <span>Quorum Cluster</span>
              <span class="badge">STORAGE</span>
            </div>
            <div class="node-attr">Nodes: 3 (W=2, R=2)</div>
            <div class="node-attr">Storage: WAL Disk</div>
            <div class="node-attr">Fsync Latency: 4ms</div>
          </div>
        </div>

        <div style="margin-top:16px; padding:12px; border:1px solid var(--border); border-radius:var(--radius-sm); font-size:12px; background:var(--bg-subtle);">
          <strong>Attributed Bottleneck Analysis:</strong>
          <span style="color:var(--text-muted); margin-left:6px;" id="model-bottleneck-text">
            Simulated max capacity is 1,200 QPS bounded by Order Service thread-pool saturation (16 threads @ 12ms service time).
          </span>
        </div>
      </div>
    </section>

    <!-- ===================================================================
         TAB 5: QUORUM LAB EXPLORER & FAULT INJECTOR
         =================================================================== -->
    <section id="view-quorum" class="tab-content">
      <div class="page-header">
        <div>
          <h1 class="page-title">Quorum Lab Distributed Cluster Explorer</h1>
          <p class="page-desc">Inspect Raft/Quorum node states, injected network partitions, and write consistency across replicas.</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="healAllNodes()">Heal All Partitions</button>
          <button class="btn btn-primary" onclick="injectQuorumPartition()">Inject Network Partition &rarr;</button>
        </div>
      </div>

      <!-- Live Node Cluster Grid -->
      <div class="grid-3" style="margin-bottom:16px;">
        <div class="card" id="card-node-1">
          <div class="card-header">
            <div class="card-title">Node 1 (127.0.0.1:5001)</div>
            <span class="badge badge-inverse" id="badge-node-1">LEADER</span>
          </div>
          <div class="stat-box" style="margin-bottom:8px;">
            <div class="stat-label">Term / Commit Index</div>
            <div class="stat-value" style="font-size:16px;">Term 3 &middot; Index 1,042</div>
          </div>
          <div style="font-size:11px; font-family:var(--font-mono); color:var(--text-muted); line-height:1.6;">
            <div>State: Active Sync</div>
            <div>Storage: Local WAL Disk</div>
            <div>Heartbeat: 4ms (Healthy)</div>
          </div>
          <div style="margin-top:12px; display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="crashNode(1)">Crash Node 1</button>
            <button class="btn btn-secondary btn-sm" onclick="partitionNode(1)">Partition</button>
          </div>
        </div>

        <div class="card" id="card-node-2">
          <div class="card-header">
            <div class="card-title">Node 2 (127.0.0.1:5002)</div>
            <span class="badge" id="badge-node-2">FOLLOWER</span>
          </div>
          <div class="stat-box" style="margin-bottom:8px;">
            <div class="stat-label">Term / Commit Index</div>
            <div class="stat-value" style="font-size:16px;">Term 3 &middot; Index 1,042</div>
          </div>
          <div style="font-size:11px; font-family:var(--font-mono); color:var(--text-muted); line-height:1.6;">
            <div>State: Active Sync</div>
            <div>Storage: Local WAL Disk</div>
            <div>Heartbeat: 6ms (Healthy)</div>
          </div>
          <div style="margin-top:12px; display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="crashNode(2)">Crash Node 2</button>
            <button class="btn btn-secondary btn-sm" onclick="partitionNode(2)">Partition</button>
          </div>
        </div>

        <div class="card" id="card-node-3">
          <div class="card-header">
            <div class="card-title">Node 3 (127.0.0.1:5003)</div>
            <span class="badge" id="badge-node-3">FOLLOWER</span>
          </div>
          <div class="stat-box" style="margin-bottom:8px;">
            <div class="stat-label">Term / Commit Index</div>
            <div class="stat-value" style="font-size:16px;">Term 3 &middot; Index 1,042</div>
          </div>
          <div style="font-size:11px; font-family:var(--font-mono); color:var(--text-muted); line-height:1.6;">
            <div>State: Active Sync</div>
            <div>Storage: Local WAL Disk</div>
            <div>Heartbeat: 5ms (Healthy)</div>
          </div>
          <div style="margin-top:12px; display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="crashNode(3)">Crash Node 3</button>
            <button class="btn btn-secondary btn-sm" onclick="partitionNode(3)">Partition</button>
          </div>
        </div>
      </div>

      <!-- Quorum Consensus Explorer -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Quorum Consensus &amp; Read-Repair Simulator</div>
          <span class="badge">W=2, R=2</span>
        </div>
        <div class="grid-2">
          <div>
            <div class="form-group">
              <label class="form-label">Cluster Write Key / Value (W=2)</label>
              <div style="display:flex; gap:8px;">
                <input type="text" id="quorum-key" class="input-text" value="inventory:sku-001:stock" />
                <input type="text" id="quorum-val" class="input-text" value="95" style="width:100px;" />
                <button class="btn btn-primary btn-sm" onclick="executeQuorumWrite()">Quorum Write</button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Cluster Read with Read Repair (R=2)</label>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary btn-sm" onclick="executeQuorumRead()">Quorum Read</button>
                <button class="btn btn-secondary btn-sm" onclick="triggerReadRepair()">Trigger Read Repair</button>
              </div>
            </div>
          </div>
          <div class="terminal-box" id="quorum-terminal">
            [Quorum Engine] Ready. Cluster topology healthy: 3 nodes online. Quorum majority = 2.
          </div>
        </div>
      </div>
    </section>

    <!-- ===================================================================
         TAB 6: COMMERCE RELIABILITY TESTBED (CRT-01 to CRT-08)
         =================================================================== -->
    <section id="view-crt" class="tab-content">
      <div class="page-header">
        <div>
          <h1 class="page-title">Commerce Reliability Testbed (CRT)</h1>
          <p class="page-desc">Deterministic test suite (CRT-01 to CRT-08) verifying distributed idempotency, inventory overselling guards, and crash recovery.</p>
        </div>
        <button class="btn btn-primary" onclick="runAllCrtScenarios()">Run All 8 CRT Scenarios &rarr;</button>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">CRT Scenario Suite</div>
          <button class="btn btn-secondary btn-sm" onclick="loadCrtScenarios()">Reload Scenarios</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Scenario Name</th>
                <th>Dimension</th>
                <th>Description</th>
                <th>Target Tolerance</th>
                <th>Last Result</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="tbody-crt-scenarios">
              <tr>
                <td colspan="7" style="text-align:center; padding:16px; color:var(--text-muted);">
                  Loading CRT scenarios from Port 4200...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- CRT Output Log -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">CRT Scenario Telemetry &amp; Assertion Output</div>
          <span class="badge" id="crt-status-badge">READY</span>
        </div>
        <div class="terminal-box" id="crt-terminal">
          Commerce Reliability Testbed ready on http://127.0.0.1:4200. Select a scenario above to execute.
        </div>
      </div>
    </section>

    <!-- ===================================================================
         TAB 7: CLOSED-LOOP SIMULATION & CALIBRATION
         =================================================================== -->
    <section id="view-simulation" class="tab-content">
      <div class="page-header">
        <div>
          <h1 class="page-title">Closed-Loop Verification &amp; Master Gate</h1>
          <p class="page-desc">Runs the multi-phase closed-loop verification experiment: executes real load, builds simulation model, injects chaos, and calibrates parameters.</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="runMasterExperiment('baseline')">Run Baseline</button>
          <button class="btn btn-primary" onclick="runMasterExperiment('calibrated')">Run Calibrated Master Gate &rarr;</button>
        </div>
      </div>

      <!-- Closed Loop Master Terminal Log -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Live Gate Execution Terminal</div>
          <span class="badge" id="sim-status-badge">READY</span>
        </div>
        <div class="terminal-box" style="height:320px; max-height:450px;" id="sim-terminal">
          Click "Run Calibrated Master Gate" to start the full closed-loop experiment.
        </div>
      </div>
    </section>

    <!-- ===================================================================
         TAB 8: REPORTS & ARTIFACTS ARCHIVE
         =================================================================== -->
    <section id="view-reports" class="tab-content">
      <div class="page-header">
        <div>
          <h1 class="page-title">Reports &amp; Artifacts Archive</h1>
          <p class="page-desc">Inspect, download, and audit past test executions, JSON summaries, and standalone HTML reports.</p>
        </div>
        <button class="btn btn-secondary" onclick="loadAllRuns()">Refresh Archive</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Type</th>
                <th>Created At</th>
                <th>Target / Mode</th>
                <th>Status</th>
                <th>Throughput</th>
                <th>P99</th>
                <th>Artifacts</th>
              </tr>
            </thead>
            <tbody id="tbody-archive-runs">
              <tr>
                <td colspan="8" style="text-align:center; padding:16px; color:var(--text-muted);">
                  Loading archived reports...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

  </main>

  <!-- Clean Monochrome Footer -->
  <footer class="footer">
    <div>SYSTEM-X Testing Control Center &middot; Blackbox-X &middot; Quorum Lab</div>
    <div class="mono" style="font-size:11px;">Version 2.4.0 &middot; Strict Monochrome Mode</div>
  </footer>

  <!-- ===================================================================
       CLIENT-SIDE JAVASCRIPT LOGIC
       =================================================================== -->
  <script src="/client.js"></script>
</body>
</html>`;
}
