/**
 * I8 — Certification Gate: S3/MinIO artifact store client.
 *
 * Provides:
 *  - uploadArtifact: Upload with SHA-256 checksum header + object lock.
 *  - downloadAndVerify: Download + checksum verification.
 *
 * Requirements:
 *  - Bucket must have versioning enabled (required for object lock).
 *  - Object lock in COMPLIANCE mode for WORM guarantee.
 *  - SHA-256 checksum verified on both upload (server-side) and download.
 *
 * NOTE: This client uses the S3 REST API directly (no AWS SDK)
 * to avoid adding a heavy dependency. Production deployments should
 * use @aws-sdk/client-s3 with server-side checksum validation.
 */
import { computeSha256 } from './artifactIntegrity.js';
import type { ArtifactRecord, ArtifactStoreConfig } from './types.js';

/** Error class for artifact store failures. */
export class ArtifactStoreError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ArtifactStoreError';
  }
}

/**
 * Build the S3 object key for an artifact.
 * Pattern: runs/{integrationRunId}/{artifactName}
 */
export function buildObjectKey(integrationRunId: string, artifactName: string): string {
  return `runs/${integrationRunId}/${artifactName}`;
}

/**
 * Build the S3 URI for an artifact.
 */
export function buildArtifactUri(
  config: ArtifactStoreConfig,
  integrationRunId: string,
  artifactName: string,
): string {
  const key = buildObjectKey(integrationRunId, artifactName);
  return `s3://${config.bucketName}/${key}`;
}

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
export async function uploadArtifact(
  content: string | Buffer,
  integrationRunId: string,
  artifactName: string,
  mediaType: string,
  config: ArtifactStoreConfig,
): Promise<ArtifactRecord> {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const sha256 = computeSha256(buffer);
  const sizeBytes = buffer.length;
  const key = buildObjectKey(integrationRunId, artifactName);
  const uri = buildArtifactUri(config, integrationRunId, artifactName);

  // Compute retain-until date.
  const retainUntil = new Date();
  retainUntil.setDate(retainUntil.getDate() + config.retentionDays);
  const retainUntilIso = retainUntil.toISOString();

  const url = config.forcePathStyle
    ? `${config.endpoint}/${config.bucketName}/${key}`
    : `${config.endpoint.replace('://', `://${config.bucketName}.`)}/${key}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': mediaType,
        'Content-Length': String(sizeBytes),
        'x-amz-checksum-sha256': sha256,
        'x-amz-object-lock-mode': 'COMPLIANCE',
        'x-amz-object-lock-retain-until-date': retainUntilIso,
      },
      body: buffer,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ArtifactStoreError(`Network error uploading artifact: ${msg}`, undefined, true);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ArtifactStoreError(
      `S3 upload failed with ${response.status}: ${body}`,
      response.status,
      response.status >= 500,
    );
  }

  // Extract versionId from response headers.
  const versionId = response.headers.get('x-amz-version-id') ?? undefined;

  return {
    name: artifactName,
    uri,
    sha256,
    mediaType,
    sizeBytes,
    ...(versionId !== undefined ? { versionId } : {}),
    objectLockMode: 'COMPLIANCE',
    objectLockRetainUntil: retainUntilIso,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Download an artifact from S3/MinIO and verify its SHA-256 checksum.
 *
 * @throws ArtifactStoreError if download fails or checksum mismatches.
 */
export async function downloadAndVerify(
  record: ArtifactRecord,
  config: ArtifactStoreConfig,
): Promise<Buffer> {
  const key = buildObjectKey('', record.name).replace(/^runs\//, '');
  // Re-derive key from URI.
  const s3Prefix = `s3://${config.bucketName}/`;
  const objectKey = record.uri.startsWith(s3Prefix)
    ? record.uri.slice(s3Prefix.length)
    : key;

  const url = config.forcePathStyle
    ? `${config.endpoint}/${config.bucketName}/${objectKey}`
    : `${config.endpoint.replace('://', `://${config.bucketName}.`)}/${objectKey}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ArtifactStoreError(`Network error downloading artifact: ${msg}`, undefined, true);
  }

  if (!response.ok) {
    throw new ArtifactStoreError(
      `S3 download failed with ${response.status}`,
      response.status,
      response.status >= 500,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Verify checksum.
  const computed = computeSha256(buffer);
  if (computed !== record.sha256) {
    throw new ArtifactStoreError(
      `Checksum mismatch for artifact '${record.name}': expected ${record.sha256}, got ${computed}`,
      undefined,
      false,
    );
  }

  return buffer;
}
