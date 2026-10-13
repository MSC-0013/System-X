import type { ArtifactRecord, ArtifactStoreConfig } from './types.js';
/** Error class for artifact store failures. */
export declare class ArtifactStoreError extends Error {
    readonly statusCode?: number | undefined;
    readonly retryable: boolean;
    constructor(message: string, statusCode?: number | undefined, retryable?: boolean);
}
/**
 * Build the S3 object key for an artifact.
 * Pattern: runs/{integrationRunId}/{artifactName}
 */
export declare function buildObjectKey(integrationRunId: string, artifactName: string): string;
/**
 * Build the S3 URI for an artifact.
 */
export declare function buildArtifactUri(config: ArtifactStoreConfig, integrationRunId: string, artifactName: string): string;
/**
 * Upload an artifact to S3/MinIO with:
 *  - SHA-256 checksum as x-amz-checksum-sha256 header.
 *  - Object lock in COMPLIANCE mode (WORM).
 *  - Retention period from config.retentionDays.
 *
 * @param content         Artifact content (JSON string or Buffer).
 * @param integrationRunId Correlation ID (used for key prefix).
 * @param artifactName    Logical artifact name.
 * @param mediaType       MIME type.
 * @param config          S3 store config.
 * @returns               ArtifactRecord with versionId from server response.
 */
export declare function uploadArtifact(content: string | Buffer, integrationRunId: string, artifactName: string, mediaType: string, config: ArtifactStoreConfig): Promise<ArtifactRecord>;
/**
 * Download an artifact from S3/MinIO and verify its SHA-256 checksum.
 *
 * @throws ArtifactStoreError if download fails or checksum mismatches.
 */
export declare function downloadAndVerify(record: ArtifactRecord, config: ArtifactStoreConfig): Promise<Buffer>;
//# sourceMappingURL=artifactStore.d.ts.map