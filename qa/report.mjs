import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const qa = path.join(root, 'qa');
const out = path.join(qa, 'reports');
const repo = {
  SX: { name: 'System-X', root, doc: 'SYSTEM_X.md' },
  BX: { name: 'Blackbox-X', root: path.resolve(root, '../BLACKBOX-X'), doc: 'blackbox-x.md' },
  QL: { name: 'Quorum Lab', root: path.resolve(root, '../QUORUM LAB'), doc: 'QUORUM_LAB.md' },
};
const rel = (target) => path.relative(root, target).replaceAll('\\','/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const textFile = (file, value) => writeFile(file, value, 'utf8');
const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, char => char === '<' ? '&lt;' : '&gt;').trim();
const wrapPath = value => '<' + value + '>';
const reportLink = source => '[' + source.split('/').at(-1) + '](' + wrapPath(path.relative(out, path.resolve(root, source)).replaceAll('\\', '/')) + ')';
async function walk(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  }))).flat();
}

const sources = {};
for (const [key, project] of Object.entries(repo)) {
  const docPath = path.join(project.root, project.doc);
  const body = await readFile(docPath, 'utf8');
  const lines = body.split(/\r?\n/);
  const headings = [];
  const claims = [];
  for (const [i, line] of lines.entries()) {
    if (/^#{1,4} /.test(line)) headings.push({ line: i + 1, heading: line.replace(/^#+ /, '') });
    if (/\|\s*(?:\*\*)?(?:PASS(?:ED)?|IMPLEMENTED)\b|\b(?:100%|CERTIFIED|WORM)\b/i.test(line)) {
      claims.push({ line: i + 1, text: line.trim() });
    }
  }
  const paths = execFileSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'], { cwd: project.root, maxBuffer: 32 * 1024 * 1024 })
    .toString().split('\0').filter(Boolean);
  const files = [...new Set(paths)].filter(file =>
    !/(^|\/)(qa\/reports|node_modules|dist|artifacts)\//.test(file) &&
    !/(^|\/)(\.env($|\.(?!example)))/.test(file) &&
    /\.(?:[cm]?js|md|json|ya?ml|proto|sql)$|(^|\/)(Dockerfile|\.env\.example)$/.test(file)
  ).filter(file => existsSync(path.join(project.root, file))).sort();
  const routes = [];
  for (const file of files.filter(file => /\.(?:[cm]?js|proto)$/.test(file) && /^(apps|gate|crt|packages\/protocol)\//.test(file))) {
    const fileLines = (await readFile(path.join(project.root, file), 'utf8')).split(/\r?\n/);
    for (const [i, line] of fileLines.entries()) {
      if (/(?:\.(?:get|post|put|delete|patch)\(\s*['"]\/|pathname\s*(?:===|\.startsWith)\s*[('"]|^\s*rpc\s+[a-z]+\()/i.test(line)) {
        routes.push({ path: file, line: i + 1, declaration: line.trim() });
      }
    }
  }
  const packageJson = JSON.parse(await readFile(path.join(project.root, 'package.json'), 'utf8'));
  sources[key] = {
    name: project.name, doc: rel(docPath), sha256: hash(body), specificationLines: lines.length, headings, claims,
    files, routes, declaredRuntime: packageJson.engines, declaredPackageManager: packageJson.packageManager, scripts: packageJson.scripts,
  };
}

const evidencePaths = (await walk(path.join(out, 'runs'))).filter(file => /(?:^|[./\\])records\.json$/.test(file));
const records = [];
for (const file of evidencePaths.sort()) {
  let parsed;
  try { parsed = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
  const batch = path.relative(path.join(out, 'runs'), file).split(path.sep)[0];
  for (const row of parsed) {
    records.push({
      ...row,
      runtimeMode: row.featureId === 'BX-M3' ? 'UNIT' : row.runtimeMode,
      batch, recordFile: rel(file),
    });
  }
}
records.sort((a,b) => a.timestamp.localeCompare(b.timestamp) || a.featureId.localeCompare(b.featureId));
const histories = new Map();
for (const record of records) {
  if (!histories.has(record.featureId)) histories.set(record.featureId, new Map());
  const history = histories.get(record.featureId);
  if (!history.has(record.batch)) history.set(record.batch, []);
  history.get(record.batch).push(record);
}
const latest = [...histories].map(([id, runs]) => {
  const all = [...runs.values()];
  const group = all.at(-1);
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0 };
  for (const row of group) counts[row.result]++;
  return {
    featureId: id, project: group[0].project, label: group[0].title ?? group[0].expected,
    runtimeMode: group[0].runtimeMode, counts, completed: counts.PASS + counts.FAIL,
    batch: group[0].batch, source: group[0].source ?? null, artifact: group[0].artifact,
    status: counts.PASS === 10 && !counts.FAIL ? 'VERIFIED 10/10 in stated scope' :
      counts.FAIL && counts.PASS ? 'INTERMITTENT FAILURES' : counts.FAIL ? 'FAILED' :
      counts.BLOCKED && !counts.PASS ? 'BLOCKED' : 'INCOMPLETE',
    historicalFailures: all.slice(0, -1).flat().filter(row => row.result === 'FAIL').length,
  };
}).sort((a,b) => a.featureId.localeCompare(b.featureId));
const assertions = latest.filter(row => /^[A-Z]+-T-/.test(row.featureId)).map(row => ({
  featureId: row.featureId, project: row.project, source: row.source, title: row.label, runtimeMode: row.runtimeMode,
}));

const definitions = (await readFile(path.join(qa, 'features.psv'), 'utf8')).split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const [id, name, sections, source, endpoint, implementation, risk, invariant, method] = line.split('|');
  const projectKey = id.slice(0, 2);
  const definition = { id, name, project: repo[projectKey].name, sections, source, endpoint, implementation, risk, invariant, method };
  definition.dependencies = projectKey === 'SX' ? 'Node 24, workspace packages, Chromium for UI. Applicable runs use Quorum/Blackbox and MinIO.' :
    projectKey === 'BX' ? 'Node 24 and workspace packages. Persistence and worker gates require the matching QA services.' :
    'Node 24, protobuf and gRPC. Process cases use independent loopback ports and WAL directories.';
  definition.document = sources[projectKey].doc;
  definition.documentLines = sections.split(',').map(section => sources[projectKey].headings.find(item => item.heading.startsWith(section + '. '))?.line).filter(Boolean);
  definition.evidence = latest.filter(row => method.includes(row.featureId));
  const sourceRoots = source.split(';').map(value => {
    const info = path.resolve(repo[projectKey].root, value);
    return { path: value, exists: existsSync(info), isDirectory: existsSync(info) && !/\.[cm]?js$/.test(value) };
  });
  definition.sourceRefs = sourceRoots.map(({ path: source }) => ({ path: source, exists: existsSync(path.resolve(repo[projectKey].root, source)) }));
  const packageRoots = sourceRoots.filter(value => value.isDirectory).map(value => value.path.replace(/\/src\/?$/, ''));
  definition.existingTests = assertions.filter(row => row.project === definition.project &&
    packageRoots.some(value => row.source.startsWith(value + '/'))).map(row => row.featureId);
  definition.missingTests = implementation === 'IMPLEMENTED' ? 'Results apply only to the recorded invariant and runtime. See linked cases for exact scope.' : invariant;
  return definition;
});
const crtLabels = ['Checkout baseline', 'Duplicate checkout', '20 buyers for one item', 'Process crash durability', 'Partition availability',
  'Concurrent updates', 'Network healing and anti-entropy', 'Tombstone across repair', 'Sustained load', 'Leader fencing',
  'Model fidelity', 'Held-out calibration', 'Duplicate event delivery', 'Same-key tenant isolation', 'Object retention'];
const crtDefinitions = crtLabels.map((name,index) => ({
  id: 'CRT-' + String(index + 1).padStart(2,'0'), name, project:'System-X', document: 'SYSTEM_X.md', documentLines: [510],
  source: 'crt/scenarios/crtScenarios.js', endpoint: 'POST /api/crt/scenarios/run/:id',
  implementation: [9,10,11].includes(index) ? 'MISSING' : 'PARTIAL', risk: 'HIGH', method: 'crt lane, isolated scenario invocation',
  invariant: 'Run documented scenario independently with fresh WAL and stock. Status is limited to its implemented assertions.',
  dependencies: [3,4,6,7].includes(index) ? 'Three independent Quorum node processes and gRPC.' :
    index === 14 ? 'Dedicated S3 Object Lock bucket and API credentials.' : 'Node 24 and the embedded Quorum lab.',
}));
const catalog = { generatedAt: new Date().toISOString(), definitions: [...definitions, ...crtDefinitions], assertions, executedChecks: latest, sourceIndex: 'SOURCE_INDEX.json' };
await textFile(path.join(qa, 'feature-manifest.json'), JSON.stringify(catalog, null, 2));
await textFile(path.join(qa, 'SOURCE_INDEX.json'), JSON.stringify(sources, null, 2));
let inventory = '# Feature inventory\n\n' +
  'The inventory combines documented architecture, source route discovery, and named runtime assertions. Implementation labels describe source scope. Recorded observations and their limits determine verification status.\n\n' +
  '[Machine-readable inventory](feature-manifest.json) · [Source, endpoints and specification claim index](SOURCE_INDEX.json)\n';
for (const def of catalog.definitions) {
  inventory += '\n## ' + def.id + ' — ' + def.name + '\n\n' +
    def.project + ' · ' + def.implementation + ' · ' + def.risk + '\n\n' +
    '- Specification: ' + def.document + ', lines ' + (def.documentLines.join(', ') || 'see source index') + '.\n' +
    '- Source: ' + def.source + '. API or view: ' + def.endpoint + '.\n' +
    '- Dependencies: ' + def.dependencies + '\n' +
    '- Invariant and scope: ' + def.invariant + '\n' +
    '- Verification: ' + def.method + '.\n' +
    '- Mapped named source tests: ' + (def.existingTests?.length ?? 0) + '.\n';
}
await textFile(path.join(qa, 'FEATURE_INVENTORY.md'), inventory);
const columns = ['project','featureId','runNumber','timestamp','seed','runtimeMode','expected','observed','result','durationMs','artifact','sourceRevision','batch','recordFile'];
const csv = value => '"' + String(value ?? '').replaceAll('"','""') + '"';
await textFile(path.join(out,'TEST_EXECUTION_RESULTS.csv'), columns.join(',') + '\n' + records.map(row => columns.map(key => csv(row[key])).join(',')).join('\n') + '\n');
let coverage = '# Feature coverage\n\n[Feature inventory](../FEATURE_INVENTORY.md) · [Every recorded attempt](TEST_EXECUTION_RESULTS.csv)\n\n' +
  'Results below use the latest batch per check. Older attempts and failed launch evidence remain in the CSV and raw files. A group evidence reference does not create a new feature execution.\n\n';
for (const definition of catalog.definitions) {
  const matches = latest.filter(row => row.featureId === definition.id || definition.method.includes(row.featureId));
  coverage += '- **' + definition.id + ' · ' + definition.name + '** — ' + definition.implementation + '. ' +
    (matches.length ? matches.map(m => m.featureId + ' ' + m.counts.PASS + ' pass, ' + m.counts.FAIL + ' fail, ' + m.counts.BLOCKED + ' blocked').join(' · ') :
    'See ' + definition.method + '. No independent aggregate claim is awarded.') + ' ' + definition.invariant + '\n';
}
coverage += '\n## Recorded verification checks\n\n';
for (const row of latest) {
  coverage += '- **' + row.featureId + '** · ' + clean(row.label) + ' · ' + row.runtimeMode + ' · ' +
    row.counts.PASS + ' pass / ' + row.counts.FAIL + ' fail / ' + row.counts.BLOCKED + ' blocked / ' + row.counts.SKIPPED + ' skipped. ' +
    (row.source ? 'Source: ' + row.source + '. ' : '') + reportLink(row.artifact) + '\n';
}
await textFile(path.join(out, 'FEATURE_COVERAGE.md'), coverage);
const count = status => records.filter(row => row.result === status).length;
const open = latest.filter(row => row.counts.FAIL || row.counts.BLOCKED || row.completed < 10);
const metrics = [];
for (const file of (await walk(path.join(out, 'runs'))).filter(file => file.endsWith('reference-metrics.json')).sort()) {
  const row = JSON.parse(await readFile(file, 'utf8'));
  const [batch, , attempt] = path.relative(path.join(out, 'runs'), file).split(path.sep);
  metrics.push({ ...row, file: rel(file), batch, attempt: Number(attempt) });
}
const metricLine = m => '- Attempt ' + m.attempt + ' · ' + m.real.count + ' Quorum / ' + m.modeled.count + ' simulated requests · ' +
  m.real.successes + ' successes / ' + m.real.errors + ' errors (' + (100*m.real.errorRate).toFixed(2) + '%) · ' +
  'observed p50/p95/p99 ' + [m.real.p50,m.real.p95,m.real.p99].map(x => x.toFixed(2)).join('/') + ' ms · ' +
  'model p99 ' + m.modeled.p99.toFixed(2) + ' ms · ' +
  'throughput ' + m.real.throughput.toFixed(2) + ' observed / ' + m.modeled.throughput.toFixed(2) + ' modeled ops/s · ' +
  'D ' + m.distances.d.toFixed(4) + ', p ' + m.distances.pValue.toExponential(3) + ', W1 ' + m.distances.wasserstein.toFixed(3) + ' ms · ' +
  'p99 relative error ' + (100*m.errors.p99Relative).toFixed(1) + '% · ' + reportLink(m.file);
const metricBatches = new Map();
for (const metric of metrics) {
  if (!metricBatches.has(metric.batch)) metricBatches.set(metric.batch, []);
  metricBatches.get(metric.batch).push(metric);
}
await textFile(path.join(out,'COMPARISON_REPORT.md'), [
  '# Simulation versus reality', '',
  'The repeated demo starts real gRPC peers inside one OS process. Historical 149-request model batches generated independent arrivals. Phase 3 replays canonical request IDs, clients, keys, types and intended arrivals for all 150 operations. Peer fault and key-state semantics remain unmatched. The distance and latency statistics are descriptive and cannot establish protocol-equivalent certification.',
  '', 'The independent reference computes nearest-rank percentiles, counts and time-span throughput, ECDF K–S D, asymptotic K–S p and discrete Wasserstein transport. Asymptotic p is a numerical cross-check. Ties and correlated workload latencies limit its statistical interpretation.',
  '', 'Acceptance: D ≤ 0.15, p ≥ 0.05, W1 ≤ 12 ms, empirical p99 < 25 ms and error rate < 1%. The demo lacks held-out optimizer execution, trace parity and full archival lineage.',
  '', ...[...metricBatches].flatMap(([batch, trials]) => [
    '## Batch ' + batch, '',
    `Threshold breaches out of ${trials.length} trials: KS D ${trials.filter(m => m.distances.d > .15).length}, KS p ${trials.filter(m => m.distances.pValue < .05).length}, W1 ${trials.filter(m => m.distances.wasserstein > 12).length}, empirical p99 ${trials.filter(m => m.real.p99 >= 25).length}, error rate ${trials.filter(m => m.real.errorRate >= .01).length}.`,
    '', ...trials.map(metricLine), '',
  ]),
  'Faulted Quorum execution and the simplified baseline differ in work allocation, durability and timing. The measurements establish divergence without attributing each outlier to a specific cause. Neither matching reference math nor uploaded test objects can substitute for a closed-loop certification run.',
  '', '[All check outcomes](FEATURE_COVERAGE.md)',
].join('\n'));
await textFile(path.join(out,'FINAL_AUDIT.md'), [
  '# Final ecosystem audit', '',
  '**PARTIALLY VERIFIED. Full certification and production readiness remain open.**', '',
  '- Specification-level entries: ' + catalog.definitions.length + ' (' + definitions.length + ' feature families and ' + crtDefinitions.length + ' named scenarios).',
  '- Distinct named Vitest assertions observed, including superseded assertions: ' + assertions.length + '. Distinct check IDs across all lanes: ' + latest.length + '.',
  '- Current direct check plan denominator: ' + latest.length + ' checks × 10 = ' + (10*latest.length) + ' slots. This excludes documented claims with no independent check.',
  '- Latest-batch actual executions: ' + latest.reduce((sum,row) => sum + row.completed, 0) + ' (' + latest.reduce((sum,row) => sum + row.counts.PASS, 0) + ' passed, ' + latest.reduce((sum,row) => sum + row.counts.FAIL, 0) + ' failed). Latest-batch blocked observations: ' + latest.reduce((sum,row) => sum + row.counts.BLOCKED, 0) + '.',
  '- All recorded rows including prior revisions and diagnostics: ' + records.length + ' · ' + count('PASS') + ' passed · ' + count('FAIL') + ' failed · ' + count('BLOCKED') + ' blocked · ' + count('SKIPPED') + ' skipped.',
  '- Latest-batch checks verified at 10/10 in stated runtime scope: ' + latest.filter(r => r.counts.PASS === 10 && !r.counts.FAIL).length + '.',
  '- Latest-batch intermittent check IDs: ' + (latest.filter(r => r.counts.FAIL && r.counts.PASS).map(r => r.featureId).join(', ') || 'none') + '.',
  '', 'Outstanding directly recorded results:', '',
  ...open.map(r => '- **' + r.featureId + '** ' + r.status + ' · ' + r.completed + '/10 actual executions · ' + r.counts.FAIL + ' failed, ' + r.counts.BLOCKED + ' blocked.'),
  '', 'Release blockers include independent-process Raft, calibrated peer-fault and key-state parity, and the complete G1–G8 lineage and certificate. Commerce has an explicitly configured MySQL transactional mode. Embedded commerce retains process-local semantics. The controlled Docker stack does not establish production availability or Kubernetes behavior.',
  '', '[Hosted sandbox](HOSTED_SANDBOX.md) · [Phase 3 before-and-after](PHASE3_REMEDIATION.md) · [Coverage](FEATURE_COVERAGE.md) · [Execution CSV](TEST_EXECUTION_RESULTS.csv) · [Comparison](COMPARISON_REPORT.md) · [Bugs](BUG_REPORT.md) · [Integration](INTEGRATION_REPORT.md)',
].join('\n'));
const evidence = (await walk(out)).filter(file => !file.endsWith('summary.json'));
const digestFiles = evidence.filter(file => /\.(json|log|png|html|svg)$/.test(file)).sort();
await textFile(path.join(out,'ARTIFACT_SHA256.txt'), (await Promise.all(digestFiles.map(async file => hash(await readFile(file)) + '  ' + rel(file)))).join('\n') + '\n');
const summary = { definitions: catalog.definitions.length, assertions: assertions.length, checks: latest.length,
  records: records.length, actual: count('PASS') + count('FAIL'), passed: count('PASS'), failed: count('FAIL'),
  blocked: count('BLOCKED'), skipped: count('SKIPPED'), verified10: latest.filter(row => row.counts.PASS === 10 && !row.counts.FAIL).length,
  latestOpen: open.map(row => ({ id: row.featureId, ...row.counts })), metrics: metrics.length };
await textFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));

