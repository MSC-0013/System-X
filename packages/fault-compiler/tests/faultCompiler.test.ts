import { describe, it, expect } from 'vitest';
import { compileFaultSchedule } from '../src/faultCompiler.js';
import { DEFAULT_RECOVERY_TIMEOUT_MS } from '../src/types.js';
import type {
  IntegratedFaultSchedule,
  IntegratedFaultEvent,
} from '@system-x/integration-contracts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPEC_HASH = 'a'.repeat(64);

function makeSchedule(faults: IntegratedFaultEvent[]): IntegratedFaultSchedule {
  return { faults };
}

function partitionFault(id: string, offsetMs: number, durationMs: number): IntegratedFaultEvent {
  return {
    id,
    type: 'PARTITION',
    targetNodes: ['node-1', 'node-2'],
    offsetMs,
    durationMs,
  };
}

function delayFault(id: string, offsetMs: number): IntegratedFaultEvent {
  return {
    id,
    type: 'DELAY',
    targetNodes: ['node-3'],
    offsetMs,
    durationMs: 5000,
    parameters: { delayMs: 200, jitterMs: 50 },
  };
}

function crashFault(id: string, offsetMs: number): IntegratedFaultEvent {
  return {
    id,
    type: 'CRASH',
    targetNodes: ['node-1'],
    offsetMs,
    durationMs: 0,
  };
}

function restartFault(id: string, offsetMs: number, recoveryTimeoutMs?: number): IntegratedFaultEvent {
  return {
    id,
    type: 'RESTART',
    targetNodes: ['node-1'],
    offsetMs,
    durationMs: 0,
    ...(recoveryTimeoutMs !== undefined ? { parameters: { recoveryTimeoutMs } } : {}),
  };
}

function recoverFault(id: string, offsetMs: number, recoveryTimeoutMs?: number): IntegratedFaultEvent {
  return {
    id,
    type: 'RECOVER',
    targetNodes: ['node-1'],
    offsetMs,
    durationMs: 0,
    ...(recoveryTimeoutMs !== undefined ? { parameters: { recoveryTimeoutMs } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('I3: Fault Compiler', () => {
  it('empty schedule produces empty timeline', () => {
    const result = compileFaultSchedule(makeSchedule([]), SPEC_HASH);
    expect(result.events).toHaveLength(0);
    expect(result.affectedNodes).toHaveLength(0);
    expect(result.timelineHash).toHaveLength(64);
  });

  it('PARTITION fault maps to NETWORK kind with correct fields', () => {
    const schedule = makeSchedule([partitionFault('f1', 1000, 5000)]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);

    expect(result.events).toHaveLength(1);
    const e = result.events[0]!;
    expect(e.kind).toBe('NETWORK');
    if (e.kind === 'NETWORK') {
      expect(e.faultType).toBe('PARTITION');
      expect(e.startOffsetMs).toBe(1000);
      expect(e.durationMs).toBe(5000);
      expect(e.targetNodes).toEqual(['node-1', 'node-2']);
    }
  });

  it('DELAY fault maps to NETWORK kind with delay parameters', () => {
    const schedule = makeSchedule([delayFault('f1', 2000)]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);

    expect(result.events).toHaveLength(1);
    const e = result.events[0]!;
    expect(e.kind).toBe('NETWORK');
    if (e.kind === 'NETWORK') {
      expect(e.faultType).toBe('DELAY');
      expect(e.parameters.delayMs).toBe(200);
      expect(e.parameters.jitterMs).toBe(50);
    }
  });

  it('CRASH fault maps to CRASH kind', () => {
    const schedule = makeSchedule([crashFault('f1', 3000)]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);

    const e = result.events[0]!;
    expect(e.kind).toBe('CRASH');
    expect(e.startOffsetMs).toBe(3000);
    expect(e.targetNodes).toEqual(['node-1']);
  });

  it('RESTART fault maps to RESTART kind with default recoveryTimeoutMs', () => {
    const schedule = makeSchedule([restartFault('f1', 4000)]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);

    const e = result.events[0]!;
    expect(e.kind).toBe('RESTART');
    if (e.kind === 'RESTART') {
      expect(e.recoveryTimeoutMs).toBe(DEFAULT_RECOVERY_TIMEOUT_MS);
    }
  });

  it('RESTART fault uses custom recoveryTimeoutMs when provided', () => {
    const schedule = makeSchedule([restartFault('f1', 4000, 60_000)]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);

    const e = result.events[0]!;
    if (e.kind === 'RESTART') {
      expect(e.recoveryTimeoutMs).toBe(60_000);
    }
  });

  it('RECOVER fault maps to RECOVER kind', () => {
    const schedule = makeSchedule([recoverFault('f1', 5000, 10_000)]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);

    const e = result.events[0]!;
    expect(e.kind).toBe('RECOVER');
    if (e.kind === 'RECOVER') {
      expect(e.recoveryTimeoutMs).toBe(10_000);
    }
  });

  it('events are sorted chronologically by startOffsetMs', () => {
    const schedule = makeSchedule([
      crashFault('f3', 9000),
      partitionFault('f1', 1000, 3000),
      restartFault('f2', 5000),
    ]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);

    expect(result.events[0]!.startOffsetMs).toBe(1000);
    expect(result.events[1]!.startOffsetMs).toBe(5000);
    expect(result.events[2]!.startOffsetMs).toBe(9000);
  });

  it('affectedNodes is the deduplicated sorted union of all target nodes', () => {
    const schedule = makeSchedule([
      partitionFault('f1', 1000, 2000),  // node-1, node-2
      crashFault('f2', 3000),            // node-1
    ]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);
    expect(result.affectedNodes).toEqual(['node-1', 'node-2']);
  });

  it('timeline is deterministic — same input produces same timelineHash', () => {
    const schedule = makeSchedule([
      partitionFault('f1', 1000, 2000),
      crashFault('f2', 3000),
      restartFault('f3', 5000, 15_000),
    ]);
    const r1 = compileFaultSchedule(schedule, SPEC_HASH);
    const r2 = compileFaultSchedule(schedule, SPEC_HASH);
    expect(r1.timelineHash).toBe(r2.timelineHash);
  });

  it('experimentSpecHash is embedded in the timeline', () => {
    const schedule = makeSchedule([crashFault('f1', 1000)]);
    const result = compileFaultSchedule(schedule, SPEC_HASH);
    expect(result.experimentSpecHash).toBe(SPEC_HASH);
  });
});
