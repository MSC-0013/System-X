# Feature inventory

The inventory combines documented architecture, source route discovery, and named runtime assertions. Implementation labels describe source scope. Recorded observations and their limits determine verification status.

[Machine-readable inventory](feature-manifest.json) · [Source, endpoints and specification claim index](SOURCE_INDEX.json)

## SX-DASH — Ecosystem status and service reachability

System-X · IMPLEMENTED · MEDIUM

- Specification: SYSTEM_X.md, lines 262, 323.
- Source: gate/server.js;gate/client.js. API or view: GET /api/status.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Display actual API reachability and offline states without inferring infrastructure readiness.
- Verification: SX-BROWSER-SERVICES.
- Mapped named source tests: 0.

## SX-STUDIO — Website benchmark studio and form

System-X · IMPLEMENTED · MEDIUM

- Specification: SYSTEM_X.md, lines 262, 323.
- Source: gate/dashboardTemplate.js;gate/client.js. API or view: /#website.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Configure approved target, paths, method, request count, timeout and concurrency.
- Verification: SX-BROWSER-CUSTOM-JSON.
- Mapped named source tests: 0.

## SX-URL — URL validation and SSRF controls

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 440.
- Source: gate/benchmarkTarget.js;gate/benchmarkRunner.js. API or view: POST /api/benchmarks/validate-target.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Permission, origin rules, private-address rejection and redirect refusal.
- Verification: SX-BROWSER-URL-SAFETY.
- Mapped named source tests: 0.

## SX-CRAWL — Bounded same-origin discovery

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 323, 440.
- Source: gate/benchmarkRunner.js. API or view: POST /api/benchmarks/discover-routes.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Only the approved origin's sitemap routes enter the benchmark.
- Verification: SX-BROWSER-DISCOVERY.
- Mapped named source tests: 0.

## SX-LIVE — HTTP execution, SSE and request inspector

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 262, 323.
- Source: gate/benchmarkRunner.js;gate/server.js;gate/client.js. API or view: /api/benchmarks/start; /api/benchmarks/runs/:id/stream; /requests.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Status/error counts match actual responses and persisted samples.
- Verification: SX-BROWSER-SSE-INSPECTOR.
- Mapped named source tests: 0.

## SX-REGRESSION — Comparison and regression display

System-X · IMPLEMENTED · MEDIUM

- Specification: SYSTEM_X.md, lines 262, 323.
- Source: gate/benchmarkRunner.js;gate/client.js. API or view: POST /api/benchmarks/compare.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Compare equivalent workloads and show regression on deliberately slower target.
- Verification: SX-BROWSER-REGRESSION.
- Mapped named source tests: 0.

## SX-EDITOR — Topology editor and analytical queue model

System-X · PARTIAL · MEDIUM

- Specification: SYSTEM_X.md, lines 262.
- Source: gate/client.js;gate/dashboardTemplate.js. API or view: /#model.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Navigation is exercised. Add edit, persistence and analytical correctness assertions.
- Verification: SX-BROWSER-NAVIGATION.
- Mapped named source tests: 0.

## SX-EXPLORER — Quorum explorer and cluster controls

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 262.
- Source: gate/dashboardTemplate.js;gate/server.js. API or view: /#quorum.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Control API status is live. The portal does not expose independent node control from this view.
- Verification: SX-BROWSER-SERVICES.
- Mapped named source tests: 0.

## SX-CRT-RUNNER — Commerce scenario launcher

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 262, 510.
- Source: gate/server.js;crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Each scenario evidence is separate. Ten scenario implementations return UNVERIFIED.
- Verification: crt lane.
- Mapped named source tests: 0.

## SX-CLOSED-LOOP — Experiment controller and demo

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 243, 476.
- Source: gate/runRealDemo.js;gate/server.js. API or view: POST /api/experiment/run.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Canonical operation identity and schedule match across both engines. Semantic state and fault parity, independent node processes for this demo, and integrated certification remain open.
- Verification: SX-COMPARE-EXECUTION; SX-TRACE-IDENTITY; SX-TRACE-PARITY.
- Mapped named source tests: 0.

## SX-ARCHIVE — Artifact archive and refresh recovery

System-X · IMPLEMENTED · MEDIUM

- Specification: SYSTEM_X.md, lines 262, 323.
- Source: gate/server.js;gate/benchmarkRunner.js. API or view: GET /api/runs; /artifacts/*.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Reports and request records survive portal restart.
- Verification: SX-BROWSER-RESTORE.
- Mapped named source tests: 0.

## SX-UI-STATES — Loading, empty, error and disconnected UI states

System-X · PARTIAL · MEDIUM

- Specification: SYSTEM_X.md, lines 262.
- Source: gate/client.js;gate/dashboardTemplate.js. API or view: /.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Chrome navigates all views and verifies target errors. Full disconnected/reconnect and empty-state matrix remains untested.
- Verification: SX-BROWSER-NAVIGATION; SX-BROWSER-URL-SAFETY.
- Mapped named source tests: 0.

## SX-SCHEMA — Experiment/schema and negative input validation

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 47, 454.
- Source: packages/integration-contracts;schemas. API or view: —.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Malformed specs rejected and canonical identities stable.
- Verification: integration-contracts Vitest cases.
- Mapped named source tests: 18.

## SX-COMPILER — Trace determinism, seeds, Zipfian and Uniform

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 47, 476.
- Source: packages/workload-compiler;packages/integration-contracts. API or view: —.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Identical seed and spec yield the same hash and exact operation count; range and skew honored.
- Verification: workload compiler Vitest cases.
- Mapped named source tests: 40.

## SX-FAULTS — Fault compilation, order and integrity

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 47, 476.
- Source: packages/fault-compiler. API or view: —.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Events sorted monotonically and deterministic trace hash retained.
- Verification: fault compiler Vitest cases.
- Mapped named source tests: 11.

## SX-NORMALIZE — Telemetry normalization and error taxonomy

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 47, 454.
- Source: packages/result-normalizer. API or view: —.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Correct units and consistent counts, outcomes, timestamps and latency percentiles.
- Verification: SX-REFERENCE-METRICS; normalizer Vitest cases.
- Mapped named source tests: 12.

## SX-W1-KS — K–S D, asymptotic p-value and Wasserstein-1

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 47, 476.
- Source: packages/comparison-engine. API or view: —.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Independent implementation agrees on measured samples. P-value is asymptotic with model assumptions and ties caveat.
- Verification: SX-REFERENCE-DISTANCE; comparison Vitest cases.
- Mapped named source tests: 19.

## SX-MASTER-CERT — Eight criteria jointly certify live matched-trace experiment

System-X · PARTIAL · CRITICAL

- Specification: SYSTEM_X.md, lines 476.
- Source: packages/certification-gate;gate/runRealDemo.js. API or view: —.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: G4/G5 failed during measured comparison. G6/G7/G8 are not executed together in the demo, and the evaluator alone is narrower than G1–G8.
- Verification: comparison lane.
- Mapped named source tests: 19.

## SX-CAL-SPLIT — 70/30 optimizer training/held-out separation

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 47, 476.
- Source: packages/calibration-loop. API or view: POST /v1/calibration/runs expected on Blackbox-X.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Unit shows request construction. Live Blackbox calibration contract endpoint not registered.
- Verification: SX-G6; calibration-loop Vitest cases.
- Mapped named source tests: 7.

## SX-CAL-CONVERGE — Live optimizer convergence and held-out validity

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 476.
- Source: packages/calibration-loop;gate/runRealDemo.js. API or view: POST /v1/calibration/runs expected on Blackbox-X.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Demo omits remote optimizer and held-out workflow.
- Verification: SX-G7.
- Mapped named source tests: 7.

## SX-CHECKSUM — SHA-256 artifact checksum integrity

System-X · IMPLEMENTED · HIGH

- Specification: SYSTEM_X.md, lines 476.
- Source: packages/certification-gate/src/artifactIntegrity.js. API or view: —.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Independently hash five files and reject deliberately altered bytes.
- Verification: SX-ARTIFACT-DIGEST.
- Mapped named source tests: 0.

## SX-WORM — Versioned MinIO Object Lock and deletion denial

System-X · IMPLEMENTED · CRITICAL

- Specification: SYSTEM_X.md, lines 476.
- Source: packages/certification-gate/src/artifactStore.js. API or view: S3 PutObject; GetObjectRetention; GetObject.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Signed upload, exact version and read-back retention with negative deletion test. Demo wiring remains separate.
- Verification: SX-WORM-STORAGE.
- Mapped named source tests: 0.

## SX-CAMPAIGN — Campaign capability validation and Cartesian matrix

System-X · IMPLEMENTED · MEDIUM

- Specification: SYSTEM_X.md, lines 47, 285.
- Source: packages/campaign-engine. API or view: —.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Invalid policy/load/fault combinations and topology bounds rejected.
- Verification: campaign-engine Vitest cases.
- Mapped named source tests: 12.

## SX-ADAPTER — Live HTTP and gRPC Quorum adapter

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 285, 323.
- Source: packages/quorum-adapter;protocol/quorum/v1. API or view: Quorum control and node services.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Adapter unit/local checks and independently running nodes work. Demo does not dispatch the same canonical trace through a separate worker API.
- Verification: quorum-adapter Vitest; process lane.
- Mapped named source tests: 8.

## SX-STORE — Catalog and inventory storefront

System-X · IMPLEMENTED · MEDIUM

- Specification: SYSTEM_X.md, lines 262, 510.
- Source: crt/catalog;crt/dashboard/controlCenterHtml.js;crt/api/commerceApi.js. API or view: GET /api/products; /api/inventory/:sku; /storefront.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Real catalog search in browser and accurate stock lookup.
- Verification: SX-CRT-CATALOG; SX-CRT-STOREFRONT-UI.
- Mapped named source tests: 0.

## SX-CART — Cart creation, updates and multiple logical devices

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 262, 510.
- Source: crt/cart/cartService.js. API or view: GET /api/cart/:id; POST /api/cart/items.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Sequential multi-device path works. Concurrent lost-update protection absent.
- Verification: SX-CRT-CART.
- Mapped named source tests: 0.

## SX-CHECKOUT — Checkout saga, reservation and confirmed record

System-X · IMPLEMENTED · CRITICAL

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/checkout/checkoutSaga.js;crt/inventory/inventoryManager.js. API or view: POST /api/checkout; GET /api/orders/:id.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Correct stock, order lifecycle and rejection on insufficient inventory inside one app process.
- Verification: CRT-01; CRT-03; SX-CRT-03-HTTP.
- Mapped named source tests: 0.

## SX-IDEMP — Duplicate checkout, race and failed replay

System-X · IMPLEMENTED · CRITICAL

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/checkout/checkoutSaga.js;crt/adapter/mysqlCommerceStore.js. API or view: POST /api/checkout.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Customer-and-tenant scoped replays reproduce results. Configured MySQL serializes orders and inventory across processes.
- Verification: SX-CRT-CONCURRENT-IDEMPOTENCY; SX-CRT-FAILED-REPLAY; SX-CRT-SHARED-RESTART.
- Mapped named source tests: 0.

## SX-COMPENSATE — Payment failure and cancellation compensation

System-X · PARTIAL · CRITICAL

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/checkout/checkoutSaga.js;crt/inventory/inventoryManager.js. API or view: POST /api/checkout; POST /api/orders/:id/cancel.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Single process rollback and repeat cancellation are tested. Crash between durable state transitions requires a durable recovery workflow.
- Verification: SX-CRT-CANCEL; SX-CRT-PAYMENT-COMPENSATION.
- Mapped named source tests: 0.

## SX-EVENT — Event publication and duplicate event handling

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/events/eventBus.js. API or view: GET /api/orders/:id/events.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Duplicate dispatch check has evidence. Durable cross-process and reordered events are not demonstrated.
- Verification: CRT-13.
- Mapped named source tests: 0.

## SX-TENANT — Commerce same-SKU tenant and authenticated access

System-X · IMPLEMENTED · CRITICAL

- Specification: SYSTEM_X.md, lines 440, 510.
- Source: crt/cart/cartService.js;crt/inventory/inventoryManager.js;crt/api/commerceApi.js;crt/api/commerceAuth.js. API or view: Commerce APIs.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Verified principal scopes keys and claims. Owner-only access, role-gated stock adjustment and no cross-tenant read or mutation.
- Verification: SX-CRT-TENANT-HTTP; SX-CRT-SHARED-ACCESS; CRT-14.
- Mapped named source tests: 0.

## SX-MULTI-INSTANCE — Distributed inventory and checkout safety

System-X · IMPLEMENTED · CRITICAL

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/inventory/inventoryManager.js;crt/checkout/checkoutSaga.js;crt/adapter/mysqlCommerceStore.js. API or view: Commerce APIs.
- Dependencies: Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.
- Invariant and scope: Configured MySQL InnoDB transactions commit inventory, order, idempotency and event records together using a shared tenant lock.
- Verification: SX-CRT-SHARED-RACE; SX-CRT-SHARED-RESTART.
- Mapped named source tests: 0.

## BX-ENV — Environment, database migrations and dependency readiness

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 109, 513, 782.
- Source: packages/config-server;packages/db;apps/blackbox-api/src/health.js. API or view: /health/live; /health/startup; /health/ready; /health/dependencies.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Real MySQL, Redis, Kafka and MinIO connectivity plus migration checksums and injected outage response.
- Verification: BX-M0.
- Mapped named source tests: 3.

## BX-SECURITY — Authentication, authorization and tenant identity

Blackbox-X · PARTIAL · CRITICAL

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 513, 697, 746.
- Source: packages/security;apps/blackbox-api/src/routes. API or view: x-tenant-id headers.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Tenant predicates exist. The server accepts caller-supplied tenant headers without authenticated identity.
- Verification: security Vitest; source gap.
- Mapped named source tests: 8.

## BX-GRAPH — Typed topology graph, node/edge operations and cycles

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 513, 782.
- Source: packages/domain;apps/blackbox-api/src/routes/topology.js. API or view: /api/v1/projects; /api/v1/environments/:id/*; /api/v1/nodes/:id/operations.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Persist and validate nodes/edges; classify synchronous cycles and reject cross-scope references.
- Verification: BX-M1; domain tests.
- Mapped named source tests: 4.

## BX-RNG — Deterministic PRNG substreams and distributions

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 78, 782.
- Source: packages/statistics;packages/workload-spec. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Seeds independent and stable; inverse sampling/distribution behavior checked.
- Verification: BX-M2.
- Mapped named source tests: 16.

## BX-HIST — Histogram and sketch merging

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 78, 782.
- Source: packages/statistics. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Accuracy and merge distributions within test bounds.
- Verification: BX-M2.
- Mapped named source tests: 8.

## BX-DES — Discrete events, monotonic clock, stable ordering and canonical hash

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 782.
- Source: packages/simulation-engine. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Stable time/priority/sequence ordering and deterministic hash for equivalent inputs.
- Verification: BX-M3; simulation tests.
- Mapped named source tests: 12.

## BX-RESOURCES — CPU, thread pool and connection pool modeling

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 755.
- Source: packages/simulation-engine. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Contention and FIFO queue behavior reflected in virtual time. Real-world model accuracy is separate.
- Verification: BX-M3; simulation tests.
- Mapped named source tests: 12.

## BX-BENCH — Real HTTP benchmark, quantiles and throughput

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 782.
- Source: packages/comparison. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: A bounded local live target generates independently measurable HTTP responses.
- Verification: BX-M4.
- Mapped named source tests: 10.

## BX-COMPARE — KS, Wasserstein, model error evaluation

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 782.
- Source: packages/comparison. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Compare measured samples and modeled distribution, retaining raw test expectations.
- Verification: BX-M4; comparison tests.
- Mapped named source tests: 10.

## BX-CAPACITY — Bisection, knee detection and bottleneck attribution

Blackbox-X · PARTIAL · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 782.
- Source: packages/capacity-search. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Algorithm and persistence gate. A production-scale independently measured capacity ceiling has no dedicated run here.
- Verification: BX-M5.
- Mapped named source tests: 5.

## BX-CAL — Calibration convergence and held-out integrity

Blackbox-X · PARTIAL · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 782.
- Source: packages/calibration. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Fixed validation requirements and live measurements. Gate repeats expose MAPE instability.
- Verification: BX-M6.
- Mapped named source tests: 5.

## BX-ORCH — Redis heartbeat, Kafka dispatch and worker coordination

Blackbox-X · PARTIAL · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 731, 782.
- Source: packages/load-orchestrator. API or view: Kafka commands; Redis telemetry.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Real broker and cache tested by gate. Independently deployed worker recovery is separate.
- Verification: BX-M7.
- Mapped named source tests: 2.

## BX-LEASE — Redis TTL locks and durable epoch fencing

Blackbox-X · IMPLEMENTED · CRITICAL

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 731, 782.
- Source: packages/execution-leases. API or view: Redis and MySQL.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Lease expiry, monotonic epoch, stale writer rejection verified by gate.
- Verification: BX-M8.
- Mapped named source tests: 2.

## BX-OUTBOX — Outbox relay and idempotent inbox

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 731, 782.
- Source: packages/execution-leases. API or view: MySQL; Kafka.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Durable outbox relay and duplicate handling with actual broker.
- Verification: BX-M8.
- Mapped named source tests: 2.

## BX-CHAOS — Simulation chaos, failure propagation, blast radius, recovery

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 296, 782.
- Source: packages/chaos-engine. API or view: —.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Virtual fault schedule and upstream analysis match fixture; separate real OS behavior is outside simulation gate.
- Verification: BX-M9.
- Mapped named source tests: 5.

## BX-STORAGE — MinIO content-addressed artifacts/integrity

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 587, 782.
- Source: packages/storage. API or view: S3 API.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Stored bytes match reported SHA-256 and path/tenant restrictions.
- Verification: BX-M10.
- Mapped named source tests: 2.

## BX-ANALYTICS — Recorded time series, comparison visualizer and CDF

Blackbox-X · PARTIAL · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 513, 782.
- Source: apps/blackbox-api/src/routes/analytics.js;tests/gates/verify-m11.js. API or view: /api/v1/analytics/time-series; /api/v1/comparison/visualizer/:id.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Load-run quantiles and raw samples are written by the measured QA workflow. Legacy comparison records retain missing-data behavior. The automated production writer and authenticated tenant boundary are open.
- Verification: BX-M11.
- Mapped named source tests: 0.

## BX-PROM — Prometheus and low-cardinality metrics

Blackbox-X · IMPLEMENTED · MEDIUM

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 513, 966.
- Source: packages/observability;apps/blackbox-api/src/server.js. API or view: GET /metrics.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: M11 reaches and passes exporter assertions before later analytics failure.
- Verification: BX-M11 stage 1–2.
- Mapped named source tests: 0.

## BX-REPORT — Campaign report and MinIO artifact generation

Blackbox-X · IMPLEMENTED · HIGH

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 513, 782.
- Source: apps/blackbox-api/src/routes/analytics.js;packages/storage. API or view: GET /api/v1/campaigns/:id/report.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: M11 creates stored checksum evidence. Content hashing does not establish Object Lock.
- Verification: BX-M11 stages 3–4.
- Mapped named source tests: 2.

## BX-MULTITENANT — Multi-tenant concurrent work and recovery

Blackbox-X · PARTIAL · CRITICAL

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 782.
- Source: tests/gates/verify-m12.js. API or view: DB; Redis; S3.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: M12 exercises tenant pipelines and then relies on M11. Header authentication remains open.
- Verification: BX-M12.
- Mapped named source tests: 0.

## BX-HTTP-DASH — Blackbox HTTP dashboard

Blackbox-X · NOT YET VERIFIED · MEDIUM

- Specification: ../BLACKBOX-X/blackbox-x.md, lines 459, 513.
- Source: apps/blackbox-api/src/server.js. API or view: /.
- Dependencies: Node 24 and workspace packages. Persistence and worker gates require the matching QA services.
- Invariant and scope: Own rendered dashboard and HTTP probe controls require separate browser assertions.
- Verification: Health endpoint only in browser lane.
- Mapped named source tests: 0.

## QL-NODE — Node lifecycle, discovery and real gRPC

Quorum Lab · IMPLEMENTED · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 585.
- Source: apps/quorum-node;packages/protocol. API or view: NodeService.GetNodeState.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Three independent PIDs expose expected membership over actual sockets.
- Verification: QL-REAL-PEERS.
- Mapped named source tests: 55.

## QL-CONTROL — Control API project, cluster, node, policy and experiment management

Quorum Lab · PARTIAL · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 554.
- Source: apps/control-api. API or view: /v1/projects; /v1/clusters; /v1/experiments; /v1/runs.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Fastify in-process tests cover lifecycle. Repositories are in memory, worker dispatch durability not proven.
- Verification: Control API Vitest cases.
- Mapped named source tests: 5.

## QL-MEM — MemStore and gRPC put/get/delete

Quorum Lab · IMPLEMENTED · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 585.
- Source: apps/quorum-node/src/engine;apps/quorum-node/src/service. API or view: NodeService.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Value/tombstone behavior and lifecycle invariants.
- Verification: Q0/Q1 Vitest; process lane.
- Mapped named source tests: 0.

## QL-WAL — CRC32C, append log, snapshot, torn-write recovery

Quorum Lab · IMPLEMENTED · CRITICAL

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 362.
- Source: packages/storage. API or view: NodeService.CreateSnapshot.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Storage tests cover corruption, and killed external replica recovers committed post-snapshot WAL.
- Verification: QL-REAL-CRASH-WAL; storage Vitest cases.
- Mapped named source tests: 22.

## QL-IDEMP — Storage request idempotency and replica ack retry

Quorum Lab · IMPLEMENTED · CRITICAL

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 362.
- Source: packages/storage;apps/quorum-node/src/engine. API or view: NodeService.Put.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Idempotency excludes accidental success when quorum ACKs are missing; snapshot restores dedup state.
- Verification: Quorum node recovery and replication Vitest.
- Mapped named source tests: 22.

## QL-SYNC — Synchronous and asynchronous replication

Quorum Lab · IMPLEMENTED · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 287.
- Source: packages/replication;apps/quorum-node. API or view: NodeService.Replicate.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Programmatic tests cover quorum and sync/async peer replication. Dedicated async process-lag measurement remains open.
- Verification: replication Vitest; process lane quorum only.
- Mapped named source tests: 71.

## QL-QUORUM — Read/write quorum and majority/minority partitions

Quorum Lab · IMPLEMENTED · CRITICAL

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 228, 287.
- Source: packages/replication;apps/quorum-node. API or view: NodeService.Put/Get.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Real three-process cluster rejects isolated writes and continues with two peers.
- Verification: QL-REAL-MINORITY; QL-REAL-MAJORITY-LOSS.
- Mapped named source tests: 71.

## QL-LINEAR — Linearizable concurrent history proof

Quorum Lab · NOT YET VERIFIED · CRITICAL

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 228, 287.
- Source: packages/replication;apps/analysis-worker. API or view: —.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: No independent general concurrent linearizability checker run. Intersection alone does not prove it.
- Verification: Source gap.
- Mapped named source tests: 22.

## QL-POLICY — Five-axis consistency policy validation

Quorum Lab · IMPLEMENTED · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 228.
- Source: packages/contracts;apps/control-api. API or view: POST /v1/clusters/:id/policies.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Invalid/milestone-gated combinations rejected.
- Verification: contracts and control API Vitest.
- Mapped named source tests: 11.

## QL-SESSION — Session guarantees and history checking

Quorum Lab · PARTIAL · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 228, 445.
- Source: packages/replication;apps/analysis-worker. API or view: NodeService.Get.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Programmatic tests cover RYW/MR/MW/WFR. Independent histories and persistent client sessions remain open.
- Verification: Session guarantees Vitest.
- Mapped named source tests: 22.

## QL-CONFLICT — Vector clocks, causal ordering, LWW skew and multi-value frontiers

Quorum Lab · IMPLEMENTED · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 445.
- Source: packages/consistency;apps/quorum-node. API or view: NodeService.GetVersions.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Clock/order and concurrent conflict cases in source tests. Separate-process skew conflict audit remains open.
- Verification: consistency Vitest.
- Mapped named source tests: 78.

## QL-REPAIR — Read repair, Merkle tree, hints and tombstones

Quorum Lab · IMPLEMENTED · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 482.
- Source: packages/repair;apps/quorum-node. API or view: NodeService.ReadDigest; Repair.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: A live gRPC repair updated an existing stale key after a partition. A repaired tombstone resisted replay of the old live version.
- Verification: repair Vitest; QL-REAL-HEAL; QL-REAL-STALE-REPAIR; QL-REAL-TOMBSTONE-REPAIR.
- Mapped named source tests: 66.

## QL-FAULT — Fault schedules, delay, loss and partitions

Quorum Lab · PARTIAL · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 523, 585.
- Source: packages/fault-model;apps/quorum-node. API or view: FaultControlService.SetFault.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Real peer partitions verified. Packet duplication/reorder and storage delays not wired in peer/runtime hooks.
- Verification: Fault Vitest; process lane.
- Mapped named source tests: 62.

## QL-DUPLICATION — Fault packet duplication and reorder

Quorum Lab · MISSING · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 523, 585.
- Source: packages/fault-model/src/faultRegistry.js. API or view: FaultControlService.SetFault.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Enums accepted, but registry/interceptor does not apply these packet operations.
- Verification: Source blocker.
- Mapped named source tests: 0.

## QL-DISK-FAULT — Slow/failed storage isolation

Quorum Lab · PARTIAL · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 523, 585.
- Source: packages/fault-model;apps/quorum-node/src/app.js. API or view: FaultControlService.SetFault.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Registry has rule types, runtime queries peer scope only. No real storage stage availability proof.
- Verification: Source blocker.
- Mapped named source tests: 10.

## QL-CRASH — Node abrupt termination and restore

Quorum Lab · IMPLEMENTED · CRITICAL

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 362, 523.
- Source: apps/quorum-node;packages/storage. API or view: CLI process restart.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Abrupt kill, PID change, recovered snapshot key and subsequent WAL record.
- Verification: QL-REAL-CRASH-WAL.
- Mapped named source tests: 74.

## QL-LEADER — Leader leases and durable epoch fencing

Quorum Lab · PARTIAL · CRITICAL

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 287.
- Source: packages/replication;apps/quorum-node. API or view: NodeService.PrepareWrite/CommitWrite.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: In-process tests verify fencing. CLI config rejects LEADER, so separate-process deployment is unverified.
- Verification: Fencing Vitest; blocked process mode.
- Mapped named source tests: 71.

## QL-RAFT — Raft elections, log, majority safety, snapshot installation

Quorum Lab · PARTIAL · CRITICAL

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 287, 585.
- Source: packages/replication;apps/quorum-node. API or view: RaftService.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Programmatic Raft exists, but CLI rejects RAFT. No proven durable term/vote/log or independent failover in this audit.
- Verification: Raft Vitest; blocked process mode.
- Mapped named source tests: 71.

## QL-MTLS — mTLS authentication

Quorum Lab · PARTIAL · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 709, 725.
- Source: apps/quorum-node/src/app.js. API or view: gRPC TLS options.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Runtime tests cover cert acceptance and rejection programmatically. CLI and Kubernetes credentials remain unproven.
- Verification: mtlsSecurity Vitest.
- Mapped named source tests: 0.

## QL-BENCH — Research benchmark, telemetry and reports

Quorum Lab · PARTIAL · MEDIUM

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 72, 743.
- Source: packages/benchmarks;apps/report-worker. API or view: —.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: Generators, percentile calculations and report rendering have cases. Tier B/C production runs unavailable.
- Verification: Benchmarks and report-worker Vitest.
- Mapped named source tests: 8.

## QL-K8S — Deployment and persistent recovery on Kubernetes

Quorum Lab · NOT YET VERIFIED · HIGH

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 725.
- Source: deploy/kubernetes. API or view: Kubernetes StatefulSet.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: No authorized Kubernetes cluster supplied. Manifest discovery and local pod-name logic are not a live test.
- Verification: Blocked.
- Mapped named source tests: 0.

## QL-DASH — Quorum standalone Control API and node dashboards

Quorum Lab · PARTIAL · MEDIUM

- Specification: ../QUORUM LAB/QUORUM_LAB.md, lines 554, 771.
- Source: apps/control-api/src/dashboardTemplate.js;apps/quorum-node/src/dashboardTemplate.js. API or view: /.
- Dependencies: Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.
- Invariant and scope: HTTP liveness checked; standalone UI includes modeled views with no full browser interaction test.
- Verification: Browser lane checks control API only.
- Mapped named source tests: 0.

## CRT-01 — Checkout baseline

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-02 — Duplicate checkout

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-03 — 20 buyers for one item

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-04 — Process crash durability

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Three independent Quorum node processes and gRPC.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-05 — Partition availability

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Three independent Quorum node processes and gRPC.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-06 — Concurrent updates

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-07 — Network healing and anti-entropy

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Three independent Quorum node processes and gRPC.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-08 — Tombstone across repair

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Three independent Quorum node processes and gRPC.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-09 — Sustained load

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-10 — Leader fencing

System-X · MISSING · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-11 — Model fidelity

System-X · MISSING · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-12 — Held-out calibration

System-X · MISSING · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-13 — Duplicate event delivery

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-14 — Same-key tenant isolation

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Node 24 and the embedded Quorum lab.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.

## CRT-15 — Object retention

System-X · PARTIAL · HIGH

- Specification: SYSTEM_X.md, lines 510.
- Source: crt/scenarios/crtScenarios.js. API or view: POST /api/crt/scenarios/run/:id.
- Dependencies: Dedicated S3 Object Lock bucket and API credentials.
- Invariant and scope: Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.
- Verification: crt lane, isolated scenario invocation.
- Mapped named source tests: 0.
