/**
 * I7 — Research Campaign Engine: types.
 *
 * Defines the multi-dimensional parameter matrix for sweeping
 * across consistency × faults × load combinations.
 */
import type {
  ReadConsistency,
  WriteAckPolicy,
  ConflictStrategy,
  FaultType,
} from '@system-x/integration-contracts';

// ---------------------------------------------------------------------------
// Campaign dimensions
// ---------------------------------------------------------------------------

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

/** QUORUM LAB capability matrix — what the cluster can actually support. */
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
}

// ---------------------------------------------------------------------------
// Campaign plan
// ---------------------------------------------------------------------------

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
}

/** A cell that was excluded with the reason. */
export interface ExcludedCell {
  readonly cell: CampaignCell;
  readonly reason: string;
}

/** Input dimensions for campaign planning. */
export interface CampaignSpec {
  readonly campaignId: string;
  readonly consistencyDimensions: readonly ConsistencyDimension[];
  readonly faultDimensions: readonly FaultDimension[];
  readonly loadDimensions: readonly LoadDimension[];
  /** QUORUM LAB capability matrix — validated before Cartesian product. */
  readonly quorumCapabilities: QuorumCapabilityMatrix;
}
