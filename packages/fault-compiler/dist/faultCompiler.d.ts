import type { IntegratedFaultSchedule } from '@system-x/integration-contracts';
import type { CompiledFaultTimeline } from './types.js';
/**
 * Compile an IntegratedFaultSchedule into a CompiledFaultTimeline.
 *
 * @param schedule           The fault schedule from the experiment spec.
 * @param experimentSpecHash SHA-256 of the canonical experiment spec (I0).
 * @returns                  A sorted, hashed CompiledFaultTimeline.
 */
export declare function compileFaultSchedule(schedule: IntegratedFaultSchedule, experimentSpecHash: string): CompiledFaultTimeline;
//# sourceMappingURL=faultCompiler.d.ts.map