# SYSTEM-X — Master Architecture Specification & Complete UI Walkthrough Guide

> **Closed-Loop Research, Benchmark, Calibration & Empirical Verification Platform**  
> Uniting **BLACKBOX-X** (discrete-event performance simulation), **QUORUM LAB** (distributed consistency and consensus), and **COMMERCE RELIABILITY TESTBED (CRT)** (production-parity application under test) into a mathematically verifiable ecosystem.

> [!IMPORTANT]
> ### 🌐 DIRECT LIVE WEB DASHBOARDS (CLICK TO OPEN IN BROWSER)
> - 🖥️ **SYSTEM-X Ecosystem Portal**: 👉 **[http://localhost:8080](http://localhost:8080)**  
> - 🛒 **Commerce Reliability Testbed (CRT)**: 👉 **[http://localhost:4200](http://localhost:4200)**  

---

## 1. System Mission & The Closed-Loop Feedback Architecture

SYSTEM-X is the independent orchestration and evaluation layer that mathematically closes the loop between simulation models and real distributed systems execution:

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

1. **BLACKBOX-X**: *"What should happen?"* (Virtual-clock queueing simulation, Little's Law, $M/M/c$ capacity limits).
2. **QUORUM LAB**: *"What actually happens?"* (Real 3-node cluster, 5-axis decoupled consistency, WAL durability, vector clocks, live fault injection).
3. **SYSTEM-X**: *"How accurate was the model, and how do we certify it?"* (Deterministic workload/fault compilation, empirical telemetry normalization, Two-Gate AND statistical certification, zero-leakage calibration).
4. **COMMERCE RELIABILITY TESTBED (CRT)**: *"Does application data survive failures without overselling?"* (The enterprise AUT running on Quorum Lab with 20 buyers for the last item).

---

## 2. The 8 Master Certification Gates (G1 through G8)

Every experiment run evaluated by SYSTEM-X must clear eight non-negotiable gates:

| Gate | Name | Exact Pass Criterion | Verification Standard |
|---|---|---|---|
| **G1** | Deterministic Workload Trace | Seed Hashed | Bit-for-bit identical 150-op Zipfian sequence derived from master seed. |
| **G2** | Monotonic Fault Timeline | Time-Sorted | Fault schedule strictly ordered by offset with clean post-run recovery. |
| **G3** | Live Distributed Quorum Interlock | $W + R > N$ ($2+2>3$) | Real 3-node cluster maintains guaranteed quorum intersection. |
| **G4** | Statistical Fidelity | $p \ge 0.05 \land D_{KS} \le 0.15$ | Two-Gate AND (Kolmogorov-Smirnov + 1-Wasserstein $W_1 \le 12.0\text{ ms}$). |
| **G5** | Engineering Bounds & SLA Conformance | $P99 < 25\text{ ms}$ | Empirical latency and throughput conform to production SLA targets. |
| **G6** | Validation Partition Zero-Leakage | 0 Overlap | Strict 70% calibration / 30% held-out validation sample isolation. |
| **G7** | Calibration Loop Convergence | $\le 5$ Iterations | Closed-loop parameter tuning converges within defined tolerance. |
| **G8** | Immutable Cryptographic Lineage | WORM Hash | Cryptographic SHA-256 manifest pins code, workload, telemetry, and verdict. |

---

## 3. Interactive Web UI Walkthrough: SYSTEM-X Ecosystem Portal (`http://localhost:8080`)

The SYSTEM-X Portal provides a unified, multi-tab operational dashboard for running closed-loop experiments and inspecting ecosystem health.

```text
+-----------------------------------------------------------------------------------------+
| SYSTEM-X ECOSYSTEM PORTAL                                           [PORT: 8080]        |
| System-X: [ONLINE]  |  Blackbox: [READY]  |  Quorum: [READY]  |  MinIO: [READY]         |
+-----------------------------------------------------------------------------------------+
| [1. Verification Command Center] [2. Blackbox Sim] [3. Quorum Explorer] [4. Run Reports]|
+-----------------------------------------------------------------------------------------+
```

### Tab 1: Verification Command Center
- **Ecosystem Health Header**: Real-time status badges for System-X, Blackbox-X, Quorum Lab, and MinIO storage.
- **Trigger Live Run Button**: A large green button: **"Execute Master Verification Experiment"**.
  - Clicking this button triggers the live coordinator:
    1. Boots a live in-process 3-node Quorum Lab cluster.
    2. Compiles 150 deterministic Zipfian read/write operations.
    3. Injects live faults: Node-2 network partition (800ms) and Node-3 packet delay (500ms).
    4. Normalizes telemetry and compares against Blackbox simulation.
    5. Evaluates G1-G8 gates and prints the verified certification manifest.
- **Live Terminal Log Output**: Streams verbatim execution stdout and displays the final verdict banner:
  `OVERALL VERDICT: CERTIFIED [PASS] (Confidence: 99.8%)`.

### Tab 2: Blackbox-X Simulation View
- **Virtual Time Event Calendar ($T_v$)**: Interactive step-by-step playback of discrete simulation events.
- **Queue Saturation Curve**: Graphs queue depth ($L_q$) vs. request arrival rate ($\lambda$), visually demonstrating exponential latency degradation as server utilization $\rho \to 1.0$.
- **Analytical Latency Distribution**: Interactive CDF graph of simulated response times under Little's Law.

### Tab 3: Quorum Lab Explorer View
- **3-Node Cluster Topology Diagram**: Displays active nodes (`node-1`, `node-2`, `node-3`) with their gRPC ports and live health status.
- **Mathematical Quorum Gauge**: Highlights that $W=2, R=2, N=3 \implies W + R = 4 > 3$, visually proving quorum intersection.
- **Per-Node Telemetry Cards**: Live metrics for each node:
  - Total Reads & Writes Served
  - Append-Only WAL Sequence Number
  - In-Memory Key & Tombstone Count
- **Vector Clock Domination Viewer**: Inspects Lamport counters and node causality maps to show how Last-Write-Wins (LWW) resolves write conflicts.

### Tab 4: Run Manifests & Interactive Reports
- **Historical Runs Table**: Lists all previous experiment runs with timestamp, duration, specHash, and pass/fail verdict.
- **One-Click HTML Report Viewer**: Opens the rich, interactive `report.html` for any run, featuring:
  - Latency vs. Time timeseries vector chart.
  - Analytical vs. Empirical CDF comparison chart.
  - Zipfian key access frequency bar chart.
  - Full machine-readable `summary.json` and cryptographic `certification.json`.

---

## 4. Interactive Web UI Walkthrough: Commerce Reliability Testbed (`http://localhost:4200`)

The Commerce Reliability Testbed (CRT) dashboard provides the engineering control center for the application under test with a persistent left navigation sidebar.

```text
+-------------------+---------------------------------------------------------------------+
| CRT CONTROL CENTER| CRT-03: THE LAST ITEM CONCURRENCY TEST                              |
|                   | Available Stock: [ 1 ]  Reserved Stock: [ 0 ]                       |
| • Overview        |                                                                     |
| • Storefront      | [ TRIGGER 20 CONCURRENT BUYERS ]                                    |
| • The Last Item   |                                                                     |
| • Topology DAG    | Results:                                                            |
| • Cluster Nodes   | • Requests Dispatched : 20                                          |
| • Experiment Hub  | • Confirmed Orders    : 1   (Winner: buyer-01)                      |
| • Failure Lab     | • Rejected Requests   : 19  (Reason: INSUFFICIENT_STOCK)            |
| • Consistency     | • Oversold Items      : 0   [PASS: ZERO OVERSELLING INVARIANT]      |
| • Calibration     | • Remaining Stock     : 0                                           |
| • CRT Scenarios   |                                                                     |
+-------------------+---------------------------------------------------------------------+
```

### The 10 Persistent Views:
1. **Executive Overview**: High-level cluster health, active throughput (RPS), node count ($N=3$), and overall scenario pass rate.
2. **Commerce Storefront**: Functional e-commerce catalog featuring 1,000 seeded products with category filters, a live shopping cart, and one-click order placement.
3. **Inventory & The Last Item (CRT-03)**: Real-time visual demonstrator of the critical race condition: 20 simultaneous buyers racing for 1 remaining item (`PHONE-001`), proving **strictly 0 overselling**.
4. **Service Topology DAG**: Interactive visualization of request routing from Storefront $\to$ API $\to$ Quorum Nodes $\to$ System-X.
5. **Cluster & Nodes (N=3)**: Real-time telemetry cards for `node-1`, `node-2`, and `node-3` showing port status, WAL log sequence, and memory keys.
6. **Experiment Studio**: Multi-axis consistency configuration ($W$, $R$, replication topology, durability, conflict resolution).
7. **Failure Injection Lab**: Interactive toggles to inject network partitions, packet delays, and node crashes into the running cluster.
8. **Consistency Explorer**: Query individual replicas directly to detect stale reads and inspect replica skew.
9. **Calibration Engine**: Compares Blackbox analytical simulation curves with empirical Quorum latency measurements with KS/Wasserstein divergence charts.
10. **CRT Scenarios (01–15)**: Interactive matrix executing all 15 reliability scenarios with live progress bars and green assertion checkmarks.

---

## 5. How to Launch & Test the Live UIs

### Launching the Web Dashboards
Both portals are currently active on your system:
- **SYSTEM-X Portal**: Open **`http://localhost:8080`**
- **Commerce Testbed (CRT)**: Open **`http://localhost:4200`**

To start them manually if restarted:
```powershell
# Start System-X Portal (Port 8080)
cd "c:\MSC\Main project\main portfolio integration project\system-x"
npm run serve

# Start Commerce Testbed (Port 4200)
cd "c:\MSC\Main project\main portfolio integration project\commerce-reliability-testbed"
npm start
```

### Terminal CLI Verification Commands
```powershell
# 1. Run Master Closed-Loop Experiment (System-X)
cd "c:\MSC\Main project\main portfolio integration project\system-x"
npm run demo:real

# 2. Run CRT-03 (The Last Item 20-Buyer Concurrency Proof)
cd "c:\MSC\Main project\main portfolio integration project\commerce-reliability-testbed"
npm run scenario:last-item

# 3. Run All 15 CRT Scenarios Matrix
cd "c:\MSC\Main project\main portfolio integration project\commerce-reliability-testbed"
npm run scenario:all
```
