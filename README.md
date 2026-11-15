# SYSTEM-X

Source files, tests, and service entry points run as JavaScript on Node.js 24. Workspace builds stage JavaScript in each package’s `dist/` directory.

> **Closed-Loop Research, Benchmark, Calibration & Empirical Verification Engine**  
> Uniting **BLACKBOX-X** (discrete-event performance simulation) and **QUORUM LAB** (distributed consistency and failure execution) into a unified, mathematically verifiable certification platform.

> [!IMPORTANT]
> ### 🌐 LOCAL DASHBOARD ENDPOINTS
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
|                  |      EVALUATES EVIDENCE     |                            |
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

## 3. Certification Design (G1 through G8)

The table describes the intended full certification protocol. The local demo measures workload execution, network faults, and model fidelity. Calibration, held-out validation, and object retention require separate verification.

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
│   ├── server.js               # SYSTEM-X Unified Web Portal & Control Server (Port 8080)
│   ├── runRealDemo.js          # Master in-process experiment & closed-loop runner
│   ├── localGate.js            # Local deterministic 7-stage verification gate
│   └── integrationGate.js      # 18-step live multi-system integration gate
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
pnpm install --frozen-lockfile
pnpm build
pnpm serve
```
Open **`http://localhost:8080`** in any browser.

The redesign adapts [Spotlight Card](https://reactbits.dev/components/spotlight-card) and [Star Border](https://reactbits.dev/animations/star-border) from React Bits for the existing JavaScript portal. The effects respect the browser's reduced-motion setting.

Features:
- **Real-Time Ecosystem Health**: Live monitoring of System-X, Blackbox-X, Quorum Lab, and MinIO storage.
- **Verification Command Center**: One-click live closed-loop experiment execution.
- **Blackbox Simulation Viewer**: Virtual time step and queue saturation views.
- **Quorum Explorer**: Per-node cluster telemetry, WAL sequence, and quorum overlap.
- **Run Manifests & Reports**: Interactive executive dashboard with SVG charts.

Run `pnpm test:chrome` with Google Chrome installed and all three sibling workspaces built. The test starts an isolated portal and HTTP fixture, exercises the UI with custom JSON, and saves screenshots and reports in a temporary directory. Set `CHROME_EXECUTABLE` if Chrome is installed in a different location.

The portal binds to loopback by default. For a deployment reachable from other hosts, set `SYSTEM_X_ACCESS_TOKEN` to a secret with at least 24 characters and serve the portal behind HTTPS. The browser login is `system-x` with that token as the password. Set `SYSTEM_X_BENCHMARK_ORIGINS` to the comma-separated origins approved for testing. To benchmark loopback services, configure `SYSTEM_X_LOCAL_BENCHMARK_ORIGINS` with the exact origins and enable the local target option for each run.

### B. Master CLI Experiment Runner
Execute the master closed-loop verification experiment directly in your terminal:
```bash
pnpm demo:real
```

Build Quorum Lab with `pnpm build` and Blackbox-X with `npm run build` in their sibling folders first. The runner measures 150 operations across three local Quorum Lab nodes and compares those measurements with an independent Blackbox-X baseline. The report includes the applied partition and delay, operation outcomes, and latency comparison.

The local run reports **NOT CERTIFIED**. Local files provide no S3 Object Lock evidence, and the model must also meet the measured comparison thresholds. Use `pnpm demo:real --require-certification` to return an error exit for an uncertified result.

### C. Run Local Verification Gate
```bash
pnpm check
pnpm test
pnpm gate:local
```

---

## 6. Generated Artifact Bundles

A local run writes a SHA-256 manifest and its measured evidence to `artifacts/run-<id>`:
```text
artifacts/run-<id>/
├── report.html
├── summary.json
├── certification.json
├── comparison.json
├── workload/trace.json
├── faults/timeline.json
└── telemetry/{quorum,blackbox,normalized}.json
```

---

## 7. Integration with the Commerce Reliability Testbed (CRT)

The embedded **Commerce Reliability Testbed (CRT)** exercises checkout, idempotency, inventory contention, concurrent writes, and duplicate event delivery. Run `node crt/scenarios/runLastItemTest.js` for the 20-buyer check. Run `node crt/scenarios/runAllScenarios.js` to see which scenarios passed and which remain unverified. The full matrix exits unsuccessfully if any scenario fails or lacks evidence.
