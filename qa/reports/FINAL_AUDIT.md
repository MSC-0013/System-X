# Final ecosystem audit

**PARTIALLY VERIFIED. Full certification and production readiness remain open.**

- Specification-level entries: 90 (75 feature families and 15 named scenarios).
- Distinct named Vitest assertions observed, including superseded assertions: 379. Distinct check IDs across all lanes: 459.
- Current direct check plan denominator: 459 checks × 10 = 4590 slots. This excludes documented claims with no independent check.
- Latest-batch actual executions: 4529 (4471 passed, 58 failed). Latest-batch blocked observations: 61.
- All recorded rows including prior revisions and diagnostics: 13907 · 13245 passed · 216 failed · 446 blocked · 0 skipped.
- Latest-batch checks verified at 10/10 in stated runtime scope: 444.
- Latest-batch intermittent check IDs: BX-M12, BX-M6, CRT-09, SX-HOSTED-CART-CHROME, SX-HOSTED-SHOP-CHROME.

Outstanding directly recorded results:

- **BX-M12** INTERMITTENT FAILURES · 10/10 actual executions · 1 failed, 0 blocked.
- **BX-M6** INTERMITTENT FAILURES · 10/10 actual executions · 4 failed, 0 blocked.
- **CRT-09** INTERMITTENT FAILURES · 10/10 actual executions · 9 failed, 0 blocked.
- **CRT-10** BLOCKED · 0/10 actual executions · 0 failed, 10 blocked.
- **CRT-11** BLOCKED · 0/10 actual executions · 0 failed, 10 blocked.
- **CRT-12** BLOCKED · 0/10 actual executions · 0 failed, 10 blocked.
- **SX-CRT-SUITE** FAILED · 9/10 actual executions · 9 failed, 1 blocked.
- **SX-G4** FAILED · 10/10 actual executions · 10 failed, 0 blocked.
- **SX-G5** FAILED · 10/10 actual executions · 10 failed, 0 blocked.
- **SX-G6** BLOCKED · 0/10 actual executions · 0 failed, 10 blocked.
- **SX-G7** BLOCKED · 0/10 actual executions · 0 failed, 10 blocked.
- **SX-G8** BLOCKED · 0/10 actual executions · 0 failed, 10 blocked.
- **SX-HOSTED-CART-CHROME** INTERMITTENT FAILURES · 10/10 actual executions · 4 failed, 0 blocked.
- **SX-HOSTED-SHOP-CHROME** INTERMITTENT FAILURES · 10/10 actual executions · 1 failed, 0 blocked.
- **SX-TRACE-PARITY** FAILED · 10/10 actual executions · 10 failed, 0 blocked.

Release blockers include independent-process Raft, calibrated peer-fault and key-state parity, and the complete G1–G8 lineage and certificate. Commerce has an explicitly configured MySQL transactional mode. Embedded commerce retains process-local semantics. The controlled Docker stack does not establish production availability or Kubernetes behavior.

[Hosted sandbox](HOSTED_SANDBOX.md) · [Phase 3 before-and-after](PHASE3_REMEDIATION.md) · [Coverage](FEATURE_COVERAGE.md) · [Execution CSV](TEST_EXECUTION_RESULTS.csv) · [Comparison](COMPARISON_REPORT.md) · [Bugs](BUG_REPORT.md) · [Integration](INTEGRATION_REPORT.md)