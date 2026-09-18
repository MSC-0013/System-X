export const INTEGRATION_CONTRACT_VERSION = '1.0.0';

export type IntegratedDistribution = 'UNIFORM' | 'ZIPFIAN';

export interface IntegratedKeyRange {
  readonly min: number;
  readonly max: number;
}

export interface IntegratedWorkload {
  readonly operationCount: number;
  readonly concurrency: number;
  readonly distribution: IntegratedDistribution;
  readonly zipfianTheta?: number;
  readonly keyRange: IntegratedKeyRange;
  readonly readRatio: number;
  readonly writeRatio: number;
  readonly targetThroughputOpsSec?: number;
  readonly valueSizeBytes?: number;
}

export type ReplicationEngine = 'LEADERLESS' | 'LEADER' | 'RAFT';
export type ReadConsistency = 'ONE' | 'QUORUM' | 'ALL' | 'EVENTUAL' | 'CAUSAL' | 'SESSION';
export type WriteAckPolicy = 'ONE' | 'QUORUM' | 'ALL';
export type DurabilityPolicy = 'MEMORY_ONLY' | 'BATCHED_FSYNC' | 'SYNC_FSYNC';
export type ConflictStrategy =
  | 'LAST_WRITE_WINS'
  | 'VERSION_VECTOR'
  | 'MULTI_VALUE'
  | 'CUSTOM_MERGE';

export interface IntegratedConsistency {
  readonly replicationEngine: ReplicationEngine;
  readonly readConsistency: ReadConsistency;
  readonly writeAckPolicy: WriteAckPolicy;
  readonly durability: DurabilityPolicy;
  readonly conflictStrategy: ConflictStrategy;
}

export type NetworkFaultType = 'PARTITION' | 'DELAY' | 'LOSS' | 'CLOCK_SKEW';
export type ProcessFaultType = 'CRASH' | 'RESTART' | 'RECOVER';
export type FaultType = NetworkFaultType | ProcessFaultType;

export interface IntegratedFaultParameters {
  readonly delayMs?: number;
  readonly jitterMs?: number;
  readonly lossRate?: number;
  readonly skewOffsetMs?: number;
  readonly recoveryTimeoutMs?: number;
  readonly [key: string]: unknown;
}

export interface IntegratedFaultEvent {
  readonly id: string;
  readonly type: FaultType;
  readonly targetNodes: readonly string[];
  readonly offsetMs: number;
  readonly durationMs: number;
  readonly parameters?: IntegratedFaultParameters;
}

export interface IntegratedFaultSchedule {
  readonly faults: readonly IntegratedFaultEvent[];
}

export interface IntegratedSlo {
  readonly targetP99Ms: number;
  readonly targetP95Ms?: number;
  readonly targetP50Ms?: number;
  readonly maxErrorRate: number;
  readonly maxStaleReadRate?: number;
  readonly minThroughputOpsSec?: number;
}

export interface IntegratedExperiment {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly contractVersion: '1.0.0';
  readonly masterSeed: number;
  readonly workload: IntegratedWorkload;
  readonly consistency: IntegratedConsistency;
  readonly faultSchedule?: IntegratedFaultSchedule;
  readonly slo?: IntegratedSlo;
  readonly metadata?: Record<string, unknown>;
}

// First-Class Operation Trace Artifact
export interface OperationTraceEntry {
  readonly sequence: number;
  readonly logicalClientId: number;
  readonly operation: 'GET' | 'PUT' | 'DELETE';
  readonly key: string;
  readonly value?: string;
  readonly scheduledOffsetUs?: number;
}

export interface CanonicalOperationTrace {
  readonly contractVersion: '1.0.0';
  readonly experimentSpecHash: string;
  readonly traceHash: string;
  readonly masterSeed: number;
  readonly entries: readonly OperationTraceEntry[];
  /**
   * Version of the workload-compiler package that produced this trace.
   * Required for replay identity: same spec + seed + compilerVersion = same trace.
   * If compiler logic changes (Zipf algorithm, key encoding, scheduling), bump
   * this version so consumers know a new trace is not identical to prior ones.
   * Format: semver string, e.g. '1.0.0'.
   */
  readonly workloadCompilerVersion: string;
  /**
   * Named algorithm used for key distribution (e.g. 'ycsb-rejection-inversion-v1').
   * Included in traceHash provenance so algorithm changes are detectable.
   */
  readonly distributionAlgorithm: string;
}

export type MetricSource =
  | 'BLACKBOX_SIMULATION'
  | 'BLACKBOX_REAL'
  | 'QUORUM_NODE'
  | 'QUORUM_CLIENT';

export type SemanticOutcomeCategory =
  | 'SUCCESS'
  | 'ROUTING_RETRYABLE_FAILURE'
  | 'WRITE_AVAILABILITY_FAILURE'
  | 'READ_AVAILABILITY_FAILURE'
  | 'LEADERSHIP_SAFETY_FAILURE'
  | 'MEMBERSHIP_SAFETY_FAILURE'
  | 'COORDINATION_LEASE_EXPIRED'
  | 'CONSISTENCY_REQUIREMENT_FAILURE'
  | 'INTERNAL_STORAGE_FAILURE';

export interface MetricSample {
  readonly operationId: string;
  readonly operationType: 'READ' | 'WRITE' | 'DELETE';
  readonly success: boolean;
  readonly source: MetricSource;
  readonly nodeId?: string;
  readonly errorCode?: string;
  readonly semanticCategory?: SemanticOutcomeCategory;
  readonly staleRead?: boolean;
  readonly causalAnomaly?: boolean;
  // Multi-clock domain separation
  readonly simulationTimeUs?: number; // Virtual calendar microsecond time (BLACKBOX-X)
  readonly realElapsedUs?: number;    // Measured physical duration in microseconds
  readonly wallTimeMs?: number;       // Unix epoch milliseconds (Quorum Wall Clock)
  readonly monotonicNs?: bigint | number; // Monotonic nanoseconds (Quorum Monotonic Clock)
}

export interface IntegratedRunMetrics {
  readonly totalOperations: number;
  readonly successfulOperations: number;
  readonly failedOperations: number;
  readonly throughputOpsSec: number;
  readonly p50LatencyMs: number;
  readonly p90LatencyMs: number;
  readonly p95LatencyMs: number;
  readonly p99LatencyMs: number;
  readonly minLatencyMs?: number;
  readonly maxLatencyMs?: number;
  readonly meanLatencyMs?: number;
  readonly staleReadCount?: number;
  readonly staleReadRate?: number;
  readonly causalAnomalies?: number;
}

export interface IntegratedDivergence {
  readonly ksStatistic: number;
  readonly ksPValue: number;
  readonly wassersteinDistance: number;
  readonly p50Mape: number;
  readonly p95Mape: number;
  readonly p99Mape: number;
  readonly throughputMape: number;
  readonly calibrated: boolean;
  readonly certified: boolean;
  readonly certificationDetails?: KsCertificationEvaluation;
}

// 12-state persisted run lifecycle state machine
export type SystemXRunState =
  | 'PLANNED'
  | 'VALIDATED'
  | 'COMPILED'
  | 'SIMULATED'
  | 'TARGET_READY'
  | 'RUNNING'
  | 'OBSERVING'
  | 'NORMALIZED'
  | 'COMPARED'
  | 'CALIBRATING'
  | 'VALIDATING'
  | 'CERTIFIED'
  | 'FAILED'
  | 'ABORTED'
  | 'CANCELLED'
  | 'TIMEOUT';

// Full research experiment provenance
export interface ExperimentProvenance {
  readonly integrationRunId: string;
  readonly experimentSpecHash: string;
  readonly traceHash?: string;
  readonly systemXVersion: string;
  readonly blackboxVersion: string;
  readonly blackboxGitSha: string;
  readonly blackboxImageDigest?: string;
  readonly quorumVersion: string;
  readonly quorumGitSha: string;
  readonly quorumImageDigest?: string;
  readonly schemaVersion: string;
  readonly infrastructureProfile: string;
  readonly createdAt: string;
}

export interface KsCertificationCriteria {
  readonly alpha: number; // e.g. 0.05
  readonly maxEngineeringDks: number; // e.g. 0.05
  readonly maxP99Mape: number; // e.g. 0.15 (15%)
  readonly maxThroughputMape: number; // e.g. 0.10 (10%)
}

export interface KsCertificationEvaluation {
  readonly passed: boolean;
  readonly hypothesisAccepted: boolean;
  readonly dKsWithinEngineeringLimit: boolean;
  readonly p99MapeWithinLimit: boolean;
  readonly throughputMapeWithinLimit: boolean;
  readonly reason?: string | undefined;
}

export interface IntegratedRunResult {
  readonly integrationRunId: string;
  readonly experimentSpecHash: string;
  readonly traceHash?: string;
  readonly blackboxRunId?: string;
  readonly quorumRunId?: string;
  readonly contractVersion: '1.0.0';
  readonly status: SystemXRunState;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly metrics: IntegratedRunMetrics;
  readonly provenance?: ExperimentProvenance;
  readonly samples?: readonly MetricSample[];
  readonly divergence?: IntegratedDivergence;
}
