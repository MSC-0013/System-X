/**
 * CRT MASTER CLI RUNNER: EXECUTE ALL 15 RELIABILITY SCENARIOS (CRT-01 TO CRT-15)
 */

import { QuorumAdapter } from '../adapter/quorumAdapter.js';
import { CrtScenarioSuite } from './crtScenarios.js';

async function main() {
  console.log('='.repeat(80));
  console.log('      SYSTEM-X COMMERCE RELIABILITY TESTBED — SCENARIO EXECUTION MATRIX');
  console.log('='.repeat(80));

  const adapter = new QuorumAdapter();
  await adapter.initializeCluster();
  const suite = new CrtScenarioSuite(adapter);

  console.log('Running 15 Master Distributed Scenarios against Quorum Lab N=3...\n');
  const t0 = performance.now();
  const results = await suite.runAll();
  const durationMs = (performance.now() - t0).toFixed(0);

  let passedCount = 0;
  for (const r of results) {
    const mark = r.passed ? '[PASS]' : '[FAIL]';
    if (r.passed) passedCount++;
    console.log(`${mark}  ${r.scenarioId.padEnd(8)} : ${r.name}`);
    for (const a of r.assertions) {
      const aMark = a.verdict === 'PASS' ? '  ✓' : '  ✗';
      console.log(`     ${aMark} [${a.dimension}]: ${a.details}`);
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`TOTAL SCENARIOS : ${results.length}`);
  console.log(`PASSED          : ${passedCount}`);
  console.log(`FAILED          : ${results.length - passedCount}`);
  console.log(`EXECUTION TIME  : ${durationMs} ms`);
  console.log(`OVERALL VERDICT : ${passedCount === results.length ? 'CERTIFIED [PASS]' : 'NOT CERTIFIED [FAIL]'}`);
  console.log('='.repeat(80));

  await adapter.shutdownCluster();

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during CRT scenarios execution:', err);
  process.exit(1);
});
