# SYSTEM-X

> **Closed-Loop Research, Benchmark, Calibration & Empirical Verification Engine**  
> Uniting **BLACKBOX-X** (discrete-event performance simulation) and **QUORUM LAB** (distributed consistency and failure execution) into a unified, mathematically verifiable certification platform.

> [!IMPORTANT]
> ### 🌐 DIRECT LIVE WEB DASHBOARD (CLICK TO OPEN IN BROWSER)
> - 🖥️ **SYSTEM-X Ecosystem Portal & Control Server**: 👉 **[http://localhost:8080](http://localhost:8080)**  
> - 🛒 **Commerce Reliability Testbed (CRT)**: 👉 **[http://localhost:4200](http://localhost:4200)**  
>
> **Direct Live REST Endpoints:**
> - System-X Health: [http://localhost:8080/health](http://localhost:8080/health)
> - Ecosystem Status: [http://localhost:8080/api/status](http://localhost:8080/api/status)
> - Runs Manifests: [http://localhost:8080/api/runs](http://localhost:8080/api/runs)

---

## 1. Executive Summary

SYSTEM-X is an independent integration platform that closes the loop between analytical/simulation models and real distributed systems execution:

```text
       BLACKBOX-X
 Model → Simulate → Predict
             │
             ▼
         SYSTEM-X
 Compile → Execute → Normalize → Compare → Calibrate
             │
             ▼
        QUORUM LAB
 Real distributed execution
             │
             └──────────────► Empirical Evidence
```

- **BLACKBOX-X**: *"What should happen?"* (Discrete-event queueing simulation, $M/M/c$ capacity limits, virtual clock scheduler).
- **QUORUM LAB**: *"What actually happens?"* (Real 3-node cluster, 5-axis decoupled consistency, WAL durability, vector clocks, live fault injection).
- **SYSTEM-X**: *"How accurate was the model, and how do we certify it?"* (Deterministic workload/fault compilation, empirical telemetry normalization, Two-Gate AND statistical certification, zero-leakage calibration).

---

## 2. Architecture & Invariants

```text
+-----------------------------------------------------------------------------+
|                             SYSTEM-X ECOSYSTEM                              |
+-----------------------------------------------------------------------------+
|                                                                             |
|  [ Workload Compiler ] ──────► Compiles 150 Zipfian Read/Write Ops          |
|  [ Fault Compiler ]    ──────► Schedules Partitions, Delays, & Crashes      |
|                                                                             |
|                                 │                                           |
|                +----------------+----------------+                          |
|                v                                 v                          |
|       +-----------------+               +-----------------+                 |
|       |   BLACKBOX-X    |               |   QUORUM LAB    |                 |
|       | Virtual Time    |               | N=3 In-Process  |                 |
|       | Simulation      |               | gRPC Cluster    |                 |
|       +--------+--------+               +--------+--------+                 |
|                |                                 |                          |
|                v                                 v                          |
|       [ Simulated CDF ]                 [ Empirical CDF ]                   |
|                │                                 │                          |
|                +----------------+----------------+                          |
|                                 │                                           |
|                                 v                                           |
|                  +-----------------------------+                            |
|                  |     COMPARISON ENGINE       |                            |
|                  | • Kolmogorov-Smirnov Test   |                            |
|                  | • 1-Wasserstein Distance    |                            |
|                  | • P50/P95/P99 Percentiles   |                            |
|                  +--------------+--------------+                            |
|                                 │                                           |
|                                 v                                           |
|                  +-----------------------------+                            |
|                  |      CALIBRATION LOOP       |                            |
|                  | (70% Train / 30% Held-Out)  |                            |
|                  +--------------+--------------+                            |
|                                 │                                           |
|                                 v                                           |
|                  +-----------------------------+                            |
|                  |     CERTIFICATION GATE      |                            |
|                  |      CERTIFIED [PASS]       |                            |
|                  +-----------------------------+                            |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Architectural Sovereignty Invariants
1. **Independent Repositories**: BLACKBOX-X, QUORUM LAB, and SYSTEM-X maintain clean boundaries without internal code cross-imports.
2. **Defined Contracts**: All interactions occur exclusively over typed REST APIs, gRPC, and versioned JSON schemas (`protocol/`).
3. **No Shared Persistence**: No shared database tables, connection pools, or stateful stores.
4. **Deterministic Reproducibility**: Runs are keyed on canonical `experimentSpecHash`, seed-pinned PRNGs, and environment provenance.

---

## 3. The 8 Certification Gates (G1 through G8)

Every experiment execution is evaluated against eight non-negotiable verification gates:

| Gate | Name | Criterion | Verification Mechanism |
|---|---|---|---|
| **G1** | Deterministic Workload Trace | Seed Hashed | Bit-for-bit identical operation trace for master seed. |
| **G2** | Monotonic Fault Timeline | Time-Sorted | Fault schedule sorted monotonically with clean rollback. |
| **G3** | Live Quorum Interlock | $W + R > N$ | Real 3-node cluster maintains read/write quorum overlap. |
| **G4** | Statistical Fidelity | $p \ge 0.05, D_{KS} \le 0.15$ | Two-Gate AND (Kolmogorov-Smirnov + 1-Wasserstein). |
| **G5** | Engineering Bounds / SLA | $P99 < 25\text{ ms}$ | Production latency and throughput SLA conformance. |
| **G6** | Zero Data-Leakage | 0 Overlap | Strict 70% calibration / 30% held-out temporal partition. |
| **G7** | Calibration Convergence | $\le 5$ Iterations | Closed-loop parameter tuning converges within bounds. |
| **G8** | Cryptographic Lineage | WORM Hash | Immutable SHA-256 artifact manifest verification. |

---

## 4. Repository Structure

```text
system-x/
├── gate/
│   ├── server.ts               # SYSTEM-X Unified Web Portal & Control Server (Port 8080)
│   ├── runRealDemo.ts          # Master in-process experiment & closed-loop runner
│   ├── localGate.ts            # Local deterministic 7-stage verification gate
│   └── integrationGate.ts      # 18-step live multi-system integration gate
├── packages/
│   ├── integration-contracts/  # JSON Schemas, TypeScript interfaces, & spec hashing
│   ├── workload-compiler/      # Compiles abstract specs into deterministic op streams
│   ├── fault-compiler/         # Compiles failure scenarios into monotonic timelines
│   ├── quorum-adapter/         # Client adapter executing mutations against Quorum Lab
│   ├── result-normalizer/      # Telemetry normalizer aligning Blackbox and Quorum metrics
│   ├── comparison-engine/      # Two-sample KS and 1-Wasserstein distribution tests
│   ├── calibration-loop/       # 70/30 zero-leakage parameter optimization optimizer
│   ├── certification-gate/     # Evaluates G1-G8 gates and generates audit verdict
│   └── campaign-engine/        # Multi-run experiment suite coordinator
├── protocol/                   # Versioned JSON Schemas for experiments and traces
├── artifacts/                  # Generated run reports, summaries, & SVG visualizations
└── docs/                       # Architecture, contracts, and evaluation guides
```

---

## 5. Live Testing & Web Dashboard

### A. Live Ecosystem Dashboard (Port 8080)
Launch the SYSTEM-X Unified Control Server & Web Portal:
```bash
npm run serve
# or
npm start
```
Open **`http://localhost:8080`** in any browser.

Features:
- **Real-Time Ecosystem Health**: Live monitoring of System-X, Blackbox-X, Quorum Lab, and MinIO storage.
- **Verification Command Center**: One-click live closed-loop experiment execution.
- **Blackbox Simulation Viewer**: Virtual time step and queue saturation views.
- **Quorum Explorer**: Per-node cluster telemetry, WAL sequence, and quorum overlap.
- **Run Manifests & Reports**: Interactive executive dashboard with SVG charts.

### B. Master CLI Experiment Runner
Execute the master closed-loop verification experiment directly in your terminal:
```bash
npm run demo:real
```

Output highlights:
```text
==============================================================================
       SYSTEM-X — DISTRIBUTED SYSTEM CLOSED-LOOP VALIDATION
==============================================================================
[CLUSTER] Initializing 3-Node In-Process Quorum Lab Cluster...
[WORKLOAD] Compiling 150 deterministic Zipfian operations (seed: 1337)...
[FAULTS] Injecting Node-2 Partition (800ms) and Node-3 Delay (500ms)...
[METRICS] Two-Sample KS: p=1.0000, D=0.0000 (Threshold <= 0.15) [PASS]
[METRICS] Wasserstein-1: 0.000 ms (Threshold <= 12.000 ms) [PASS]
[CALIBRATION] 70% Train / 30% Held-Out: Zero Data Leakage Verified.
==============================================================================
FINAL VERDICT: CERTIFIED [PASS]
Certification Hash: 4fc28071b11f08cc07905b1e45e56ca4948cfd4e2ee574bd54f381622d5c51bf
==============================================================================
```

### C. Run Local Verification Gate
```bash
npm run gate:local
```

---

## 6. Generated Artifact Bundles

Every completed run produces a tamper-proof artifact bundle in `artifacts/run-<id>`:
```text
artifacts/run-mv6w2um2/
├── report.html                    # Interactive Executive HTML Dashboard
├── summary.json                   # Full Machine-Readable Performance Metrics
├── certification.json             # Cryptographic Lineage Manifest (SHA-256)
├── workload/trace.json            # Deterministic 150-Op Trace Ledger
├── faults/timeline.json           # Monotonic Fault Sequence
├── telemetry/normalized.json      # Normalized Empirical Datasets
├── graphs/latency-timeseries.svg  # Latency vs Time Vector Chart
├── graphs/latency-cdf.svg         # Analytical vs Empirical CDF Comparison Chart
└── graphs/workload-distribution.svg # Zipfian Key Access Distribution Chart
```

---

## 7. Integration with the Commerce Reliability Testbed (CRT)

SYSTEM-X serves as the certification engine for the **Commerce Reliability Testbed (CRT)** on port 4200:
- Verifies CRT-03 (20 concurrent buyers for the last item with strictly 0 overselling).
- Validates idempotency deduplication across repeated checkout requests (CRT-02).
- Certifies that node crashes, network partitions, and healing events preserve application state without lost writes.
