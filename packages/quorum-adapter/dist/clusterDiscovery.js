export class ClusterDiscovery {
    controlApi;
    nodeClient;
    constructor(controlApi, nodeClient) {
        this.controlApi = controlApi;
        this.nodeClient = nodeClient;
    }
    /**
     * Probes Prometheus HTTP metrics endpoint (:8080/metrics) without blocking serving readiness.
     */
    async probeMetricsEndpoint(host, port = 8080) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1000);
            const res = await fetch(`http://${host}:${port}/metrics`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timer);
            return res.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Dynamically discovers cluster nodes and evaluates readiness against cluster policy.
     *
     * Invariants:
     * 1. No hardcoded ports: addresses are derived from Control API registered nodes.
     * 2. No hardcoded N >= 3: async replication with N=2 or single-node tests are supported.
     * 3. leaderNode is optional: leaderless quorums legitimately have no leader.
     * 4. Metrics availability (:8080) is diagnostic and does not block serving readiness.
     */
    async probeClusterReadiness(clusterId) {
        const cluster = await this.controlApi.getCluster(clusterId);
        const nodes = await this.controlApi.getClusterNodes(clusterId);
        if (nodes.length === 0) {
            return {
                status: 'NOT_READY',
                nodeCount: 0,
                healthyNodes: [],
                unhealthyNodes: [],
                quorumSatisfied: false,
                policyCompatible: false,
                metricsEndpointsHealthy: false
            };
        }
        const healthyNodes = [];
        const unhealthyNodes = [];
        const metricsHealthMap = new Map();
        // Concurrently probe gRPC health and HTTP metrics for all nodes
        await Promise.all(nodes.map(async (node) => {
            try {
                const health = await this.nodeClient.checkHealth(node.grpcAddress, '', 3000);
                if (health.healthy) {
                    healthyNodes.push(node.id);
                }
                else {
                    unhealthyNodes.push(node.id);
                }
            }
            catch {
                unhealthyNodes.push(node.id);
            }
            // Extract host for metrics probing
            const [host] = node.grpcAddress.split(':');
            const metricsOk = await this.probeMetricsEndpoint(host ?? '127.0.0.1', 8080);
            metricsHealthMap.set(node.id, metricsOk);
        }));
        const metricsEndpointsHealthy = Array.from(metricsHealthMap.values()).every(Boolean);
        // Evaluate policy compatibility
        const replicationEngine = cluster.policy?.replicationEngine ?? 'LEADERLESS';
        let quorumSatisfied = false;
        let policyCompatible = false;
        let leaderNode = undefined;
        const totalNodes = nodes.length;
        const healthyCount = healthyNodes.length;
        if (replicationEngine === 'LEADERLESS') {
            // Leaderless: no leader required
            leaderNode = undefined;
            const W = (cluster.resolvedQuorum?.W ?? Math.floor(totalNodes / 2) + 1);
            const R = (cluster.resolvedQuorum?.R ?? Math.floor(totalNodes / 2) + 1);
            // Quorum is satisfied if healthy nodes can form write quorum (healthyCount >= W)
            quorumSatisfied = healthyCount >= W;
            policyCompatible = (W + R) > totalNodes;
        }
        else if (replicationEngine === 'RAFT' || replicationEngine === 'LEADER') {
            // Majority required: majority = floor(N / 2) + 1
            const majority = Math.floor(totalNodes / 2) + 1;
            quorumSatisfied = healthyCount >= majority;
            policyCompatible = totalNodes >= 3; // Raft requires odd majority typically
            // Leader could be first healthy node or designated
            leaderNode = healthyNodes[0];
        }
        else {
            // Async / relaxed: requires at least 1 healthy node
            quorumSatisfied = healthyCount >= 1;
            policyCompatible = true;
        }
        let status;
        if (healthyCount === totalNodes && quorumSatisfied) {
            status = 'READY';
        }
        else if (quorumSatisfied) {
            status = 'DEGRADED';
        }
        else {
            status = 'NOT_READY';
        }
        return {
            status,
            nodeCount: totalNodes,
            healthyNodes: Object.freeze(healthyNodes),
            unhealthyNodes: Object.freeze(unhealthyNodes),
            ...(leaderNode ? { leaderNode } : {}),
            quorumSatisfied,
            policyCompatible,
            metricsEndpointsHealthy
        };
    }
}
//# sourceMappingURL=clusterDiscovery.js.map