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
export const DEFAULT_ARTIFACT_STORE_CONFIG = {
    endpoint: 'http://localhost:9000',
    bucketName: 'system-x-artifacts',
    region: 'us-east-1',
    forcePathStyle: true,
    retentionDays: 365,
};
//# sourceMappingURL=types.js.map