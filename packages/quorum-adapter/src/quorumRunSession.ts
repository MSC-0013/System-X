import { QuorumControlApiClient } from './controlApiClient.js';
import { ClusterDiscovery } from './clusterDiscovery.js';
import {
  ClusterReadinessReport,
  QuorumRunDto,
  QuorumRunExecutionRequest
} from './types.js';

export class QuorumRunSession {
  constructor(
    private readonly controlApi: QuorumControlApiClient,
    private readonly discovery: ClusterDiscovery
  ) {}

  /**
   * Validates that the target cluster is ready to accept experiment workloads.
   */
  public async validateTargetReadiness(clusterId: string): Promise<ClusterReadinessReport> {
    const report = await this.discovery.probeClusterReadiness(clusterId);
    if (report.status === 'NOT_READY') {
      throw new Error(
        `Target cluster ${clusterId} is NOT_READY. Healthy nodes: [${report.healthyNodes.join(', ')}], Unhealthy: [${report.unhealthyNodes.join(', ')}]`
      );
    }
    return report;
  }

  /**
   * Queues and dispatches an execution request onto the target QUORUM cluster.
   * Invariant: State transitions QUEUED -> EXECUTION_REQUESTED.
   */
  public async dispatchRun(
    experimentId: string,
    request: QuorumRunExecutionRequest
  ): Promise<QuorumRunDto> {
    // 1. Queue run (captures immutable snapshot of cluster policy & membership)
    const queuedRun = await this.controlApi.createRun(
      experimentId,
      request.seed !== undefined ? { rootSeed: String(request.seed) } : {}
    );

    // 2. Dispatch execution request with Idempotency-Key
    return this.controlApi.executeRun(queuedRun.id, request);
  }

  /**
   * Polls the active run until it completes or reaches a terminal state.
   */
  public async awaitRunCompletion(
    runId: string,
    options: {
      timeoutMs?: number;
      intervalMs?: number;
      onProgress?: (run: QuorumRunDto) => void;
    } = {}
  ): Promise<QuorumRunDto> {
    return this.controlApi.pollRunUntilComplete(runId, options);
  }

  /**
   * Safely cancels a running or queued experiment.
   */
  public async abortRun(runId: string, reason?: string): Promise<QuorumRunDto> {
    return this.controlApi.cancelRun(runId, reason);
  }
}
