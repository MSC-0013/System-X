/**
 * I8 — Certification Gate: types.
 *
 * Defines the immutable artifact lineage model, S3/MinIO storage contract,
 * and end-to-end certification record.
 *
 * Storage requirements:
 *  - S3 bucket with object versioning enabled.
 *  - Object lock in COMPLIANCE mode (WORM) for immutability.
 *  - SHA-256 checksum per artifact, verified on upload and retrieval.
 */

/** A single artifact stored in S3/MinIO. */
export interface ArtifactRecord {
  /** Logical artifact name. */
  readonly name: string;
  /** S3 URI. Example: s3://system-x-artifacts/runs/{runId}/{name} */
  readonly uri: string;
  /** SHA-256 hex checksum of the artifact content. */
  readonly sha256: string;
  /** MIME type. */
  readonly mediaType: string;
  /** Size in bytes. */
  readonly sizeBytes: number;
  /** S3 object version ID (set by server, required for WORM verification). */
  readonly versionId?: string;
  /** Object lock mode. */
  readonly objectLockMode?: 'COMPLIANCE' | 'GOVERNANCE';
  /** Object lock retain-until date (ISO 8601). */
  readonly objectLockRetainUntil?: string;
  /** Upload timestamp (ISO 8601). */
  readonly uploadedAt: string;
}

/** The full lineage of a certified integration run. */
export interface CertificationLineage {
  /** SYSTEM-X integration run ID (correlation). */
  readonly integrationRunId: string;
  /** Experiment spec hash (reproducibility identity). */
  readonly experimentSpecHash: string;
  /** Canonical trace artifact. */
  readonly workloadTrace: ArtifactRecord;
  /** Compiled fault timeline artifact. */
  readonly faultTimeline: ArtifactRecord;
  /** QUORUM LAB raw results artifact. */
  readonly quorumResults: ArtifactRecord;
  /** BLACKBOX-X simulation results artifact. */
  readonly blackboxResults: ArtifactRecord;
  /** Comparison report artifact. */
  readonly comparisonReport: ArtifactRecord;
  /** Calibration result artifact (if calibration was run). */
  readonly calibrationResult?: ArtifactRecord;
  /** Held-out validation report artifact (if validation was run). */
  readonly validationReport?: ArtifactRecord;
}

/** Final certification decision for an integration run. */
export interface CertificationRecord {
  readonly integrationRunId: string;
  readonly experimentSpecHash: string;
  /** Whether the run passes all zero-mock end-to-end checks. */
  readonly certified: boolean;
  /** Human-readable verdict. */
  readonly verdict: string;
  /** The immutable artifact lineage. */
  readonly lineage: CertificationLineage;
  /** ISO 8601 timestamp of certification. */
  readonly certifiedAt: string;
  /** SHA-256 of the canonical JSON of the entire certification record. */
  readonly recordHash: string;
}

/** Configuration for the artifact store (MinIO/S3). */
export interface ArtifactStoreConfig {
  /** S3-compatible endpoint URL. Example: 'http://localhost:9000' */
  readonly endpoint: string;
  readonly bucketName: string;
  readonly region: string;
  /** Whether to use path-style access (required for MinIO). */
  readonly forcePathStyle: boolean;
  /** Object lock retention period in days. */
  readonly retentionDays: number;
}

export const DEFAULT_ARTIFACT_STORE_CONFIG: ArtifactStoreConfig = {
  endpoint: 'http://localhost:9000',
  bucketName: 'system-x-artifacts',
  region: 'us-east-1',
  forcePathStyle: true,
  retentionDays: 365,
};

/** Failure reason for certification. */
export type CertificationFailureReason =
  | 'COMPARISON_NOT_CERTIFIED'
  | 'ARTIFACT_MISSING'
  | 'CHECKSUM_MISMATCH'
  | 'ZERO_MOCK_VIOLATION'
  | 'LINEAGE_INCOMPLETE';
