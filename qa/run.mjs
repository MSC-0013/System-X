import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const repositories = {
  SX: { name: 'System-X', cwd: root, spec: 'SYSTEM_X.md' },
  BX: { name: 'Blackbox-X', cwd: path.resolve(root, '../BLACKBOX-X'), spec: 'blackbox-x.md' },
  QL: { name: 'Quorum Lab', cwd: path.resolve(root, '../QUORUM LAB'), spec: 'QUORUM_LAB.md' },
};
const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const repeat = Number(flags.repeat ?? 10);
if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('--repeat must be 1 through 10.');
const selected = flags.project ?? 'all';
const lane = flags.lane ?? 'suite';
const reports = path.join(root, 'qa/reports');
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const evidence = path.join(reports, 'runs', runId);
let hasFailure = false;
const shortId = (...args) => createHash('sha256').update(args.join('\0')).digest('hex').slice(0, 14);
const toRelative = (filename) => path.relative(root, filename).replaceAll('\\', '/');

function revision(cwd) {
  const git = args => execFileSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  const head = git(['rev-parse', 'HEAD']).toString().trim();
  const changes = createHash('sha256');
  const paths = git(['ls-files', '-z', '-c', '-o', '--exclude-standard']).toString().split('\0').filter(Boolean);
  for (const file of [...new Set(paths)].sort()) {
    if (!/\.(?:[cm]?js|json|ya?ml|sql|proto|ts|tsx|css)$|Dockerfile$/.test(file) ||
        /(^|\/)(dist|artifacts|qa\/reports|node_modules)\//.test(file)) continue;
    const absolute = path.join(cwd, file);
    changes.update(file + '\0');
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) changes.update(fs.readFileSync(absolute));
    changes.update('\0');
  }
  return head + '+tree:' + changes.digest('hex').slice(0, 20);
}

export async function executeNode(args, cwd, logfile, { env = {}, timeout = 90000 } = {}) {
  await mkdir(path.dirname(logfile), { recursive: true });
  const output = fs.openSync(logfile, 'w');
  const start = performance.now();
  const timestamp = new Date().toISOString();
  try {
    const child = spawn(process.execPath, args, {
      cwd, env: { ...process.env, ...env }, stdio: ['ignore', output, output], windowsHide: true,
    });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    }).finally(() => clearTimeout(timer));
    return { ...result, timedOut, timestamp, durationMs: Math.round(performance.now() - start) };
  } finally {
    fs.closeSync(output);
  }
}

function testRows(project, repo, parsed) {
  return (parsed.testResults ?? []).flatMap(file => {
    const relative = path.relative(repo.cwd, file.name).replaceAll('\\', '/');
    const occurrences = new Map();
    return file.assertionResults.map(assertion => {
      const occurrence = (occurrences.get(assertion.fullName) ?? 0) + 1;
      occurrences.set(assertion.fullName, occurrence);
      const runtimeMode = /(?:\/integration\/|quorumAdapter\.test|control-api\/|orchestrator\.test)/.test(relative)
        ? 'LOCAL-FALLBACK' : 'UNIT';
      return {
        featureId: project + '-T-' + shortId(relative, assertion.fullName, String(occurrence)),
        project: repo.name, source: relative, title: assertion.fullName, runtimeMode, assertion,
      };
    });
  });
}
function observed(assertion) {
  if (assertion.status === 'passed') return 'All assertions in this named test case passed.';
  const text = (assertion.failureMessages ?? []).join('\n').split('\n').find(line => line.trim());
  return text ?? 'Framework status: ' + assertion.status;
}
async function runSuites(project, repo, selector) {
  const sourceRevision = revision(repo.cwd);
  for (let attempt = 1; attempt <= repeat; attempt++) {
    const prefix = path.join(evidence, project, String(attempt).padStart(2, '0'));
    const file = prefix + '.vitest.json';
    const log = prefix + '.log';
    const args = ['node_modules/vitest/vitest.mjs', 'run', '--minWorkers=1', '--maxWorkers=3',
      '--reporter=default', '--reporter=json', '--outputFile=' + file];
    if (selector) args.push(selector.source, '-t', '^' + selector.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
    const setup = await executeNode(args, repo.cwd, log);
    let parsed = {};
    try { parsed = JSON.parse(await readFile(file, 'utf8')); } catch { /* Framework startup evidence is retained in log. */ }
    const rows = testRows(project, repo, parsed).filter(x => !selector || x.featureId === selector.featureId);
    const records = rows.map(({ assertion, ...test }) => ({
      ...test, runNumber: attempt, timestamp: setup.timestamp, seed: null,
      expected: test.title, observed: observed(assertion),
      result: assertion.status === 'passed' ? 'PASS' : assertion.status === 'failed' ? 'FAIL' : 'SKIPPED',
      durationMs: assertion.duration ?? null, artifact: toRelative(file), log: toRelative(log), sourceRevision,
    }));
    if (!records.some(row => ['PASS', 'FAIL'].includes(row.result)) || (setup.code !== 0 && !records.some(row => row.result === 'FAIL'))) {
      records.push({
        project: repo.name, featureId: project + '-SUITE-EXECUTION', title: 'Vitest process executes its assertions',
        runNumber: attempt, timestamp: setup.timestamp, seed: null, runtimeMode: 'UNIT',
        expected: 'Runner executes selected assertions and exits cleanly', observed: JSON.stringify(setup),
        result: 'FAIL', durationMs: setup.durationMs, artifact: toRelative(log), sourceRevision,
      });
    }
    hasFailure ||= records.some(row => row.result !== 'PASS');
    await writeFile(prefix + '.records.json', JSON.stringify(records, null, 2));
    console.log(project + ' attempt ' + attempt + '/' + repeat + ': ' + records.filter(record => record.result === 'PASS').length
      + ' passed, ' + records.filter(record => record.result === 'FAIL').length + ' failed');
  }
}

const customModes = {
  crt: { project: 'SX', script: 'crt.mjs', timeout: 45000 },
  'crt-all': { project: 'SX', script: 'crt.mjs', timeout: 105000 },
  comparison: { project: 'SX', script: 'comparison.mjs', timeout: 45000 },
  process: { project: 'QL', script: 'quorum-process.mjs', timeout: 65000 },
  browser: { project: 'SX', script: 'browser.mjs', timeout: 140000 },
  commerce: { project: 'SX', script: 'commerce.mjs', timeout: 55000 },
  'commerce-shared': { project: 'SX', script: 'commerce-shared.mjs', timeout: 90000 },
  hosted: { project: 'SX', script: 'hosted.mjs', timeout: 100000 },
  'hosted-shop': { project: 'SX', script: 'hosted-shop.mjs', timeout: 60000 },
  'hosted-cart': { project: 'SX', script: 'hosted-shop.mjs', timeout: 60000 },
  worm: { project: 'SX', script: 'worm.mjs', timeout: 45000 },
  milestone: { project: 'BX', script: 'milestone.mjs', timeout: 250000 },
};
async function runCustom(options) {
  const { script, project, timeout } = options;
  const repo = repositories[project];
  const featureSelector = flags.feature ?? '';
  if (featureSelector && !['crt', 'milestone'].includes(lane)) {
    throw new Error('Grouped lanes run all their checks. Use --feature with suite, crt, or milestone.');
  }
  const sourceRevision = revision(repo.cwd);
  const otherRevisions = Object.fromEntries(Object.entries(repositories).map(([id, repo]) => [id, revision(repo.cwd)]));
  let jobIds = [lane === 'crt-all' ? 'all' : lane === 'hosted-cart' ? 'hosted-cart' : featureSelector];
  if (lane === 'crt' && !featureSelector) jobIds = Array.from({ length: 15 }, (_, i) => 'CRT-' + String(i + 1).padStart(2, '0'));
  if (lane === 'milestone' && !featureSelector) jobIds = Array.from({ length: 13 }, (_, i) => 'M' + i);
  for (let attempt = 1; attempt <= repeat; attempt++) {
    for (const id of jobIds) {
      if (lane === 'crt' && !/^CRT-(0[1-9]|1[0-5])$/.test(id)) throw new Error('CRT IDs are CRT-01 through CRT-15.');
      if (lane === 'milestone' && !/^M([0-9]|1[0-2])$/.test(id)) throw new Error('Blackbox-X milestone IDs are M0 through M12.');
      const dir = path.join(evidence, id || lane, String(attempt).padStart(2, '0'));
      const results = path.join(dir, 'observations.json');
      const log = path.join(dir, 'execution.log');
      const setup = await executeNode([path.join(root, 'qa/checks', script), dir, id], root, log, { timeout });
      let checks = [];
      try { checks = JSON.parse(await readFile(results, 'utf8')); } catch { /* Uncaught startup and command failures below. */ }
      if (!checks.length || (setup.code !== 0 && !checks.some(row => row.result === 'FAIL'))) {
        checks.push({
          featureId: id || options.project + '-' + lane.toUpperCase(),
          runtimeMode: 'NOT ESTABLISHED', expected: 'Configured test produces observations',
          observed: 'Command exit: ' + JSON.stringify(setup), result: 'FAIL',
        });
      }
      hasFailure ||= checks.some(row => row.result !== 'PASS');
      await writeFile(path.join(dir, 'records.json'), JSON.stringify(checks.map(row => ({
        project: repo.name, runNumber: attempt, timestamp: setup.timestamp, seed: null,
        durationMs: setup.durationMs, artifact: toRelative(results), log: toRelative(log),
        sourceRevision, otherRevisions, ...row,
      })), null, 2));
      console.log((id || lane) + ' attempt ' + attempt + '/' + repeat + ': ' + checks.map(row => row.featureId + ' ' + row.result).join(', '));
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(evidence, { recursive: true });
  if (lane === 'suite') {
    const projects = selected === 'all' ? Object.entries(repositories) : [[selected, repositories[selected]]];
    if (projects.some(([, repo]) => !repo)) throw new Error('--project must be SX, BX, QL, or all.');
    let selector;
    if (flags.feature) {
      const inventory = JSON.parse(await readFile(path.join(root, 'qa/feature-manifest.json'), 'utf8'));
      selector = inventory.assertions.find(row => row.featureId === flags.feature);
      if (!selector) throw new Error('Unknown case ID. Generate the feature manifest after a suite run.');
    }
    await Promise.all(projects.filter(([, repo]) => !selector || repo.name === selector.project)
      .map(([id, repo]) => runSuites(id, repo, selector)));
  } else if (customModes[lane]) {
    await runCustom(customModes[lane]);
  } else {
    throw new Error('Unknown lane: ' + lane);
  }
  console.log('Evidence: ' + evidence);
  if (Object.hasOwn(flags, 'strict') && hasFailure) process.exitCode = 1;
}

