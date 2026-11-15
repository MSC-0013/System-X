/**
 * I2 — Operation Trace Generator.
 *
 * Generates a deterministic, client-interleaved sequence of operations
 * using seeded PRNGs. Each client has its own operation and key stream
 * derived from the same master seed via the canonical seed derivation.
 *
 * IMPORTANT: This module performs NO I/O. It is a pure function.
 */
import { deriveStreamSeed } from '@system-x/integration-contracts';
import { createMulberry32, createUniformGenerator } from './uniformGenerator.js';
import { createZipfianGenerator } from './zipfianGenerator.js';
/**
 * Generate the full operation trace for all clients.
 *
 * Strategy:
 *  - Each client gets its own operation PRNG and key PRNG (separate seeds).
 *  - Operations are scheduled at uniformly distributed offsets within
 *    the experiment duration, one per client per "round".
 *  - We interleave across all clients in time order.
 */
export function generateOperationTrace(spec, experimentSpecHash, masterSeed) {
    if (!Number.isSafeInteger(spec.operationCount) || spec.operationCount < 1 ||
        !Number.isSafeInteger(spec.clientCount) || spec.clientCount < 1 ||
        !Number.isSafeInteger(spec.keySpaceSize) || spec.keySpaceSize < 1 ||
        !Number.isFinite(spec.durationMs) || spec.durationMs <= 0 ||
        !Number.isSafeInteger(spec.keyMin ?? 0) || (spec.keyMin ?? 0) < 0 ||
        !Number.isSafeInteger((spec.keyMin ?? 0) + spec.keySpaceSize) ||
        !Number.isSafeInteger(spec.valueSize) || spec.valueSize < 1 ||
        !Number.isFinite(spec.readFraction) || !Number.isFinite(spec.deleteFraction) ||
        spec.readFraction < 0 || spec.deleteFraction < 0 || spec.readFraction + spec.deleteFraction > 1) {
        throw new RangeError('Invalid workload count, duration, key range, value size, or operation fractions');
    }
    const durationUs = spec.durationMs * 1000;
    const opsPerClient = Math.floor(spec.operationCount / spec.clientCount);
    const allEntries = [];
    for (let clientId = 0; clientId < spec.clientCount; clientId++) {
        // Separate seeds for operation type, key selection, and timing per client.
        const opSeed = deriveStreamSeed(experimentSpecHash, masterSeed, `workload:op:client:${clientId}`);
        const keySeed = deriveStreamSeed(experimentSpecHash, masterSeed, `workload:key:client:${clientId}`);
        const timeSeed = deriveStreamSeed(experimentSpecHash, masterSeed, `workload:time:client:${clientId}`);
        const opRng = createMulberry32(opSeed);
        const keyRng = createMulberry32(keySeed);
        const timeRng = createMulberry32(timeSeed);
        const keyGen = spec.keyDistribution === 'ZIPFIAN'
            ? createZipfianGenerator(keyRng, spec.keySpaceSize, spec.zipfianTheta)
            : { next: createUniformGenerator(keyRng, 0, spec.keySpaceSize) };
        // Allocate the remainder exactly once. Each operation gets a stratified
        // time slot so a shrinking random window cannot silently drop operations.
        const clientOpsToGenerate = opsPerClient + (clientId < spec.operationCount % spec.clientCount ? 1 : 0);
        for (let i = 0; i < clientOpsToGenerate; i++) {
            const offset = Math.floor(((i + timeRng()) / clientOpsToGenerate) * durationUs);
            // Determine operation type.
            const rand = opRng();
            let operation;
            if (rand < spec.deleteFraction) {
                operation = 'DELETE';
            }
            else if (rand < spec.deleteFraction + spec.readFraction) {
                operation = 'GET';
            }
            else {
                operation = 'PUT';
            }
            // Generate key.
            const keyIndex = (spec.keyMin ?? 0) + keyGen.next();
            const key = `k${keyIndex.toString().padStart(10, '0')}`;
            // Generate value for PUT (deterministic value based on key index and size).
            let value;
            if (operation === 'PUT') {
                // Deterministic fixed-pattern value of exactly valueSize bytes.
                const pattern = `v${keyIndex}`;
                value = pattern.repeat(Math.ceil(spec.valueSize / pattern.length)).slice(0, spec.valueSize);
            }
            allEntries.push({
                sequence: 0, // Will be assigned after sort.
                logicalClientId: clientId,
                operation,
                key,
                ...(value !== undefined ? { value } : {}),
                scheduledOffsetUs: offset,
            });
        }
    }
    // Sort by scheduledOffsetUs, break ties by logicalClientId.
    allEntries.sort((a, b) => {
        const diff = a.scheduledOffsetUs - b.scheduledOffsetUs;
        return diff !== 0 ? diff : a.logicalClientId - b.logicalClientId;
    });
    // Assign final monotonic sequence numbers.
    return allEntries.map((entry, idx) => ({ ...entry, sequence: idx }));
}
