export const INTEGRATION_CONTRACT_VERSION = '1.0.0';

export type IntegratedDistribution = 'UNIFORM' | 'ZIPFIAN';

export interface IntegratedKeyRange {
  min: number;
  max: number;
}

export interface IntegratedWorkload {
  operationCount: number;
  concurrency: number;
  distribution: IntegratedDistribution;
  zipfianTheta?: number;
  keyRange: IntegratedKeyRange;
  readRatio: number;
  writeRatio: number;
  targetThroughputOpsSec?: number;
  valueSizeBytes?: number;
}

export type ReplicationEngine = 'LEADERLESS' | 'LEADER' | 'RAFT';
export type ReadConsistency = 'ONE' | 'QUORUM' | 'ALL' | 'EVENTUAL' | 'CAUSAL' | 'SESSION';
export type WriteAckPolicy = 'ONE' | 'QUORUM' | 'ALL';
export type DurabilityPolicy = 'MEMORY_ONLY' | 'BATCHED_FSYNC' | 'SYNC_FSYNC';
export type ConflictStrategy = 'LAST_WRITE_WINS' | 'VERSION_VECTOR' | 'MULTI_VALUE' | 'CUSTOM_MERGE';

export interface IntegratedConsistency {
  replicationEngine: ReplicationEngine;
  readConsistency: ReadConsistency;
  writeAckPolicy: WriteAckPolicy;
  durability: DurabilityPolicy;
  conflictStrategy: ConflictStrategy;
}

export type FaultType = 'PARTITION' | 'DELAY' | 'LOSS' | 'CLOCK_SKEW' | 'CRASH_RESTART';

export interface IntegratedFaultParameters {
  delayMs?: number;
  jitterMs?: number;
  lossRate?: number;
  skewOffsetMs?: number;
  cleanRestart?: boolean;
  [key: string]: unknown;
}

export interface IntegratedFaultEvent {
  id: string;
  type: FaultType;
  targetNodes: string[];
  offsetMs: number;
  durationMs: number;
  parameters?: IntegratedFaultParameters;
}

export interface IntegratedFaultSchedule {
  faults: IntegratedFaultEvent[];
}

export interface IntegratedSlo {
  targetP99Ms: number;
  targetP95Ms?: number;
  targetP50Ms?: number;
  maxErrorRate: number;
  maxStaleReadRate?: number;
  minThroughputOpsSec?: number;
}

export interface IntegratedExperiment {
  id: string;
  name: string;
  description?: string;
  contractVersion: '1.0.0';
  masterSeed: number;
  workload: IntegratedWorkload;
  consistency: IntegratedConsistency;
  faultSchedule?: IntegratedFaultSchedule;
  slo?: IntegratedSlo;
  metadata?: Record<string, unknown>;
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
  timestampMs: number;
  operationId: string;
  operationType: 'READ' | 'WRITE' | 'DELETE';
  latencyMs: number;
  success: boolean;
  source: MetricSource;
  nodeId?: string;
  errorCode?: string;
  semanticCategory?: SemanticOutcomeCategory;
  staleRead?: boolean;
  causalAnomaly?: boolean;
}

export interface IntegratedRunMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  throughputOpsSec: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs?: number;
  maxLatencyMs?: number;
  meanLatencyMs?: number;
  staleReadCount?: number;
  staleReadRate?: number;
  causalAnomalies?: number;
}

export interface IntegratedDivergence {
  ksStatistic: number;
  ksPValue: number;
  wassersteinDistance: number;
  p50Mape: number;
  p95Mape: number;
  p99Mape: number;
  calibrated: boolean;
}

export type RunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';

export interface IntegratedRunResult {
  integrationRunId: string;
  experimentSpecHash: string;
  blackboxRunId?: string;
  quorumRunId?: string;
  contractVersion: '1.0.0';
  status: RunStatus;
  startedAt: string;
  completedAt: string;
  metrics: IntegratedRunMetrics;
  samples?: MetricSample[];
  divergence?: IntegratedDivergence;
}
