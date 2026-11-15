import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runQuorumProcessExperiment } from '../../crt/scenarios/quorumProcess.js';

const [dir] = process.argv.slice(2);
const { rows, evidence } = await runQuorumProcessExperiment(dir);
await writeFile(join(dir, 'observations.json'), JSON.stringify(rows, null, 2));
await writeFile(join(dir, 'processes.json'), JSON.stringify(evidence, null, 2));
