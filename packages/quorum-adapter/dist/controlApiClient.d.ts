import { ControlApiClientConfig, QuorumProjectDto, QuorumClusterDto, QuorumNodeDto, QuorumExperimentDto, QuorumRunDto, QuorumRunExecutionRequest, RetryPolicyConfig } from './types.js';
export declare const DEFAULT_RETRY_POLICY: RetryPolicyConfig;
export declare class QuorumControlApiClient {
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly retryPolicy;
    private readonly customHeaders;
    constructor(config: ControlApiClientConfig);
    private request;
    createProject(params: {
        name: string;
        description?: string;
    }): Promise<QuorumProjectDto>;
    getProject(id: string): Promise<QuorumProjectDto>;
    listProjects(): Promise<readonly QuorumProjectDto[]>;
    createCluster(params: {
        projectId: string;
        name: string;
        members: string[];
        policy: Record<string, unknown>;
    }): Promise<QuorumClusterDto>;
    getCluster(id: string): Promise<QuorumClusterDto>;
    listClusters(projectId?: string): Promise<readonly QuorumClusterDto[]>;
    registerNode(clusterId: string, params: {
        nodeId: string;
        grpcAddress: string;
    }): Promise<QuorumNodeDto>;
    getClusterNodes(clusterId: string): Promise<readonly QuorumNodeDto[]>;
    setClusterPolicy(clusterId: string, policy: Record<string, unknown>): Promise<QuorumClusterDto>;
    createExperiment(params: {
        projectId: string;
        clusterId: string;
        name: string;
        description?: string;
        workload: Record<string, unknown>;
        faultTimeline?: readonly Record<string, unknown>[];
    }): Promise<QuorumExperimentDto>;
    getExperiment(id: string): Promise<QuorumExperimentDto>;
    listExperiments(clusterId?: string): Promise<readonly QuorumExperimentDto[]>;
    createRun(experimentId: string, params?: {
        rootSeed?: string;
        runId?: string;
    }): Promise<QuorumRunDto>;
    getRun(runId: string): Promise<QuorumRunDto>;
    listRuns(experimentId?: string): Promise<readonly QuorumRunDto[]>;
    /**
     * Idempotent public run execution dispatch.
     * Sends Idempotency-Key: executionId.
     */
    executeRun(runId: string, request: QuorumRunExecutionRequest): Promise<QuorumRunDto>;
    /**
     * Safe cancellation of an active or queued run.
     */
    cancelRun(runId: string, reason?: string): Promise<QuorumRunDto>;
    /**
     * Polls a run until terminal state (COMPLETED, FAILED, ABORTED, CANCELLED).
     */
    pollRunUntilComplete(runId: string, options?: {
        intervalMs?: number;
        timeoutMs?: number;
        onProgress?: (run: QuorumRunDto) => void;
    }): Promise<QuorumRunDto>;
}
//# sourceMappingURL=controlApiClient.d.ts.map