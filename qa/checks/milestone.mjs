import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeNode } from '../run.mjs';

const [dir, milestone] = process.argv.slice(2);
const repo = fileURLToPath(new URL('../../../BLACKBOX-X/', import.meta.url));
const sessionFile = process.env.QA_SESSION_FILE ?? join(tmpdir(), 'portfolio-qa-session.json');
const row = {
  featureId: 'BX-' + milestone, runtimeMode: milestone === 'M3' ? 'UNIT' : 'FULL-INFRASTRUCTURE',
  expected: milestone + ' repository gate executes its declared assertions against isolated QA services and exits zero.',
};
let session;
try {
  session = JSON.parse(await readFile(sessionFile, 'utf8'));
  if (!/^portfolio-qa-\d+$/.test(session.project)) throw new Error('Invalid QA compose project.');
  for (const name of ['mysql', 'redis', 'kafka', 'minio']) {
    const status = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', session.project + '-' + name + '-1'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (status !== 'healthy') throw new Error(name + ' QA container has status ' + status);
  }
} catch (error) {
  row.result = 'BLOCKED';
  row.observed = 'Verified isolated containers are required: ' + error.message.split('\n')[0];
}
if (session && !row.result) {
  const gateLog = join(dir, 'blackbox-gate.log');
  const gatePath = 'tests/gates/verify-' + milestone.toLowerCase() + '.js';
  row.gateSourceSha256 = createHash('sha256').update(await readFile(join(repo, gatePath))).digest('hex');
  const env = {
    DATABASE_URL: 'mysql://blackbox_qa:' + encodeURIComponent(session.mysqlPassword) + '@127.0.0.1:3308/blackbox_qa',
    REDIS_URL: 'redis://127.0.0.1:6380',
    KAFKA_BROKERS: '127.0.0.1:9092',
    MINIO_ENDPOINT: 'http://127.0.0.1:9000',
    MINIO_ACCESS_KEY: session.minioUser,
    MINIO_SECRET_KEY: session.minioPassword,
  };
  const status = await executeNode([gatePath], repo, gateLog, {
    env, timeout: milestone === 'M12' ? 230000 : 45000,
  });
  let log = await readFile(gateLog, 'utf8');
  for (const value of [session.mysqlPassword, session.mysqlRootPassword, session.minioPassword].filter(Boolean)) {
    log = log.replaceAll(value, '[redacted]');
  }
  await writeFile(gateLog, log);
  row.result = status.code === 0 && !status.timedOut ? 'PASS' : 'FAIL';
  const redactedTail = log.split('\n').filter(line => line.trim()).slice(-12).join(' | ');
  row.observed = (status.timedOut ? 'Gate timeout. ' : 'Exit ' + status.code + '. ') + redactedTail;
  row.detail = 'blackbox-gate.log';
  row.durationMs = status.durationMs;
}
await writeFile(join(dir, 'observations.json'), JSON.stringify([row], null, 2));

