/**
 * I3 — Fault Bridge: Fault Compiler.
 *
 * Translates an IntegratedFaultSchedule into a CompiledFaultTimeline
 * that QUORUM LAB's experiment worker can execute.
 *
 * Key invariants:
 *  1. Offsets are monotonic from experimentStartBarrier — NOT wall clock.
 *  2. CRASH/RESTART/RECOVER are separate events with distinct semantics.
 *  3. Network faults map to QUORUM chaos interceptors.
 *  4. Timeline is sorted by startOffsetMs.
 *  5. timelineHash is computed from the canonical JSON of events.
 *
 * IMPORTANT: Pure function — NO I/O performed here.
 */
import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from '@system-x/integration-contracts';
import { DEFAULT_RECOVERY_TIMEOUT_MS } from './types.js';
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Compile an IntegratedFaultSchedule into a CompiledFaultTimeline.
 *
 * @param schedule           The fault schedule from the experiment spec.
 * @param experimentSpecHash SHA-256 of the canonical experiment spec (I0).
 * @returns                  A sorted, hashed CompiledFaultTimeline.
 */
export function compileFaultSchedule(schedule, experimentSpecHash) {
    const events = [];
    for (const fault of schedule.faults) {
        const compiled = compileFaultEvent(fault);
        events.push(...compiled);
    }
    // Sort chronologically by startOffsetMs, then by faultId for stability.
    events.sort((a, b) => {
        const diff = a.startOffsetMs - b.startOffsetMs;
        return diff !== 0 ? diff : a.faultId.localeCompare(b.faultId);
    });
    const timelineHash = computeTimelineHash(events);
    const affectedNodes = [
        ...new Set(events.flatMap((e) => e.targetNodes)),
    ].sort();
    return {
        events,
        timelineHash,
        affectedNodes,
        experimentSpecHash,
    };
}
// ---------------------------------------------------------------------------
// Internal: event compilation
// ---------------------------------------------------------------------------
/**
 * Compile a single IntegratedFaultEvent into one or more CompiledFaultEvents.
 *
 * CRASH, RESTART, and RECOVER are already separate in the contract.
 * Network faults map 1:1 to a CompiledNetworkFaultEvent.
 */
function compileFaultEvent(fault) {
    switch (fault.type) {
        case 'PARTITION':
        case 'DELAY':
        case 'LOSS':
        case 'CLOCK_SKEW':
            return [compileNetworkFault(fault)];
        case 'CRASH':
            return [compileCrashFault(fault)];
        case 'RESTART':
            return [compileRestartFault(fault)];
        case 'RECOVER':
            return [compileRecoverFault(fault)];
        default: {
            // TypeScript exhaustive check — should never happen at runtime.
            const _exhaustive = fault.type;
            throw new Error(`Unknown fault type: ${String(_exhaustive)}`);
        }
    }
}
function compileNetworkFault(fault) {
    const faultType = fault.type;
    const params = fault.parameters ?? {};
    return {
        kind: 'NETWORK',
        faultId: fault.id,
        faultType,
        targetNodes: fault.targetNodes,
        startOffsetMs: fault.offsetMs,
        durationMs: fault.durationMs,
        parameters: {
            ...(params.delayMs !== undefined ? { delayMs: params.delayMs } : {}),
            ...(params.jitterMs !== undefined ? { jitterMs: params.jitterMs } : {}),
            ...(params.lossRate !== undefined ? { lossRate: params.lossRate } : {}),
            ...(params.skewOffsetMs !== undefined ? { skewOffsetMs: params.skewOffsetMs } : {}),
        },
    };
}
function compileCrashFault(fault) {
    return {
        kind: 'CRASH',
        faultId: fault.id,
        targetNodes: fault.targetNodes,
        startOffsetMs: fault.offsetMs,
    };
}
function compileRestartFault(fault) {
    const recoveryTimeoutMs = fault.parameters?.recoveryTimeoutMs ??
        DEFAULT_RECOVERY_TIMEOUT_MS;
    return {
        kind: 'RESTART',
        faultId: fault.id,
        targetNodes: fault.targetNodes,
        startOffsetMs: fault.offsetMs,
        recoveryTimeoutMs,
    };
}
function compileRecoverFault(fault) {
    const recoveryTimeoutMs = fault.parameters?.recoveryTimeoutMs ??
        DEFAULT_RECOVERY_TIMEOUT_MS;
    return {
        kind: 'RECOVER',
        faultId: fault.id,
        targetNodes: fault.targetNodes,
        startOffsetMs: fault.offsetMs,
        recoveryTimeoutMs,
    };
}
// ---------------------------------------------------------------------------
// Internal: hashing
// ---------------------------------------------------------------------------
function computeTimelineHash(events) {
    const canonical = canonicalJsonStringify(events);
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
//# sourceMappingURL=faultCompiler.js.map