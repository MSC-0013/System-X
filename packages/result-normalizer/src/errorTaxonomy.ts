/**
 * I4 — Result Normalizer: Error taxonomy mapping.
 *
 * Translates system-specific error codes to the unified UnifiedErrorClass.
 */
import type { UnifiedErrorClass } from './types.js';

// ---------------------------------------------------------------------------
// QUORUM LAB error code → UnifiedErrorClass
// ---------------------------------------------------------------------------

const QUORUM_ERROR_MAP: Record<string, UnifiedErrorClass> = {
  // Network / availability
  LEADER_UNAVAILABLE: 'NETWORK',
  CONNECTION_REFUSED: 'NETWORK',
  NETWORK_PARTITION: 'NETWORK',
  // Timeouts
  REQUEST_TIMEOUT: 'TIMEOUT',
  ELECTION_TIMEOUT: 'TIMEOUT',
  LEASE_EXPIRED: 'TIMEOUT',
  // Overload
  RATE_LIMITED: 'OVERLOAD',
  QUEUE_FULL: 'OVERLOAD',
  // Consistency
  STALE_READ: 'CONSISTENCY',
  CAUSAL_ANOMALY: 'CONSISTENCY',
  // Safety
  SPLIT_BRAIN: 'SAFETY',
  LINEARIZABILITY_VIOLATION: 'SAFETY',
  // Internal
  STORAGE_ERROR: 'INTERNAL',
  REPLICATION_FAILURE: 'INTERNAL',
};

// ---------------------------------------------------------------------------
// BLACKBOX-X error code → UnifiedErrorClass
// ---------------------------------------------------------------------------

const BLACKBOX_ERROR_MAP: Record<string, UnifiedErrorClass> = {
  SIM_TIMEOUT: 'TIMEOUT',
  SIM_NETWORK_FAILURE: 'NETWORK',
  SIM_CAPACITY_EXCEEDED: 'OVERLOAD',
  SIM_CONSISTENCY_FAIL: 'CONSISTENCY',
  SIM_SAFETY_VIOLATION: 'SAFETY',
  SIM_INTERNAL: 'INTERNAL',
};

/**
 * Classify a QUORUM LAB error code into the unified taxonomy.
 */
export function classifyQuorumError(errorCode: string | undefined): UnifiedErrorClass {
  if (!errorCode) return 'NONE';
  return QUORUM_ERROR_MAP[errorCode] ?? 'UNKNOWN';
}

/**
 * Classify a BLACKBOX-X error code into the unified taxonomy.
 */
export function classifyBlackboxError(errorCode: string | undefined): UnifiedErrorClass {
  if (!errorCode) return 'NONE';
  return BLACKBOX_ERROR_MAP[errorCode] ?? 'UNKNOWN';
}
