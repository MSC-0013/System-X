# SYSTEM-X — Canonical Contracts & Replay Determinism

## 1. Replay Determinism & Seed Derivation

In earlier drafts, seed derivation attempted to hash `integrationRunId`. However, `integrationRunId` is a freshly minted UUID on every run, which broke bit-for-bit replayability across runs of the identical experiment!

In SYSTEM-X:
1. `integrationRunId` is strictly a correlation and tracing identifier.
2. The experiment definition is canonically normalized into `experimentSpecHash`:
   $$\text{experimentSpecHash} = \text{SHA-256}\big(\text{canonicalJson}(\text{experimentSpec})\big)$$
3. Sub-stream seeds are derived deterministically using:
   $$\text{streamSeed} = \text{uint32}\Big(\text{SHA-256}\big(\text{experimentSpecHash} + \text{masterSeed} + \text{streamName}\big)\Big)$$

This guarantees:
$$\text{Same Experiment Spec} + \text{Same Master Seed} \implies \text{Identical Derived Seeds & Operation Sequence}$$

---

## 2. Workload Invariants
- `readRatio + writeRatio === 1.0` (within $10^{-6}$ epsilon).
- Operations:
  - If `operations === 'READ'`, `readRatio` must be $1.0$.
  - If `operations === 'WRITE'`, `writeRatio` must be $1.0$.
  - If `operations === 'MIXED'`, both $0 < \text{readRatio} < 1.0$ and $0 < \text{writeRatio} < 1.0$.
- Zipfian distribution requires $0.1 \le \theta \le 2.0$.
