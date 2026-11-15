# Three-project integration evidence

## Runtime boundaries

The table describes the preceding audit. [Phase 3 remediation](PHASE3_REMEDIATION.md) adds two-process MySQL Commerce, explicit replica repair, and canonical request replay with recorded limits.

| Mode | Observed process or infrastructure | Result and scope |
| --- | --- | --- |
| REAL-INTEGRATION | Desktop and mobile Google Chrome against the System-X HTTP Control Center, a separate Blackbox-X HTTP process, a separate Quorum Lab HTTP Control API, and an isolated local benchmark fixture | Ten attempts passed the recorded grouped browser checks. Navigation, expected service status responses, benchmark input, bounded request counts, 429 aggregation, SSE completion, baseline comparison, and refresh/persistence checks exercised real browser and HTTP paths. Some embedded panels intentionally used the local adapters. |
| REAL-INTEGRATION | Three separate Quorum Lab node processes with isolated WAL directories. The process report records PIDs, ephemeral ports, gRPC queries, faults, and a restarted PID. | Ten attempts recorded W=2 unavailable in isolation, majority acknowledgement, no acknowledgement with both peers blocked, replication of a new key after healing, and abrupt restart with retained snapshot and post-snapshot WAL data. Authentication, stale-write visibility, linearizability, and old-key backfill remain outside those assertions. |
| LOCAL-FALLBACK | System-X bundled Commerce backend on HTTP with an embedded Quorum adapter using fresh WAL directories | Ten attempts passed each corrected commerce case. The CRT-03 scenario launched 20 concurrent saga calls. The separate HTTP check sends 20 concurrent HTTP requests and reads back all persisted orders and inventory. |
| LOCAL-FALLBACK | System-X comparison demo with actual Blackbox-X simulation libraries and Quorum gRPC nodes inside one OS process | Ten raw comparisons were independently recalculated. G4 and G5 failed ten times each. There is no eligibility for full-chain certification. |
| FULL-INFRASTRUCTURE | Dedicated QA Docker Compose project with MySQL, Kafka, Redis and MinIO, localhost port bindings, and its own volumes | Blackbox-X milestone outcomes reflect each check's actual dependencies. M3 is a pure gate. The independent System-X WORM lane exercised real uploads, byte reads, version retention, and failed deletion. |

No traffic was sent to public benchmark targets. The sandbox used the System-X bundled storefront. Port numbers were determined from source and overridden with ephemeral local ports for the independent-process lanes. System-X defaults to 8080, the bundled Commerce sandbox to 4200, and Blackbox-X to 4000. Quorum Control API defaults to 8000 locally and the Kubernetes manifest sets 3000.

## Observed setup

Node.js 24.12, npm 11.6.2, pnpm 11.25, Chrome 157.0.8103.51 and Docker 29.7.2 with Compose 5.3.1 were available. Image pulls timed out. The QA stack used verified cached MySQL 8.4.11, Redis 7.4.11, Kafka 4.3.1 and MinIO RELEASE.2025-09-07T16-13-09Z. The Node gRPC runtime was exercised through actual client calls. The audited worktrees use JavaScript. The Vitest versions resolved per project's pinned dependency tree.

## Remaining evidence gaps

- The three services responded independently to browser flows. There is no run that passes the full master sequence through independent service processes using the identical trace, live calibration, held-out validation, and a retained certificate.
- The standalone Quorum Lab dashboard, mTLS across independent nodes, real-process Raft, and Kubernetes deployment require separate evidence. No authorized test cluster was available.
- Shared multi-instance commerce inventory and a live payment provider were outside the verified local commerce scope. The payment test uses the testbed's defined failure fixture. Tenant isolation failed through the running HTTP service. See [the defect and reproduction](BUG_REPORT.md).
- Some Blackbox-X gates use live infrastructure while testing their own application handlers in-process. Per-gate logs identify the actual services and scope.

## Quorum Lab milestones

| Milestone | Evidence scope |
| --- | --- |
| Q0 Foundation | Repeated named lifecycle and storage cases plus live node membership and gRPC calls. |
| Q1 Durable recovery | WAL, CRC and corruption cases in the repository suite plus abrupt restart with retained data in the process lane. |
| Q2 Replication | Named synchronous and asynchronous replication cases plus actual peer propagation for the tested quorum policy. |
| Q3 Quorum and control plane | Named policy and management cases, live HTTP status and unavailable-write checks across node processes. |
| Q4 Faults | Named model and scheduler cases plus actual peer link block/heal. Duplication, reorder and storage failure require application-level coverage. |
| Q5 Conflict and causality | Named vector-clock and frontier cases. Clock-skew behavior and causal history under independent processes remain open. |
| Q6 Repair | Named repair, hinted handoff, Merkle and tombstone cases. Full convergence of old data after a real partition remains open. |
| Q7 Correctness and reporting | Named session, analysis and report cases. No independent concurrent-history linearizability result. |
| Q8 Leader fencing | Named leader and epoch tests in the repository suite. Independent node CLI wiring remains open. |
| Q9 Raft | Named Raft tests. Real-process election, minority commit safety and snapshot installation remain open. |
| Q10 Deployment | Named pod lifecycle and mTLS cases. Kubernetes rollout, persistent-volume recovery and a multi-process mTLS deployment remain open. |
| Q11 Benchmarking | Named workload and percentile cases. Those checks do not establish production-scale throughput or recovery bounds. |

The isolated Compose services were stopped after testing. The named QA volumes and session metadata remain available for reproduction.

[Process report](runs/2026-11-15T03-20-21-083Z-e518e438/process/01/processes.json) · [Environment](environment.log) · [Infrastructure image results](infrastructure-cached-images.log) · [Teardown log](infrastructure-stop.log) · [Comparison](COMPARISON_REPORT.md) · [Execution history](TEST_EXECUTION_RESULTS.csv)
