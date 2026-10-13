export class QuorumRunSession {
    controlApi;
    discovery;
    constructor(controlApi, discovery) {
        this.controlApi = controlApi;
        this.discovery = discovery;
    }
    /**
     * Validates that the target cluster is ready to accept experiment workloads.
     */
    async validateTargetReadiness(clusterId) {
        const report = await this.discovery.probeClusterReadiness(clusterId);
        if (report.status === 'NOT_READY') {
            throw new Error(`Target cluster ${clusterId} is NOT_READY. Healthy nodes: [${report.healthyNodes.join(', ')}], Unhealthy: [${report.unhealthyNodes.join(', ')}]`);
        }
        return report;
    }
    /**
     * Queues and dispatches an execution request onto the target QUORUM cluster.
     * Invariant: State transitions QUEUED -> EXECUTION_REQUESTED.
     */
    async dispatchRun(experimentId, request) {
        // 1. Queue run (captures immutable snapshot of cluster policy & membership)
        const queuedRun = await this.controlApi.createRun(experimentId, request.seed !== undefined ? { rootSeed: String(request.seed) } : {});
        // 2. Dispatch execution request with Idempotency-Key
        return this.controlApi.executeRun(queuedRun.id, request);
    }
    /**
     * Polls the active run until it completes or reaches a terminal state.
     */
    async awaitRunCompletion(runId, options = {}) {
        return this.controlApi.pollRunUntilComplete(runId, options);
    }
    /**
     * Safely cancels a running or queued experiment.
     */
    async abortRun(runId, reason) {
        return this.controlApi.cancelRun(runId, reason);
    }
}
//# sourceMappingURL=quorumRunSession.js.map