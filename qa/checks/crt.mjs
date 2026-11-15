import { strict as assert } from 'node:assert';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { QuorumAdapter } from '../../crt/adapter/quorumAdapter.js';
import { CrtScenarioSuite } from '../../crt/scenarios/crtScenarios.js';

const [dir, scenarioId] = process.argv.slice(2);
const dataRoot = join(dir, 'quorum-data');
await mkdir(dataRoot, { recursive: true });
const adapter = new QuorumAdapter({ dataRoot });
let row = { featureId: scenarioId === 'all' ? 'SX-CRT-SUITE' : scenarioId, runtimeMode: 'LOCAL-FALLBACK',
  expected: 'Scenario-specific business and storage assertions run on fresh stock and WAL state.' };
try {
  await adapter.initializeCluster();
  let artifactStore;
  if (scenarioId === 'CRT-15' || scenarioId === 'all') {
    try {
      const session = JSON.parse(await readFile(process.env.QA_SESSION_FILE ?? join(tmpdir(), 'portfolio-qa-session.json'), 'utf8'));
      assert.match(session.project, /^portfolio-qa-\d+$/);
      const status = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', session.project + '-minio-1'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (status === 'healthy') artifactStore = { endpoint: 'http://127.0.0.1:9000', bucketName: 'system-x-qa-object-lock',
        credentials: { accessKeyId: session.minioUser, secretAccessKey: session.minioPassword },
        region: 'us-east-1', forcePathStyle: true, retentionDays: 1 };
    } catch { /* Scenario will report its missing dedicated infrastructure. */ }
  }
  const suite = new CrtScenarioSuite(adapter, { artifactStore, processEvidenceDir: join(dir, 'processes') });
  if (scenarioId === 'all') {
    const outcomes = await suite.runAll();
    await writeFile(join(dir, 'scenario.json'), JSON.stringify(outcomes, null, 2));
    assert.deepEqual(outcomes.map(outcome => outcome.scenarioId), Array.from({ length: 15 }, (_, i) => 'CRT-' + String(i + 1).padStart(2, '0')));
    row.runtimeMode = 'MIXED';
    row.expected = 'The full CRT suite runs all fifteen named scenarios in order. No scenario failure or blocker is hidden.';
    row.observed = JSON.stringify(outcomes.map(outcome => [outcome.scenarioId, outcome.status ?? (outcome.passed ? 'PASS' : 'FAIL')]));
    row.result = outcomes.some(outcome => !outcome.passed && outcome.status !== 'UNVERIFIED') ? 'FAIL' :
      outcomes.some(outcome => !outcome.passed) ? 'BLOCKED' : 'PASS';
  } else {
  const result = await suite.runScenario(scenarioId);
  row.runtimeMode = result.runtimeMode ?? row.runtimeMode;
  await writeFile(join(dir, 'scenario.json'), JSON.stringify(result, null, 2));
  if (result.status === 'UNVERIFIED') {
    row = { ...row, result: 'BLOCKED', observed: result.reason };
  } else {
    assert.equal(result.scenarioId, scenarioId);
    assert.equal(result.passed, true);
    assert.ok(result.assertions.length && result.assertions.every(a => a.verdict === 'PASS'));
    if (scenarioId === 'CRT-03') {
      const stock = await suite.inventory.getStock('PHONE-001');
      assert.deepEqual(result.metrics, { totalRequests: 20, successfulRequests: 1, failedRequests: 19, oversoldItems: 0 });
      assert.equal(stock.available, 0);
      assert.equal(stock.reserved, 1);
      row.expected = '20 concurrent attempts, 1 confirmed, 19 rejected, stock zero, 1 reservation, no overselling.';
      row.observed = JSON.stringify({ ...result.metrics, stockAvailable: stock.available, stockReserved: stock.reserved });
    } else {
      row.observed = result.assertions.map(a => a.observed).join(' | ');
    }
    row.result = 'PASS';
  }
  }
} catch (error) {
  row.result = 'FAIL';
  row.observed = error.message;
  console.error(error);
} finally {
  await adapter.shutdownCluster();
  await writeFile(join(dir, 'observations.json'), JSON.stringify([row], null, 2));
}
if (row.result === 'FAIL') process.exitCode = 1;
