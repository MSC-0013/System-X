import { QuorumControlApiClient } from './controlApiClient.js';
import { QuorumNodeClient } from './quorumNodeClient.js';
import { ClusterReadinessReport } from './types.js';
export declare class ClusterDiscovery {
    private readonly controlApi;
    private readonly nodeClient;
    constructor(controlApi: QuorumControlApiClient, nodeClient: QuorumNodeClient);
    /**
     * Probes Prometheus HTTP metrics endpoint (:8080/metrics) without blocking serving readiness.
     */
    private probeMetricsEndpoint;
    /**
     * Dynamically discovers cluster nodes and evaluates readiness against cluster policy.
     *
     * Invariants:
     * 1. No hardcoded ports: addresses are derived from Control API registered nodes.
     * 2. No hardcoded N >= 3: async replication with N=2 or single-node tests are supported.
     * 3. leaderNode is optional: leaderless quorums legitimately have no leader.
     * 4. Metrics availability (:8080) is diagnostic and does not block serving readiness.
     */
    probeClusterReadiness(clusterId: string): Promise<ClusterReadinessReport>;
}
//# sourceMappingURL=clusterDiscovery.d.ts.map