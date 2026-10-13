/**
 * I8 — Certification Gate: Main certification evaluator.
 *
 * Evaluates whether an integration run meets all end-to-end certification criteria:
 *  1. ComparisonReport must be certified (KS + MAPE gates from I5).
 *  2. Lineage must be complete (all 5 mandatory artifacts present).
 *  3. All artifact checksums must be SHA-256 hex (64 chars).
 *  4. Zero-mock verification: all artifacts must have a versionId
 *     (proof they were actually uploaded to S3, not mocked in memory).
 *
 * Produces a CertificationRecord with a stable recordHash.
 */
import type { ComparisonReport } from '@system-x/comparison-engine';
import type { CertificationRecord, CertificationLineage, ExecutionEnvironmentProvenance } from './types.js';
/**
 * Evaluate all certification criteria and produce an immutable CertificationRecord.
 *
 * @param integrationRunId   Correlation ID.
 * @param experimentSpecHash Reproducibility identity hash.
 * @param comparison         ComparisonReport from I5.
 * @param lineage            Full artifact lineage (from I8 upload step).
 * @param requireVersionId   If true, all artifacts must have a versionId (zero-mock check).
 * @param certifiedAt        Optional ISO timestamp (defaults to current time).
 * @param environmentOverride Optional environment provenance (defaults to current process info).
 */
export declare function evaluateCertification(integrationRunId: string, experimentSpecHash: string, comparison: ComparisonReport, lineage: CertificationLineage, requireVersionId?: boolean, certifiedAt?: string, environmentOverride?: ExecutionEnvironmentProvenance): CertificationRecord;
//# sourceMappingURL=certificationGate.d.ts.map