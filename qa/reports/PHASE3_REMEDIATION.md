# Phase 3 remediation and release decision

The [baseline summary](phase3-baseline.json) retains 444 check IDs, 424 verified ten-run checks, 53 latest failures, and 140 blocked observations. The original per-attempt evidence and source fingerprints remain in the [execution CSV](TEST_EXECUTION_RESULTS.csv).

| Prior blocker | Remediation | Evidence and remaining scope |
| --- | --- | --- |
| Anonymous order read and shared SKU overwrite | Bearer principal registry, tenant and customer scopes, role-gated inventory adjustment and owner-only order, cart, and event access | The prior [401/tenant boundary reproduction](runs/2026-11-15T03-47-27-747Z-9d72b3e0/commerce/01/observations.json) failed 10/10. The targeted [authenticated HTTP batch](runs/2026-11-15T12-40-10-305Z-4fd5d6ac/commerce/01/observations.json) passed 10/10. |
| Cross-process inventory and checkout | InnoDB tenant write lock and one transaction per operation, including order, stock, idempotency and event records | Each [shared MySQL attempt](runs/2026-11-15T12-40-10-305Z-7a231531/commerce-shared/01/observations.json) used two processes. Access, 20-buyer race and committed API restart passed 10/10. [Process evidence](runs/2026-11-15T12-40-10-305Z-7a231531/commerce-shared/01/processes.json). This covers the configured MySQL data plane and simulated payment, with no distributed payment-provider claim. |
| CRT-04/05/07/08 | Genuine crash/WAL recovery, quorum faults, explicit replay of a newer version into a stale replica, tombstone repair and attempted resurrection over gRPC | Each passed 10/10 in the [individual CRT batch](runs/2026-11-15T13-01-06-282Z-9547dd2c/). The [independent node suite](runs/2026-11-15T13-15-52-513Z-bcef03d9/process/01/observations.json) also passed its seven checks 10/10. The red diagnostic before using the actual replica-local read metadata is retained. The repair was explicitly triggered. |
| CRT-09 | Bounded five-second read/write ramp of 100 operations at 20 arrivals per second. Acceptance uses at least 19 successful operations per second, empirical p99 below 25 ms and errors below 1%. | [Individual retest](runs/2026-11-15T13-01-06-282Z-9547dd2c/CRT-09/) passed 1/10. All ten reached 20 successful operations/s and zero errors. P99 ranged from 23.08 ms to 184.72 ms. Raw samples and scheduling lag are preserved. This scope does not establish production-scale throughput. |
| CRT-10/11/12 | Release gates kept in place | Leader fencing, semantic comparison of the commerce workload, and no-leakage calibrated held-out evaluation remain open. |
| CRT-14/15 | Authenticated HTTP scenario for same-SKU data and unauthorized reads/writes. A dedicated Object Lock scenario asserts signed upload, exact-version read, digest rejection, delete denial and retained bytes. | Both scenarios passed 10/10. [CRT-14 evidence](runs/2026-11-15T13-01-06-282Z-9547dd2c/CRT-14/) · [CRT-15 evidence](runs/2026-11-15T13-01-06-282Z-9547dd2c/CRT-15/). The CRT-15 probe has its own experiment spec hash and does not stand in for master G8. |
| Blackbox-X M6 | Removed held-out percentiles and median from the model and optimizer bounds. Training and validation remained independent live HTTP runs. | Existing MAPE improvement and held-out thresholds retained. The measurements are still sensitive to timing variance. This gate uses a scaled empirical training distribution as its measured fixture. It does not implement System-X's remote optimizer contract or its 70/30 split. |
| Blackbox-X M11/M12 | M11 now creates actual bounded measured runs and a separate simulated distribution, persists worker quantiles and raw comparison samples, checks tenant filters, and reads back MinIO report bytes. M12 accumulates all nested gate failures. | [M11 targeted retest](runs/2026-11-15T12-55-12-768Z-f24ef868/M11/01/blackbox-gate.log) passed 10/10. The read path preserves null for historical rows without samples. The measured writer is exercised by the QA gate. Blackbox-X's caller-supplied tenant header still lacks authentication. |
| System-X canonical trace | Blackbox replays the same 150 operation IDs, clients, keys, types and intended time offsets. The demo and QA oracle check sequence identities before reporting descriptive metrics. | [Trace replay evidence](runs/2026-11-15T12-53-44-309Z-02c03047/comparison/01/observations.json) passed identity 10/10. Full semantic parity failed because the simulator does not execute the peer fault schedule or key-state behavior. G4 and G5 thresholds also failed. |
| Metadata-only false certification | The legacy metadata evaluation preserves its consistency checks and reports `metadataEligible` separately. Its inputs cannot issue a master certificate. Local runs now record eight individual gate decisions under a common run identity. | [Pre-fix fabricated-version probe](phase3-certificate-negative.json) returned `certified: true` with zero retained artifacts verified. The corrected comparison lane includes a repeated negative probe. |
| Integrated G1–G8 and Quorum Lab Raft | Existing acceptance criteria retained | Exact peer-fault execution, live calibrator and held-out lineage, and integrated WORM certificates remain open. The node CLI rejects Raft and Leader mode. The Raft implementation stores term and vote in memory, and snapshot installation advances indexes without installing application snapshot contents. Enabling the mode flag alone would leave the safety requirements open. Independent leader election, vote persistence, minority commits, snapshots and a concurrent-history oracle remain unverified. |

## Verdicts

- **Functional correctness** has targeted evidence for Commerce, replay and repair workflows. See [current coverage](FEATURE_COVERAGE.md) for the complete regression.
- **Distributed safety** has evidence for two-process transactional Commerce and the tested leaderless Quorum write, repair, tombstone and restart behavior.
- **Security** has direct denial evidence for authenticated Commerce boundaries. Authentication for Blackbox-X tenant headers and multi-process Quorum mTLS still require verification.
- **Simulation fidelity and performance** remain open pending the measured latency limits and full state/fault parity.
- **Deployment readiness** remains open. No integrated certificate was issued, and an authorized Kubernetes cluster was unavailable.

The first Phase 3 individual CRT batch overlapped implementation of the new handlers. Its rows are retained as diagnostic evidence. The later metadata-only false certification fix changed the System-X source after the all-project unit lane had finished. Certification-focused verification was rerun at the new revision. See source fingerprints per batch in the CSV.

The individual CRT lane produced eleven scenarios with 10/10 passes, one scenario with intermittent SLO failures, and three blocked scenarios. The [complete run-all lane](runs/2026-11-15T13-09-20-779Z-006d75e5/) invoked all fifteen handlers in order ten times. The aggregate result was nine failed and one blocked.

M6 passed 5/10 after training leakage was removed. Its five failed attempts, 02, 03, 06, 07 and 09, reported held-out MAPE of 34.82%, 32.33%, 37.01%, 42.04% and 51.92%, respectively, against the existing requirement of less than 30%. The run-level model fitted the training data more closely than the held-out data. This directly explains the failed assertions. These runs do not isolate the impact of OS scheduling from workload timing variance. [M6 retests](runs/2026-11-15T13-24-04-991Z-49fcc06f/M6/)

M12 passed 1/10. Each of the other nine attempts independently ran the entire nested milestone set and identified M6 as the failing gate. During the milestone regression M11 exposed an additional one-ULP serialization difference in the Wasserstein value. The numeric oracle now allows four floating-point epsilons while still comparing the measured CDF values exactly. The original failed observation remains recorded. The final isolated M11 batch passed 10/10 at the corrected gate revision. [M12 nested results](runs/2026-11-15T13-24-04-991Z-49fcc06f/M12/) · [M11 final retest](runs/2026-11-15T13-59-33-479Z-7ef75a7f/M11/)

The [final comparison batch](runs/2026-11-15T13-23-04-719Z-cb020b6f/comparison/) passed canonical request identity and fabricated-version rejection 10/10. Measured Quorum p99 was 84.67–396.72 ms across those ten Phase 3 regression attempts. G4, G5 and semantic trace parity each failed 10/10. The browser and current product did not issue a certificate.

## Consolidated before and after

| Measure | Previous audit | Phase 3 |
| --- | ---: | ---: |
| Distinct recorded check IDs | 444 | 454 |
| Latest checks passing 10/10 | 424 | 441 |
| Latest failed executions | 53 | 62 |
| Latest blocked observations | 140 | 61 |
| CRT handlers missing implementation | 10 | 3 |
| Master certificates issued | 0 | 0 |

Eight earlier open check IDs reached 10/10, including authenticated Commerce, six CRT scenarios, and Blackbox-X M11. The other added IDs cover cross-process assertions, trace and certificate checks, aggregate CRT execution and the revised metadata-preflight test titles. Historical IDs and all recorded failures remain present. The higher failed count includes executable checks replacing placeholders and new assertions.

The regression completed all test lanes. Its report step encountered a Windows file-open error on the CSV. A separate run of the same report generator succeeded without rerunning or replacing any test attempts. The dedicated QA containers were stopped and their volumes retained. MySQL reported exit 137 during Compose stop. [Regression console](phase3-regression.log) · [Teardown](phase3-infrastructure-stop.log) · [Final audit](FINAL_AUDIT.md)
