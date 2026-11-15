import { S3Client, PutObjectCommand, GetObjectCommand, GetObjectRetentionCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { computeSha256 } from './artifactIntegrity.js';

export class ArtifactStoreError extends Error {
    constructor(message, statusCode, retryable = false) {
        super(message);
        this.name = 'ArtifactStoreError';
        this.statusCode = statusCode;
        this.retryable = retryable;
    }
}

export function buildObjectKey(integrationRunId, artifactName) {
    return 'runs/' + integrationRunId + '/' + artifactName;
}

export function buildArtifactUri(config, integrationRunId, artifactName) {
    return 's3://' + config.bucketName + '/' + buildObjectKey(integrationRunId, artifactName);
}

function connect(config) {
    return new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: config.credentials,
        maxAttempts: 1,
    });
}

async function send(client, command) {
    try {
        return await client.send(command, { abortSignal: AbortSignal.timeout(10000) });
    } catch (error) {
        const status = error.$metadata?.httpStatusCode;
        throw new ArtifactStoreError('S3 request failed: ' + (error.name ?? 'Error') + ': ' + error.message, status, !status || status >= 500);
    }
}

/** Upload signed checksummed bytes and read the store's retention for the resulting version. */
export async function uploadArtifact(content, integrationRunId, artifactName, mediaType, config) {
    if (!Number.isInteger(config.retentionDays) || config.retentionDays < 1) {
        throw new ArtifactStoreError('retentionDays must be a positive integer.');
    }
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const sha256 = computeSha256(buffer);
    const retainUntil = new Date(Date.now() + config.retentionDays * 86400000);
    const object = { Bucket: config.bucketName, Key: buildObjectKey(integrationRunId, artifactName) };
    const client = connect(config);
    try {
        const result = await send(client, new PutObjectCommand({
            ...object,
            Body: buffer,
            ContentType: mediaType,
            ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
            ObjectLockMode: 'COMPLIANCE',
            ObjectLockRetainUntilDate: retainUntil,
        }));
        if (!result.VersionId || result.VersionId === 'null') {
            throw new ArtifactStoreError('Object store did not return a version ID.');
        }
        const { Retention } = await send(client, new GetObjectRetentionCommand({ ...object, VersionId: result.VersionId }));
        // S3 responses can round timestamps to whole seconds.
        if (Retention?.Mode !== 'COMPLIANCE' || !(Retention.RetainUntilDate instanceof Date) ||
            Retention.RetainUntilDate.getTime() < retainUntil.getTime() - 1000) {
            throw new ArtifactStoreError('Object store did not confirm the requested COMPLIANCE retention.');
        }
        return {
            name: artifactName, uri: buildArtifactUri(config, integrationRunId, artifactName), sha256, mediaType,
            sizeBytes: buffer.length, versionId: result.VersionId, objectLockMode: Retention.Mode,
            objectLockRetainUntil: Retention.RetainUntilDate.toISOString(), uploadedAt: new Date().toISOString(),
        };
    } finally { client.destroy(); }
}

/** Read and verify the recorded object version, rather than the latest object at the same key. */
export async function downloadAndVerify(record, config) {
    const prefix = 's3://' + config.bucketName + '/';
    if (!record.uri.startsWith(prefix) || !record.versionId || record.versionId === 'null') {
        throw new ArtifactStoreError('Artifact must record its exact version in the configured bucket.');
    }
    const client = connect(config);
    try {
        const { Body } = await send(client, new GetObjectCommand({
            Bucket: config.bucketName, Key: record.uri.slice(prefix.length), VersionId: record.versionId,
        }));
        const buffer = Buffer.from(await Body.transformToByteArray());
        if (computeSha256(buffer) !== record.sha256) {
            throw new ArtifactStoreError('Checksum mismatch for artifact ' + record.name + '.');
        }
        return buffer;
    } finally { client.destroy(); }
}

/** Upload an isolated probe and require the object store to deny deletion of its exact version. */
export async function verifyRetentionProbe(content, probeId, config) {
    const name = 'retention-probe.json';
    const record = await uploadArtifact(content, probeId, name, 'application/json', config);
    const client = connect(config);
    let deniedStatus;
    try {
        await client.send(new DeleteObjectCommand({
            Bucket: config.bucketName, Key: buildObjectKey(probeId, name), VersionId: record.versionId,
        }), { abortSignal: AbortSignal.timeout(10000) });
    } catch (error) {
        const status = error.$metadata?.httpStatusCode;
        if (status !== 403 && !(status === 400 && error.name === 'InvalidRequest' && /WORM protected/i.test(error.message))) throw error;
        deniedStatus = status;
    } finally {
        client.destroy();
    }
    if (!deniedStatus) throw new ArtifactStoreError('Store allowed deletion of the retained probe version.');
    const readBack = await downloadAndVerify(record, config);
    if (!readBack.equals(Buffer.from(content))) throw new ArtifactStoreError('Probe bytes differ from canonical artifact.');
    return { record, deniedStatus };
}

