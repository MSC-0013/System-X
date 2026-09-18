# SYSTEM-X

> **Closed-Loop Research, Benchmark, Calibration & Empirical Verification Engine**  
> Uniting **BLACKBOX-X** (discrete-event performance simulation) and **QUORUM LAB** (distributed consistency and failure execution).

---

## 1. Overview

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

- **BLACKBOX-X**: *"What should happen?"* (Discrete-event simulation, Little's Law, queueing networks, parameter calibration)
- **QUORUM LAB**: *"What actually happens?"* (Real 5-axis decoupled consistency, Raft consensus, vector clocks, Merkle repair, live chaos)
- **SYSTEM-X**: *"How accurate was the model, and how do we calibrate it?"* (Deterministic compilation, empirical comparison, KS/Wasserstein divergence, automated calibration loop)

---

## 2. Architecture & Sovereignty Invariants

SYSTEM-X maintains strict architectural sovereignty:
1. **Independent Repositories**: BLACKBOX-X, QUORUM LAB, and SYSTEM-X are completely sovereign codebases.
2. **Zero Internal Cross-Imports**: All inter-system interactions occur exclusively over typed HTTP REST, gRPC, and versioned JSON schemas (`protocol/`).
3. **No Shared Persistence**: No shared database tables, connection pools, or stateful stores.
4. **Deterministic Reproducibility**: Replays and run artifacts are keyed on canonical `experimentSpecHash`, with seed-pinned PRNG distributions and environment provenance.

---

## 3. Package Structure

```text
system-x/
├── packages/
│   ├── contracts/          # Protocol definitions, schema validators, run contracts
│   ├── compiler/           # High-level experiment spec to workload & fault compiler
│   ├── runner/             # Distributed execution orchestrator against QUORUM & BLACKBOX
│   ├── normalizer/         # Metric, latency, and trace event normalizer
│   ├── comparator/         # Empirical vs simulated distribution comparator (KS, Wasserstein)
│   ├── calibrator/         # Closed-loop optimizer & calibration partition manager
│   ├── control-api/        # Fastify HTTP Control & Orchestration REST API
│   ├── storage/            # Lineage, run manifests, and WORM artifact store
│   └── cli/                # System-X unified CLI runner
├── gate/                   # Integrated certification gates (local & 18-step live)
├── protocol/               # Cross-system JSON schemas and contracts
└── docs/                   # System-X architecture & specifications
```

---

## 4. Verification & Gates

SYSTEM-X enforces automated certification gates:

### Local Deterministic Verification
Runs in isolation with zero live service dependencies:
```bash
pnpm test          # Run all 110 unit & contract test suites
pnpm gate:local    # Run 7-stage deterministic verification gate
```

### Live Three-System Integrated Gate
Runs an 18-step live certification across real running instances of BLACKBOX-X, QUORUM LAB, and SYSTEM-X:
```bash
pnpm gate:integration
```

---

## 5. Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests across workspace
pnpm test
```

## License
Apache-2.0 / Proprietary (MSC Research)
