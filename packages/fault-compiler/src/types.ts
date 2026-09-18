/**
 * I3 — Fault Bridge: types.
 *
 * Maps IntegratedFaultSchedule → QUORUM LAB chaos timeline events.
 * This module owns the translation between the SYSTEM-X canonical fault model
 * and the QUORUM Control API's execution model.
 */

// ---------------------------------------------------------------------------
// QUORUM-side event categories
// ---------------------------------------------------------------------------

/** Network fault: injected via QUORUM's chaos/network interceptors. */
export interface CompiledNetworkFaultEvent {
  readonly kind: 'NETWORK';
  readonly faultId: string;
  readonly faultType: 'PARTITION' | 'DELAY' | 'LOSS' | 'CLOCK_SKEW';
  readonly targetNodes: readonly string[];
  /** Monotonic offset in ms from the experimentStartBarrier. */
  readonly startOffsetMs: number;
  /** Duration of the fault in ms. 0 = point-in-time event. */
  readonly durationMs: number;
  /** Fault-specific parameters. */
  readonly parameters: {
    delayMs?: number;
    jitterMs?: number;
    lossRate?: number;
    skewOffsetMs?: number;
  };
}

/** Process crash: inject via QUORUM FaultControlService gRPC. */
export interface CompiledCrashEvent {
  readonly kind: 'CRASH';
  readonly faultId: string;
  readonly targetNodes: readonly string[];
  /** Monotonic offset in ms from the experimentStartBarrier. */
  readonly startOffsetMs: number;
}

/** Process restart: deployment/runtime adapter, waits for readiness. */
export interface CompiledRestartEvent {
  readonly kind: 'RESTART';
  readonly faultId: string;
  readonly targetNodes: readonly string[];
  /** Monotonic offset in ms from the experimentStartBarrier. */
  readonly startOffsetMs: number;
  /** Maximum time to wait for the node to come back up before declaring failure. */
  readonly recoveryTimeoutMs: number;
}

/** Health/readiness verification after crash/restart. */
export interface CompiledRecoverEvent {
  readonly kind: 'RECOVER';
  readonly faultId: string;
  readonly targetNodes: readonly string[];
  /** Monotonic offset in ms from the experimentStartBarrier. */
  readonly startOffsetMs: number;
  /** Maximum time to wait for the node to report healthy. */
  readonly recoveryTimeoutMs: number;
}

export type CompiledFaultEvent =
  | CompiledNetworkFaultEvent
  | CompiledCrashEvent
  | CompiledRestartEvent
  | CompiledRecoverEvent;

/** The full compiled fault timeline for an experiment. */
export interface CompiledFaultTimeline {
  /** Ordered chronologically by startOffsetMs. */
  readonly events: readonly CompiledFaultEvent[];
  /** SHA-256 hash of the canonical JSON of events. */
  readonly timelineHash: string;
  /** Set of all unique node IDs targeted by faults. */
  readonly affectedNodes: readonly string[];
  /** The experimentSpecHash this timeline was compiled for. */
  readonly experimentSpecHash: string;
}

/** Default recovery timeout when none is specified in the fault parameters. */
export const DEFAULT_RECOVERY_TIMEOUT_MS = 30_000;
