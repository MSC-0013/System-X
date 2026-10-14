# SYSTEM-X — Dual-Platform Integration & Verification Architecture

## 1. System Vision & Purpose

SYSTEM-X is the independent integration, verification, and certification platform connecting:
- **BLACKBOX-X**: High-fidelity discrete-event capacity, queueing simulation, and failure propagation models.
- **QUORUM LAB**: Real 3-node distributed key-value laboratory with 5-axis decoupled consistency, WAL durability, vector clocks, and live fault injection.
- **COMMERCE RELIABILITY TESTBED (CRT)**: Production-parity e-commerce application under test demonstrating atomic inventory reservation, checkout sagas, and 0 overselling.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             THE SISTER PLATFORMS                            │
├──────────────────────────────────────┬──────────────────────────────────────┤
│              BLACKBOX-X              │              QUORUM LAB              │
│       "What should happen?"          │       "What actually happens?"       │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Discrete-event queueing simulation │ • 5-axis decoupled consistency model │
│ • Little's Law & bottleneck search   │ • Vector clocks & CRDT merges        │
│ • Virtual event calendar             │ • Raft consensus & leader leases     │
│ • Model parameter calibration        │ • Anti-entropy Merkle tree repair    │
│ • Two-Sample KS & Wasserstein tests  │ • Real network & node chaos injection│
└──────────────────────────────────────┴──────────────────────────────────────┘
                                   │
                                   ▼
                    ┌───────────────────────────┐
                    │      SYSTEM-X BRIDGE      │
                    │   Closed-Loop Evaluation  │
                    └──────────────┬────────────┘
                                   │
                                   v
                    ┌───────────────────────────┐
                    │      COMMERCE TESTBED     │
                    │   Application Under Test  │
                    │  (20 Buyers for Last Item)│
                    └───────────────────────────┘
```

---

## 2. Architectural Sovereignty Invariants

SYSTEM-X enforces strict architectural sovereignty:
1. **Independent Repositories**: BLACKBOX-X, QUORUM LAB, SYSTEM-X, and CRT are independent codebases.
2. **Zero Internal Cross-Imports**: All inter-system interactions occur exclusively over typed HTTP REST, gRPC, and versioned JSON schemas (`protocol/`).
3. **No Shared Persistence**: No shared database tables, connection pools, or stateful stores.
4. **Deterministic Reproducibility**: Replays and run artifacts are keyed on canonical `experimentSpecHash`, with seed-pinned PRNG distributions and environment provenance.

---

## 3. Data Flow & Execution Pipeline

```text
1. EXPERIMENT SPEC (JSON)
   │
   ├─► WORKLOAD COMPILER
   │   └─ Generates deterministic 150-op Zipfian read/write stream.
   │
   ├─► FAULT COMPILER
   │   └─ Generates monotonic fault schedule (partition, delay, crash).
   │
   ├─► BLACKBOX SIMULATION ENGINE
   │   └─ Virtual-clock scheduling generates analytical CDF distribution.
   │
   ├─► QUORUM CLUSTER COORDINATOR
   │   └─ Executes real mutations over gRPC / In-Process cluster (W=2, R=2, N=3).
   │
   ├─► TELEMETRY NORMALIZER
   │   └─ Unifies timestamps, offsets, latencies, and version counters.
   │
   ├─► STATISTICAL COMPARATOR
   │   ├─ Two-Sample Kolmogorov-Smirnov Test (D_KS <= 0.15, p >= 0.05)
   │   └─ 1-Wasserstein Earth Mover's Distance (W_1 <= 12.0 ms)
   │
   ├─► ZERO-LEAKAGE CALIBRATION LOOP
   │   ├─ 70% Training Partition (Tuning optimizer)
   │   └─ 30% Held-Out Validation Partition (Strict zero-leakage test set)
   │
   └─► CERTIFICATION GATE (G1 - G8)
       └─ Issues CERTIFIED [PASS] verdict & WORM SHA-256 artifact manifest.
```

---

## 4. Master Ports & Services

| Service | Port | Protocol | Purpose |
|---|---|---|---|
| **System-X Ecosystem Portal** | `8080` | HTTP / REST | Control center, live experiment runner, and report viewer |
| **Commerce Storefront & Dashboard** | `4200` | HTTP / REST | Application Under Test (catalog, cart, checkout, CRT-03) |
| **Quorum Node-1** | `50051` | gRPC | Storage coordinator, WAL, and replication |
| **Quorum Node-2** | `50052` | gRPC | Quorum replica |
| **Quorum Node-3** | `50053` | gRPC | Quorum replica |
| **Quorum Control API** | `3000` | HTTP / REST | Cluster discovery and node health |
| **Blackbox Control API** | `4000` | HTTP / REST | Simulation and capacity API |
| **MinIO Object Store** | `9000` | S3 API | WORM run artifact and telemetry storage |
