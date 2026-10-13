/**
 * I7 — Research Campaign Engine: types.
 *
 * Defines the multi-dimensional parameter matrix for sweeping
 * across consistency × faults × load combinations.
 */
import type { ReadConsistency, WriteAckPolicy, ConflictStrategy, FaultType } from '@system-x/integration-contracts';
/** A named axis of variation in the campaign matrix. */
export interface CampaignDimension<T> {
    /** Human-readable axis name. */
    readonly name: string;
    /** All values to sweep across. */
    readonly values: readonly T[];
}
/** Consistency axis. */
export interface ConsistencyDimension {
    readonly readConsistency: ReadConsistency;
    readonly writeAckPolicy: WriteAckPolicy;
    readonly conflictStrategy: ConflictStrategy;
}
/** Fault axis. */
export interface FaultDimension {
    readonly faultType: FaultType | 'NONE';
    /** Fraction of nodes targeted (0 = none, 1 = all). */
    readonly targetFraction: number;
    /** Duration of fault in ms. */
    readonly durationMs: number;
}
/** Load axis. */
export interface LoadDimension {
    readonly operationCount: number;
    readonly concurrency: number;
    readonly targetThroughputOpsSec: number;
}
/** QUORUM LAB capability matrix — what the cluster can actually support.
 *
 * Topology requirements are policy-derived:
 *  - quorumNodeRequirement: minimum nodes needed to form a read/write quorum.
 *    Undefined means no quorum size check is applied.
 *  - raftMinNodes: minimum nodes needed for Raft fault tolerance.
 *    Undefined means Raft topology check is skipped.
 *  These replace any blanket "N >= 3" universal rule.
 */
export interface QuorumCapabilityMatrix {
    /** Supported read consistency levels. */
    readonly supportedReadConsistency: readonly ReadConsistency[];
    /** Supported write ack policies. */
    readonly supportedWriteAckPolicies: readonly WriteAckPolicy[];
    /** Supported conflict strategies. */
    readonly supportedConflictStrategies: readonly ConflictStrategy[];
    /** Supported fault types. */
    readonly supportedFaultTypes: readonly (FaultType | 'NONE')[];
    /** Maximum concurrency the cluster can sustain. */
    readonly maxConcurrency: number;
    /** Minimum number of nodes in the cluster. */
    readonly minNodeCount: number;
    /**
     * Policy-derived: minimum node count required to form a QUORUM.
     * Example: 3 for a 3-node cluster (W=2, R=2). 2 for 2-node async replication.
     * Undefined = no quorum node requirement applied.
     */
    readonly quorumNodeRequirement?: number;
    /**
     * Policy-derived: minimum node count required for Raft-based fault tolerance.
     * Example: 3 for f=1 tolerance (2f+1). 1 for single-node (f=0, no tolerance).
     * Undefined = no Raft node check applied.
     */
    readonly raftMinNodes?: number;
}
/** One cell in the campaign matrix — a complete parameter set. */
export interface CampaignCell {
    readonly cellId: string;
    readonly consistency: ConsistencyDimension;
    readonly fault: FaultDimension;
    readonly load: LoadDimension;
}
/** A fully expanded campaign plan with all valid matrix cells. */
export interface CampaignPlan {
    /** Unique campaign ID. */
    readonly campaignId: string;
    /** Total number of cells in the matrix. */
    readonly totalCells: number;
    /** All cells, Cartesian product filtered by capability matrix. */
    readonly cells: readonly CampaignCell[];
    /** Cells excluded due to capability matrix violations. */
    readonly excludedCells: readonly ExcludedCell[];
    /**
     * Multiple-comparison policy applied across all cells in this campaign.
     * When running many cells, individual alpha levels must be adjusted to
     * control family-wise error rate (FWER) or false discovery rate (FDR).
     */
    readonly multipleComparisonPolicy: MultipleComparisonPolicy;
    /**
     * Per-cell adjusted alpha after applying multipleComparisonPolicy.
     * For NONE: equals baseKsAlpha. For BONFERRONI: baseKsAlpha / numCells.
     * HOLM and BENJAMINI_HOCHBERG are applied post-hoc (effectiveAlpha = baseKsAlpha here).
     */
    readonly effectiveAlphaPerCell: number;
}
/** A cell that was excluded with the reason. */
export interface ExcludedCell {
    readonly cell: CampaignCell;
    readonly reason: string;
}
/**
 * Statistical multiple-comparison correction policy for campaign sweeps.
 *
 * When running K hypothesis tests at alpha=0.05, the probability of at
 * least one false rejection is 1 - (1-0.05)^K, which grows with K.
 *
 * - NONE: no correction (use for single experiments or exploratory work)
 * - BONFERRONI: alpha/K per cell (conservative, strong FWER control)
 * - HOLM: step-down Bonferroni (less conservative, strong FWER control)
 * - BENJAMINI_HOCHBERG: FDR control (recommended for discovery campaigns)
 */
export type MultipleComparisonPolicy = 'NONE' | 'BONFERRONI' | 'HOLM' | 'BENJAMINI_HOCHBERG';
/** Input dimensions for campaign planning. */
export interface CampaignSpec {
    readonly campaignId: string;
    readonly consistencyDimensions: readonly ConsistencyDimension[];
    readonly faultDimensions: readonly FaultDimension[];
    readonly loadDimensions: readonly LoadDimension[];
    /** QUORUM LAB capability matrix — validated before Cartesian product. */
    readonly quorumCapabilities: QuorumCapabilityMatrix;
    /**
     * Base KS test significance level per cell (before correction).
     * Default: 0.05. After BONFERRONI correction: effectiveAlpha = baseKsAlpha / numCells.
     */
    readonly baseKsAlpha?: number;
    /**
     * Multiple-comparison correction policy for the campaign.
     * Default: BENJAMINI_HOCHBERG (FDR control, appropriate for discovery sweeps).
     */
    readonly multipleComparisonPolicy?: MultipleComparisonPolicy;
}
//# sourceMappingURL=types.d.ts.map