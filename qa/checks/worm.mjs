import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { uploadArtifact, downloadAndVerify } from '@system-x/certification-gate';

const dir = process.argv[2];
const load = createRequire(new URL('../../../BLACKBOX-X/packages/storage/package.json', import.meta.url));
const { S3Client, CreateBucketCommand, GetBucketVersioningCommand, GetObjectRetentionCommand, DeleteObjectCommand } = load('@aws-sdk/client-s3');
const row = {
  featureId: 'SX-WORM-STORAGE', runtimeMode: 'FULL-INFRASTRUCTURE',
  expected: 'Real authenticated upload to versioned MinIO, verified COMPLIANCE retention, checksum of exact version, version deletion denied.',
};
let client;
let session;
try {
  session = JSON.parse(await readFile(process.env.QA_SESSION_FILE ?? join(tmpdir(), 'portfolio-qa-session.json'), 'utf8'));
  if (!/^portfolio-qa-\d+$/.test(session.project)) throw new Error('QA project required.');
  const healthy = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', session.project + '-minio-1'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (healthy !== 'healthy') throw new Error('Isolated MinIO container is unavailable.');
} catch (error) {
  row.result = 'BLOCKED';
  row.observed = error.message.split('\n')[0];
}
if (!row.result) {
  try {
    const bucket = 'system-x-qa-object-lock';
    const endpoint = 'http://127.0.0.1:9000';
    const region = 'us-east-1';
    const credentials = { accessKeyId: session.minioUser, secretAccessKey: session.minioPassword };
    const config = { endpoint, region, credentials, forcePathStyle: true, bucketName: bucket, retentionDays: 1 };
    client = new S3Client({ endpoint, region, credentials, forcePathStyle: true, maxAttempts: 1 });
    try { await client.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true })); }
    catch (error) { if (error.name !== 'BucketAlreadyOwnedByYou') throw error; }
    const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    assert.equal(versioning.Status, 'Enabled');
    const content = JSON.stringify({ acceptance: 'sha256', run: randomUUID() });
    const run = randomUUID();
    const name = 'proof.json';
    const artifact = await uploadArtifact(content, run, name, 'application/json', config);
    assert.ok(artifact.versionId);
    const target = { Bucket: bucket, Key: 'runs/' + run + '/' + name, VersionId: artifact.versionId };
    const retention = await client.send(new GetObjectRetentionCommand(target));
    assert.equal(retention.Retention?.Mode, 'COMPLIANCE');
    assert.ok(retention.Retention.RetainUntilDate > new Date());
    assert.equal((await downloadAndVerify(artifact, config)).toString('utf8'), content);
    await assert.rejects(downloadAndVerify({ ...artifact, sha256: '0'.repeat(64) }, config), /checksum mismatch/i);
    let deleteHttp;
    await assert.rejects(client.send(new DeleteObjectCommand(target)), error => {
      deleteHttp = error.$metadata?.httpStatusCode;
      return deleteHttp === 403 || (deleteHttp === 400 && error.name === 'InvalidRequest' && /WORM protected/i.test(error.message));
    });
    assert.equal((await downloadAndVerify(artifact, config)).toString('utf8'), content, 'Denied deletion must leave the exact version accessible');
    row.result = 'PASS';
    row.observed = JSON.stringify({ versioned: true, retention: retention.Retention, sha256: artifact.sha256, deleteHttp, alteredHashRejected: true });
  } catch (error) {
    row.result = 'FAIL';
    row.observed = error.message;
  } finally {
    client?.destroy();
  }
}
await writeFile(join(dir, 'observations.json'), JSON.stringify([row], null, 2));
