# Three-project QA

The runner uses the existing repositories and application entry points. It records a new evidence batch per command under `qa/reports/runs/`. The CSV includes original failures and later revisions. Save those directories if you move the workspace.

Run from the System-X root with Node.js 24. Build System-X and Quorum Lab with `pnpm build` in their respective roots and Blackbox-X with `npm run build`. The browser lanes require installed Google Chrome. Only local fixtures are configured. Set `SANDBOX_TARGET_URL` separately for any future approved external test. The shipped harness does not use it to send traffic.

```powershell
node qa/run.mjs --lane=suite --project=SX --repeat=10
node qa/run.mjs --lane=suite --project=BX --repeat=10
node qa/run.mjs --lane=suite --project=QL --repeat=10
node qa/run.mjs --lane=suite --repeat=10
node qa/run.mjs --lane=suite '--feature=REPLACE_WITH_NAMED_CASE_ID' --repeat=1
node qa/run.mjs --lane=crt --feature=CRT-03 --repeat=10
node qa/run.mjs --lane=crt --repeat=10
node qa/run.mjs --lane=commerce --repeat=10
node qa/run.mjs --lane=commerce-shared --repeat=10 --strict
node qa/run.mjs --lane=crt-all --repeat=10 --strict
node qa/run.mjs --lane=process --repeat=10
node qa/run.mjs --lane=browser --repeat=10
node qa/run.mjs --lane=comparison --repeat=10
node qa/run.mjs --lane=milestone --feature=M7 --repeat=10
node qa/run.mjs --lane=milestone --repeat=10
node qa/run.mjs --lane=worm --repeat=10
node qa/report.mjs
```

For a sequential ecosystem regression, start the isolated Docker stack and run `pwsh -File qa/regression.ps1 -Repeat 10`. It writes evidence for all lanes and returns a failure status if any selected case failed or was blocked.

## Commerce authentication and persistence

The bundled catalog and health endpoints are public. Configure `CRT_AUTH_PRINCIPALS` as a JSON array of server-provisioned `{tokenSha256, tenantId, customerId, role}` records. Generate a random token with at least 256 bits of entropy, give the token to the corresponding caller through a private channel, and store its lowercase SHA-256 hex digest in the server configuration. Authenticate with `Authorization: Bearer <token>`. Roles are `shopper` and `inventory-admin`. The inventory admin role can adjust its own tenant's available stock. Order and cart authorization still require ownership. Anonymous protected calls receive 401, forged identities 403, and inaccessible orders or carts 404.

Set `CRT_DATABASE_URL` to use MySQL InnoDB and configure the same `CRT_DATA_NAMESPACE` and principal registry across API processes. Installation creates the two CRT tables if needed. A transaction holds a tenant row lock and commits inventory reservations, orders, idempotency mapping, and the persisted event history together. Checkout payment remains the testbed's simulator. In this configuration, authenticated calls do not seed or read the embedded Quorum scenario WAL. That WAL uses the previous local lab data plane, and its historical unscoped records are left physically intact. Migration into the scoped store requires an explicit ownership-validated import.

The `commerce-shared` lane starts two independent loopback API processes with a random storage namespace on the dedicated QA MySQL database. It restarts the first process and removes only rows in that attempt's namespace after collecting evidence. `crt-all` calls the real `runAll()` suite and saves all individual results. CRT-15 requires an Object Lock-enabled QA bucket. On a fresh sandbox, initialize the bucket via `node qa/run.mjs --lane=worm --repeat=1 --strict` before the scenario lanes.

The loopback Control Center has a QA Evidence link. It shows the recorded count, expected outcome, runtime mode and latest status per check. The CLI runs checks and the CSV carries the individual attempts and detailed observations.

The optional hosted checks are `node qa/run.mjs --lane=hosted --repeat=10 --strict`, `--lane=hosted-shop`, and `--lane=hosted-cart`. They use the published Postman Echo service and Automation Exercise practice shop. The Echo workflow sends three sequential synthetic requests per attempt. The Chrome workflows use a fresh context and do not create accounts or submit checkout. These lanes are separate from the controlled performance and fault gates. [Hosted evidence](reports/HOSTED_SANDBOX.md)

The `suite` lane records each named Vitest assertion from a fresh process per attempt. A process failure before assertions begin is recorded separately. `--feature` selects one exact title and source file from the manifest. The grouped browser and process lanes expose several related assertions with the same attempt and trace evidence and do not count a result twice toward the same ID. The runner continues through failed attempts and writes the evidence. Use `--strict` for a nonzero exit when the selected verification batch contains failed or blocked results.

The process lane terminates only its own isolated node children. It uses ephemeral ports, one WAL directory per process and abrupt termination for restart proof. The CRT lane starts fresh WAL directories per scenario invocation. A scenario handler that reports UNVERIFIED is recorded BLOCKED with zero completed business verification. No testcase retries an entire failed attempt.

## Isolated Docker infrastructure

Only the milestone and WORM lanes need these services. They reject a session without a dedicated QA Compose project. Several inherited Blackbox-X gates hard-code localhost ports and test bucket credentials, so the isolated stack binds them only to loopback. Existing listeners on ports 3308, 6380, 9092, or 9000 must be left alone. The PowerShell setup script refuses to start on occupied ports. Pull the specified images, or explicitly pass the compatible cached tags after verifying image versions.

```powershell
pwsh -File qa/sandbox.ps1 -Action Start
# For verified matching cached tags:
pwsh -File qa/sandbox.ps1 -Action Start -UseCachedImages
pwsh -File qa/sandbox.ps1 -Action Status
pwsh -File qa/sandbox.ps1 -Action Stop
```

Set `QA_SESSION_FILE` to the private session metadata path if it differs from the default in your temporary directory. Never copy that file into reports. Stop preserves the QA volumes and the session metadata. Start again only after verifying the same QA project and vacant ports. The QA Object Lock test creates a dedicated bucket and denies deletion of the new protected versions. Preserve evidence before changing the sandbox.

## Reading results

- [Feature inventory](FEATURE_INVENTORY.md) and [machine-readable manifest](feature-manifest.json) contain source and document references.
- [Final audit](reports/FINAL_AUDIT.md), [coverage](reports/FEATURE_COVERAGE.md), and [execution CSV](reports/TEST_EXECUTION_RESULTS.csv) contain executed denominators.
- UNIT includes named pure/isolated test cases. LOCAL-FALLBACK includes real engines within one OS process and Fastify injection or simulated ports. REAL-INTEGRATION means separate server processes and real network calls. FULL-INFRASTRUCTURE means the selected check exercised actual infrastructure as documented in its log.
- A 10/10 result applies to the stated invariant and runtime mode. Several package and source promises are broader than the logged cases.

