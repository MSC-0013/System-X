export interface QuorumProjectDto {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly createdAt: string;
}
export interface QuorumClusterDto {
    readonly id: string;
    readonly projectId: string;
    readonly name: string;
    readonly members: readonly string[];
    readonly policy: Record<string, unknown>;
    readonly membershipVersion: number;
    readonly membershipHash: string;
    readonly resolvedQuorum?: {
        readonly N: number;
        readonly W: number;
        readonly R: number;
        readonly hasQuorumIntersection: boolean;
    };
}
export interface QuorumNodeDto {
    readonly id: string;
    readonly clusterId: string;
    readonly grpcAddress: string;
    readonly registeredAt: string;
}
export interface QuorumExperimentDto {
    readonly id: string;
    readonly projectId: string;
    readonly clusterId: string;
    readonly name: string;
    readonly description?: string;
    readonly workload: Record<string, unknown>;
    readonly faultTimeline?: readonly Record<string, unknown>[];
    readonly createdAt: string;
}
export type QuorumRunStatus = 'QUEUED' | 'EXECUTION_REQUESTED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED' | 'CANCELLED';
export interface QuorumRunDto {
    readonly id: string;
    readonly experimentId: string;
    readonly clusterId: string;
    readonly status: QuorumRunStatus;
    readonly rootSeed: string;
    readonly clusterPolicySnapshot: Record<string, unknown>;
    readonly membershipSnapshot: {
        readonly version: number;
        readonly members: readonly string[];
        readonly hash: string;
    };
    readonly executionId?: string;
    readonly idempotencyKey?: string;
    readonly artifact?: {
        readonly uri: string;
        readonly sha256: string;
        readonly mediaType: string;
    };
    readonly cancelReason?: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly result?: {
        readonly totalOperations: number;
        readonly successfulOperations: number;
        readonly failedOperations: number;
        readonly divergenceDetected: boolean;
        readonly anomaliesFound: readonly string[];
        readonly traceLogUri?: string;
    };
    readonly createdAt: string;
}
export interface QuorumRunExecutionRequest {
    readonly executionId: string;
    readonly artifact?: {
        readonly uri: string;
        readonly sha256: string;
        readonly mediaType: string;
    };
    readonly seed?: number;
    readonly executionOptions?: {
        readonly durationMs?: number;
        readonly concurrency?: number;
    };
}
export interface ClusterReadinessReport {
    readonly status: 'READY' | 'DEGRADED' | 'NOT_READY';
    readonly nodeCount: number;
    readonly healthyNodes: readonly string[];
    readonly unhealthyNodes: readonly string[];
    readonly leaderNode?: string;
    readonly quorumSatisfied: boolean;
    readonly policyCompatible: boolean;
    readonly metricsEndpointsHealthy: boolean;
}
export interface QuorumNodeTlsConfig {
    readonly enabled: boolean;
    readonly caCert?: string;
    readonly clientCert?: string;
    readonly clientKey?: string;
    readonly serverName?: string;
}
export interface RetryPolicyConfig {
    readonly maxRetries: number;
    readonly initialBackoffMs: number;
    readonly maxBackoffMs: number;
    readonly backoffMultiplier: number;
}
export interface ControlApiClientConfig {
    readonly baseUrl: string;
    readonly timeoutMs?: number;
    readonly retryPolicy?: RetryPolicyConfig;
    readonly customHeaders?: Record<string, string>;
}
export declare class QuorumControlApiError extends Error {
    readonly statusCode: number;
    readonly endpoint: string;
    readonly errorPayload?: unknown;
    constructor(message: string, statusCode: number, endpoint: string, errorPayload?: unknown);
}
export declare class QuorumNodeError extends Error {
    readonly nodeEndpoint: string;
    readonly grpcCode?: number | undefined;
    constructor(message: string, nodeEndpoint: string, grpcCode?: number);
}
//# sourceMappingURL=types.d.ts.map