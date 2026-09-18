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
import type { OperationTraceEntry, WorkloadSpec } from './types.js';

/** Minimum gap between operations for a client (in microseconds). */
const MIN_OP_GAP_US = 100;

/**
 * Generate the full operation trace for all clients.
 *
 * Strategy:
 *  - Each client gets its own operation PRNG and key PRNG (separate seeds).
 *  - Operations are scheduled at uniformly distributed offsets within
 *    the experiment duration, one per client per "round".
 *  - We interleave across all clients in time order.
 */
export function generateOperationTrace(
  spec: WorkloadSpec,
  experimentSpecHash: string,
  masterSeed: number,
): OperationTraceEntry[] {
  const durationUs = spec.durationMs * 1000;
  const opsPerClient = Math.ceil(spec.operationCount / spec.clientCount);

  const allEntries: OperationTraceEntry[] = [];

  for (let clientId = 0; clientId < spec.clientCount; clientId++) {
    // Separate seeds for operation type, key selection, and timing per client.
    const opSeed = deriveStreamSeed(
      experimentSpecHash,
      masterSeed,
      `workload:op:client:${clientId}`,
    );
    const keySeed = deriveStreamSeed(
      experimentSpecHash,
      masterSeed,
      `workload:key:client:${clientId}`,
    );
    const timeSeed = deriveStreamSeed(
      experimentSpecHash,
      masterSeed,
      `workload:time:client:${clientId}`,
    );

    const opRng = createMulberry32(opSeed);
    const keyRng = createMulberry32(keySeed);
    const timeRng = createMulberry32(timeSeed);

    const keyGen =
      spec.keyDistribution === 'ZIPFIAN'
        ? createZipfianGenerator(keyRng, spec.keySpaceSize)
        : { next: createUniformGenerator(keyRng, 0, spec.keySpaceSize) };

    // Distribute operations uniformly over [0, durationUs) with minimum gap.
    let cursor = 0;
    const clientOpsToGenerate = Math.min(opsPerClient, spec.operationCount);

    for (let i = 0; i < clientOpsToGenerate; i++) {
      // Random offset within the remaining window.
      const remaining = durationUs - cursor;
      if (remaining <= 0) break;

      const offset = cursor + Math.floor(timeRng() * remaining);
      cursor = offset + MIN_OP_GAP_US;

      // Determine operation type.
      const rand = opRng();
      let operation: 'PUT' | 'GET' | 'DELETE';
      if (rand < spec.deleteFraction) {
        operation = 'DELETE';
      } else if (rand < spec.deleteFraction + spec.readFraction) {
        operation = 'GET';
      } else {
        operation = 'PUT';
      }

      // Generate key.
      const keyIndex = keyGen.next();
      const key = `k${keyIndex.toString().padStart(10, '0')}`;

      // Generate value for PUT (deterministic value based on key index and size).
      let value: string | undefined;
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
