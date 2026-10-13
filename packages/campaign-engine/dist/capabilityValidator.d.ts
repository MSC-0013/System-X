/**
 * I7 — Research Campaign Engine: Capability validator.
 *
 * Validates that a given cell's parameters are supported by the
 * QUORUM LAB cluster's capability matrix BEFORE generating the Cartesian product.
 *
 * Key principle: topology requirements are POLICY-DERIVED, not blanket rules.
 *
 *   RAFT + fault tolerance  → requires 2f+1 nodes (min 3 for f=1)
 *   QUORUM read/write       → requires W + R > N (validated against quorumN)
 *   LEADERLESS async        → can work with N=2
 *   Single-leader async     → N=1 possible for development
 *
 * The capability matrix declares what the cluster actually has and supports.
 * The validator enforces that each cell's policy is consistent with those capabilities.
 */
import type { CampaignCell, QuorumCapabilityMatrix } from './types.js';
export interface ValidationResult {
    readonly valid: boolean;
    readonly reason?: string;
}
/**
 * Validate a single campaign cell against the QUORUM capability matrix.
 */
export declare function validateCellCapability(cell: CampaignCell, capabilities: QuorumCapabilityMatrix): ValidationResult;
//# sourceMappingURL=capabilityValidator.d.ts.map