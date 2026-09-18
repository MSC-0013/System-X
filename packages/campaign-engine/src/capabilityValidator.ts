/**
 * I7 — Research Campaign Engine: Capability validator.
 *
 * Validates that a given cell's parameters are supported by the
 * QUORUM LAB cluster's capability matrix BEFORE generating the Cartesian product.
 *
 * This prevents attempting unsupported combinations and failing at runtime.
 */
import type {
  CampaignCell,
  QuorumCapabilityMatrix,
} from './types.js';

export interface ValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

/**
 * Validate a single campaign cell against the QUORUM capability matrix.
 */
export function validateCellCapability(
  cell: CampaignCell,
  capabilities: QuorumCapabilityMatrix,
): ValidationResult {
  // Check read consistency.
  if (!capabilities.supportedReadConsistency.includes(cell.consistency.readConsistency)) {
    return {
      valid: false,
      reason: `Read consistency '${cell.consistency.readConsistency}' is not supported by the QUORUM cluster`,
    };
  }

  // Check write ack policy.
  if (!capabilities.supportedWriteAckPolicies.includes(cell.consistency.writeAckPolicy)) {
    return {
      valid: false,
      reason: `Write ack policy '${cell.consistency.writeAckPolicy}' is not supported`,
    };
  }

  // Check conflict strategy.
  if (!capabilities.supportedConflictStrategies.includes(cell.consistency.conflictStrategy)) {
    return {
      valid: false,
      reason: `Conflict strategy '${cell.consistency.conflictStrategy}' is not supported`,
    };
  }

  // Check fault type.
  if (!capabilities.supportedFaultTypes.includes(cell.fault.faultType)) {
    return {
      valid: false,
      reason: `Fault type '${cell.fault.faultType}' is not supported by the QUORUM cluster`,
    };
  }

  // Check concurrency within cluster capacity.
  if (cell.load.concurrency > capabilities.maxConcurrency) {
    return {
      valid: false,
      reason: `Concurrency ${cell.load.concurrency} exceeds cluster max ${capabilities.maxConcurrency}`,
    };
  }

  // Quorum majority requirement: QUORUM policies need minNodeCount >= 3.
  const needsQuorum =
    cell.consistency.readConsistency === 'QUORUM' ||
    cell.consistency.writeAckPolicy === 'QUORUM';
  if (needsQuorum && capabilities.minNodeCount < 3) {
    return {
      valid: false,
      reason: `QUORUM policy requires minNodeCount >= 3 but cluster has ${capabilities.minNodeCount}`,
    };
  }

  return { valid: true };
}
