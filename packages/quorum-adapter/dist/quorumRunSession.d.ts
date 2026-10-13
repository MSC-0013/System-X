import { QuorumControlApiClient } from './controlApiClient.js';
import { ClusterDiscovery } from './clusterDiscovery.js';
import { ClusterReadinessReport, QuorumRunDto, QuorumRunExecutionRequest } from './types.js';
export declare class QuorumRunSession {
    private readonly controlApi;
    private readonly discovery;
    constructor(controlApi: QuorumControlApiClient, discovery: ClusterDiscovery);
    /**
     * Validates that the target cluster is ready to accept experiment workloads.
     */
    validateTargetReadiness(clusterId: string): Promise<ClusterReadinessReport>;
    /**
     * Queues and dispatches an execution request onto the target QUORUM cluster.
     * Invariant: State transitions QUEUED -> EXECUTION_REQUESTED.
     */
    dispatchRun(experimentId: string, request: QuorumRunExecutionRequest): Promise<QuorumRunDto>;
    /**
     * Polls the active run until it completes or reaches a terminal state.
     */
    awaitRunCompletion(runId: string, options?: {
        timeoutMs?: number;
        intervalMs?: number;
        onProgress?: (run: QuorumRunDto) => void;
    }): Promise<QuorumRunDto>;
    /**
     * Safely cancels a running or queued experiment.
     */
    abortRun(runId: string, reason?: string): Promise<QuorumRunDto>;
}
//# sourceMappingURL=quorumRunSession.d.ts.map