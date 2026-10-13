/**
 * Validate a single campaign cell against the QUORUM capability matrix.
 */
export function validateCellCapability(cell, capabilities) {
    // Check read consistency.
    if (!capabilities.supportedReadConsistency.includes(cell.consistency.readConsistency)) {
        return {
            valid: false,
            reason: `Read consistency '${cell.consistency.readConsistency}' is not supported by the QUORUM cluster`,
        };
    }
    // Check write ack policy.
    if (!capabilities.supportedWriteAckPolicies.includes(cell.consistency.writeAckPolicy)) {
        return {
            valid: false,
            reason: `Write ack policy '${cell.consistency.writeAckPolicy}' is not supported`,
        };
    }
    // Check conflict strategy.
    if (!capabilities.supportedConflictStrategies.includes(cell.consistency.conflictStrategy)) {
        return {
            valid: false,
            reason: `Conflict strategy '${cell.consistency.conflictStrategy}' is not supported`,
        };
    }
    // Check fault type.
    if (!capabilities.supportedFaultTypes.includes(cell.fault.faultType)) {
        return {
            valid: false,
            reason: `Fault type '${cell.fault.faultType}' is not supported by the QUORUM cluster`,
        };
    }
    // Check concurrency within cluster capacity.
    if (cell.load.concurrency > capabilities.maxConcurrency) {
        return {
            valid: false,
            reason: `Concurrency ${cell.load.concurrency} exceeds cluster maxConcurrency=${capabilities.maxConcurrency}`,
        };
    }
    // ---------------------------------------------------------------------------
    // Policy-derived topology requirements (NOT a blanket N≥3 rule).
    //
    //  - ALL: requires all N nodes → requires minNodeCount >= 1 (no specific min).
    //  - QUORUM read + QUORUM write: requires W + R > N for safety.
    //    For strict quorum with N nodes: W = ceil((N+1)/2), R = ceil((N+1)/2).
    //    Minimum cluster that can form a write quorum: N >= 2 (W=2,R=2 with N=3
    //    is the smallest fault-tolerant quorum). Policy check: N >= quorumN.
    //  - RAFT replication: requires 2f+1 nodes for f fault tolerance.
    //    Minimum fault-tolerant RAFT: N=3 (f=1). Single-node RAFT: N=1 (f=0).
    //    Policy check: N >= raftMinNodes.
    //  - LEADERLESS async replication: can work with N=2 (no consensus needed).
    //  - Fault injection experiments: need spare capacity beyond the faulted nodes.
    // ---------------------------------------------------------------------------
    // QUORUM read/write policy requires cluster to meet the quorum size threshold.
    if (capabilities.quorumNodeRequirement !== undefined) {
        const needsQuorumPolicy = cell.consistency.readConsistency === 'QUORUM' ||
            cell.consistency.writeAckPolicy === 'QUORUM';
        if (needsQuorumPolicy && capabilities.minNodeCount < capabilities.quorumNodeRequirement) {
            return {
                valid: false,
                reason: `QUORUM policy requires minNodeCount >= ${capabilities.quorumNodeRequirement} ` +
                    `(quorumNodeRequirement), but cluster has ${capabilities.minNodeCount}`,
            };
        }
    }
    // RAFT replication requires minimum node count for fault tolerance.
    if (capabilities.raftMinNodes !== undefined) {
        const needsRaft = cell.consistency.readConsistency === 'ALL' ||
            cell.consistency.writeAckPolicy === 'ALL';
        if (needsRaft && capabilities.minNodeCount < capabilities.raftMinNodes) {
            return {
                valid: false,
                reason: `Raft ALL policy requires minNodeCount >= ${capabilities.raftMinNodes} ` +
                    `(raftMinNodes), but cluster has ${capabilities.minNodeCount}`,
            };
        }
    }
    // Fault injection: if faulting targetFraction of nodes, cluster must have enough
    // nodes left to remain operational (at least 1 healthy node).
    if (cell.fault.targetFraction > 0 && capabilities.minNodeCount > 0) {
        const faultedNodes = Math.ceil(cell.fault.targetFraction * capabilities.minNodeCount);
        const healthyNodes = capabilities.minNodeCount - faultedNodes;
        if (healthyNodes < 1) {
            return {
                valid: false,
                reason: `Fault targetFraction=${cell.fault.targetFraction} would fault all ` +
                    `${faultedNodes}/${capabilities.minNodeCount} nodes, leaving 0 healthy`,
            };
        }
    }
    return { valid: true };
}
//# sourceMappingURL=capabilityValidator.js.map