# Execution checkpoints

Phase 3 checkpoint and baseline-to-remediation links are recorded in [Phase 3 remediation](reports/PHASE3_REMEDIATION.md).

The evidence folders are append-only per run. A new attempt receives a fresh batch ID. Use [the runner instructions](README.md) and regenerate the consolidated reports after each phase.

| Phase | Status | Evidence or next checkpoint |
| --- | --- | --- |
| 1. Discovery | Inventory and source index generated | [Feature inventory](FEATURE_INVENTORY.md), [source index](SOURCE_INDEX.json), [manifest](feature-manifest.json) |
| 2. Sandbox | Local and dedicated Docker paths exercised | [Integration report](reports/INTEGRATION_REPORT.md). Kubernetes awaits an authorized cluster. |
| 3. Matrix | Partial | [Coverage](reports/FEATURE_COVERAGE.md) maps source-backed feature families to direct and grouped cases. Continue by adding independent coverage for unresolved rows and the ten placeholder CRT scenarios. |
| 4. Repeated checks | Executed for runnable lanes | [Execution CSV](reports/TEST_EXECUTION_RESULTS.csv). Open IDs include blocked, failed and intermittent rows. |
| 5. Browser | Chrome suite repeated on desktop and mobile | Process-level Quorum dashboard and broader frontend error/recovery state coverage remain open. |
| 6. Comparison | Ten local trials, thresholds failed | [Comparison report](reports/COMPARISON_REPORT.md). Next, connect identical trace and fault replay, then live calibration and durable gate evidence. |
| 7. Negative cases | Partial | Raw evidence covers tampered hashes, protected deletion, invalid and redirected website targets, inventory validation, sandbox payment failure, idempotency, unreachable quorum and comparison gate rejection. Distributed security and stronger consistency cases remain open. |
| 8. Defects | Focused fixes and corrected reruns recorded | [Bug report](reports/BUG_REPORT.md) links baseline and post-fix evidence. Open issues are tracked there. |
| 9. Repeatability | CLI, read-only QA panel, per-attempt artifacts, and isolated dependency setup | [Commands](README.md). Further browser and distributed cases can plug into the same runner. The browser panel reads generated records. |
| 10. Audit deliverables | Generated | [Final audit](reports/FINAL_AUDIT.md) and [artifact digests](reports/ARTIFACT_SHA256.txt). |
| 11. Acceptance | Partially verified | Repeat each added or corrected invariant ten times. Repeat the full matrix when the open release blockers have been resolved. |
