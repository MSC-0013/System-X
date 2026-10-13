import type { OperationTraceEntry, WorkloadSpec } from './types.js';
/**
 * Generate the full operation trace for all clients.
 *
 * Strategy:
 *  - Each client gets its own operation PRNG and key PRNG (separate seeds).
 *  - Operations are scheduled at uniformly distributed offsets within
 *    the experiment duration, one per client per "round".
 *  - We interleave across all clients in time order.
 */
export declare function generateOperationTrace(spec: WorkloadSpec, experimentSpecHash: string, masterSeed: number): OperationTraceEntry[];
//# sourceMappingURL=operationTraceGenerator.d.ts.map