/** Load actual sibling engines. Missing engines must never silently become toy implementations. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function loadEngine(relativePath, exportName) {
    const candidates = [path.resolve(root, '..', relativePath), path.resolve(root, relativePath)];
    const failures = [];
    for (const candidate of candidates) {
        if (!fs.existsSync(candidate))
            continue;
        try {
            const mod = await import(pathToFileURL(candidate).href);
            if (typeof mod[exportName] !== 'function')
                throw new Error(`Missing export ${exportName}`);
            return { implementation: mod[exportName], path: candidate, error: null };
        }
        catch (error) {
            failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const error = `Real ${exportName} unavailable. Build the sibling repository before running this experiment.${failures.length ? ' ' + failures.join('; ') : ''}`;
    return {
        implementation: class MissingEngine {
            constructor(..._args) { throw new Error(error); }
        },
        path: null,
        error,
    };
}
const [quorum, simulation] = await Promise.all([
    loadEngine('QUORUM LAB/apps/quorum-node/dist/index.js', 'QuorumNodeApp'),
    loadEngine('BLACKBOX-X/packages/simulation-engine/dist/index.js', 'SimulationRunner'),
]);
export const engineAvailability = {
    quorum: { available: quorum.path !== null, path: quorum.path, error: quorum.error },
    blackbox: { available: simulation.path !== null, path: simulation.path, error: simulation.error },
};
export const QuorumNodeApp = quorum.implementation;
export const SimulationRunner = simulation.implementation;
