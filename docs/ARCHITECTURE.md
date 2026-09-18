# SYSTEM-X — Dual-Platform Integration Architecture

## 1. System Vision

SYSTEM-X is the independent integration and evaluation layer connecting **BLACKBOX-X** (capacity and discrete-event simulation) with **QUORUM LAB** (distributed consensus, consistency, and failure verification).

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
                    └───────────────────────────┘
```

## 2. Invariant: Independent Sovereignty

Neither project imports the other's internal classes or packages.
Neither project shares database tables.
All communication flows through typed HTTP/REST, gRPC, and versioned JSON schemas.
Replay determinism is keyed on canonical `experimentSpecHash`, never volatile runtime identifiers.
