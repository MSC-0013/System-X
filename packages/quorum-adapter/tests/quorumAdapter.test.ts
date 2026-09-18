import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify, { FastifyInstance } from 'fastify';
import {
  QuorumControlApiClient,
  QuorumControlApiError,
  ClusterDiscovery,
  QuorumNodeClient,
  QuorumRunSession,
  QuorumRunExecutionRequest
} from '../src/index.js';

describe('QUORUM Target Adapter (Milestone I1)', () => {
  let mockServer: FastifyInstance;
  let serverUrl: string;

  const mockDb = {
    runs: new Map<string, any>(),
    clusters: new Map<string, any>(),
    nodes: new Map<string, any[]>()
  };

  beforeAll(async () => {
    mockServer = fastify({ logger: false });

    // Seed mock cluster
    mockDb.clusters.set('cluster-alpha', {
      id: 'cluster-alpha',
      projectId: 'proj-1',
      name: 'Cluster-Alpha',
      members: ['node-1', 'node-2', 'node-3'],
      policy: {
        replicationEngine: 'LEADERLESS',
        readConsistency: { mode: 'QUORUM' },
        writeAck: { mode: 'QUORUM' }
      },
      membershipVersion: 1,
      membershipHash: 'hash-abc',
      resolvedQuorum: { N: 3, W: 2, R: 2, hasQuorumIntersection: true }
    });

    mockDb.nodes.set('cluster-alpha', [
      { id: 'node-1', clusterId: 'cluster-alpha', grpcAddress: '127.0.0.1:50051', registeredAt: new Date().toISOString() },
      { id: 'node-2', clusterId: 'cluster-alpha', grpcAddress: '127.0.0.1:50052', registeredAt: new Date().toISOString() },
      { id: 'node-3', clusterId: 'cluster-alpha', grpcAddress: '127.0.0.1:50053', registeredAt: new Date().toISOString() }
    ]);

    // Mock Control API Routes
    mockServer.get('/v1/clusters/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const cluster = mockDb.clusters.get(id);
      if (!cluster) return reply.status(404).send({ error: 'Cluster not found' });
      return reply.send(cluster);
    });

    mockServer.get('/v1/clusters/:id/nodes', async (req, reply) => {
      const { id } = req.params as { id: string };
      const nodes = mockDb.nodes.get(id) ?? [];
      return reply.send(nodes);
    });

    mockServer.post('/v1/experiments/:id/runs', async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { rootSeed?: string };
      const runId = `run-${Date.now()}`;
      const record = {
        id: runId,
        experimentId: id,
        clusterId: 'cluster-alpha',
        status: 'QUEUED',
        rootSeed: body.rootSeed ?? 'seed-default',
        clusterPolicySnapshot: { writeAck: { mode: 'QUORUM' } },
        membershipSnapshot: { version: 1, members: ['node-1', 'node-2', 'node-3'], hash: 'hash-abc' },
        createdAt: new Date().toISOString()
      };
      mockDb.runs.set(runId, record);
      return reply.status(201).send(record);
    });

    mockServer.get('/v1/runs/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const run = mockDb.runs.get(id);
      if (!run) return reply.status(404).send({ error: 'Run not found' });
      return reply.send(run);
    });

    mockServer.post('/v1/runs/:id/execute', async (req, reply) => {
      const { id } = req.params as { id: string };
      const run = mockDb.runs.get(id);
      if (!run) return reply.status(404).send({ error: 'Run not found' });

      const idempotencyKey = req.headers['idempotency-key'] as string;
      const body = (req.body ?? {}) as any;

      if (run.status === 'EXECUTION_REQUESTED' || run.status === 'RUNNING') {
        if (run.idempotencyKey === idempotencyKey || run.executionId === body.executionId) {
          return reply.status(202).send(run); // Idempotent return
        }
        return reply.status(409).send({ error: 'Conflict: Run is already active under different execution' });
      }

      run.status = 'EXECUTION_REQUESTED';
      run.executionId = body.executionId;
      run.idempotencyKey = idempotencyKey;
      run.artifact = body.artifact;
      mockDb.runs.set(id, run);

      return reply.status(202).send(run);
    });

    mockServer.post('/v1/runs/:id/cancel', async (req, reply) => {
      const { id } = req.params as { id: string };
      const run = mockDb.runs.get(id);
      if (!run) return reply.status(404).send({ error: 'Run not found' });

      const body = (req.body ?? {}) as { reason?: string };
      run.status = 'CANCELLED';
      run.cancelReason = body.reason ?? 'Cancelled by request';
      mockDb.runs.set(id, run);

      return reply.status(200).send(run);
    });

    await mockServer.listen({ port: 0, host: '127.0.0.1' });
    const address = mockServer.server.address() as { port: number };
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await mockServer.close();
  });

  describe('1. Control API REST Client & Idempotent Execution', () => {
    it('creates run and transitions to EXECUTION_REQUESTED upon execute call', async () => {
      const client = new QuorumControlApiClient({ baseUrl: serverUrl });

      // 1. Create run -> status QUEUED
      const run = await client.createRun('exp-001', { rootSeed: '1337' });
      expect(run.status).toBe('QUEUED');

      // 2. Execute run -> status EXECUTION_REQUESTED
      const execRequest: QuorumRunExecutionRequest = {
        executionId: 'exec-alpha-1',
        artifact: {
          uri: 'minio://artifacts/trace.json',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          mediaType: 'application/json'
        },
        executionOptions: { durationMs: 5000, concurrency: 8 }
      };

      const executedRun = await client.executeRun(run.id, execRequest);
      expect(executedRun.status).toBe('EXECUTION_REQUESTED');
      expect(executedRun.executionId).toBe('exec-alpha-1');

      // 3. Idempotent retry with identical executionId succeeds and returns same record
      const retriedRun = await client.executeRun(run.id, execRequest);
      expect(retriedRun.status).toBe('EXECUTION_REQUESTED');
      expect(retriedRun.id).toBe(run.id);
    });

    it('rejects executeRun with conflicting executionId with HTTP 409', async () => {
      const client = new QuorumControlApiClient({ baseUrl: serverUrl });
      const run = await client.createRun('exp-001');

      await client.executeRun(run.id, { executionId: 'exec-first' });

      // Attempt second execution with different executionId -> 409
      await expect(
        client.executeRun(run.id, { executionId: 'exec-second-conflict' })
      ).rejects.toThrow(QuorumControlApiError);
    });

    it('cancels an active run safely via cancelRun', async () => {
      const client = new QuorumControlApiClient({ baseUrl: serverUrl });
      const run = await client.createRun('exp-001');

      await client.executeRun(run.id, { executionId: 'exec-to-cancel' });

      const cancelled = await client.cancelRun(run.id, 'Stuck experiment in research sweep');
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancelReason).toBe('Stuck experiment in research sweep');
    });

    it('polls until terminal state successfully', async () => {
      const client = new QuorumControlApiClient({ baseUrl: serverUrl });
      const run = await client.createRun('exp-001');

      // Simulate worker setting run to COMPLETED after 200ms
      setTimeout(() => {
        const r = mockDb.runs.get(run.id);
        if (r) {
          r.status = 'COMPLETED';
          r.result = { totalOperations: 100, successfulOperations: 100, failedOperations: 0, divergenceDetected: false, anomaliesFound: [] };
          mockDb.runs.set(run.id, r);
        }
      }, 200);

      const completed = await client.pollRunUntilComplete(run.id, { intervalMs: 50, timeoutMs: 2000 });
      expect(completed.status).toBe('COMPLETED');
      expect(completed.result?.totalOperations).toBe(100);
    });
  });

  describe('2. Policy-Driven Cluster Readiness & Discovery', () => {
    it('evaluates leaderless cluster readiness without hardcoding N >= 3 or requiring a leader', async () => {
      const controlClient = new QuorumControlApiClient({ baseUrl: serverUrl });
      const mockNodeClient = {
        checkHealth: async () => ({ servingStatus: 'SERVING', healthy: true, latencyMs: 5 })
      } as unknown as QuorumNodeClient;

      const discovery = new ClusterDiscovery(controlClient, mockNodeClient);
      const report = await discovery.probeClusterReadiness('cluster-alpha');

      expect(report.status).toBe('READY');
      expect(report.nodeCount).toBe(3);
      expect(report.healthyNodes).toEqual(['node-1', 'node-2', 'node-3']);
      // Invariant: leaderNode is undefined for leaderless quorums
      expect(report.leaderNode).toBeUndefined();
      expect(report.quorumSatisfied).toBe(true);
      expect(report.policyCompatible).toBe(true);
    });

    it('marks cluster DEGRADED but serving when majority quorum is preserved', async () => {
      const controlClient = new QuorumControlApiClient({ baseUrl: serverUrl });
      const mockNodeClient = {
        checkHealth: async (addr: string) => {
          // node-3 fails, node-1 and node-2 healthy
          if (addr.includes('50053')) {
            throw new Error('Node down');
          }
          return { servingStatus: 'SERVING', healthy: true, latencyMs: 5 };
        }
      } as unknown as QuorumNodeClient;

      const discovery = new ClusterDiscovery(controlClient, mockNodeClient);
      const report = await discovery.probeClusterReadiness('cluster-alpha');

      // 2 out of 3 healthy: W=2 is satisfied, so quorumSatisfied = true
      expect(report.status).toBe('DEGRADED');
      expect(report.healthyNodes).toEqual(['node-1', 'node-2']);
      expect(report.unhealthyNodes).toEqual(['node-3']);
      expect(report.quorumSatisfied).toBe(true);
    });
  });

  describe('3. Wire Protobuf Bundle & QuorumNodeClient Integration', () => {
    it('initializes QuorumNodeClient successfully against bundled proto definitions', () => {
      const nodeClient = new QuorumNodeClient();
      expect(nodeClient).toBeDefined();
      // Verifies close works cleanly
      nodeClient.close();
    });
  });

  describe('4. QuorumRunSession Lifecycle Orchestrator', () => {
    it('dispatches run and monitors lifecycle through QuorumRunSession', async () => {
      const controlClient = new QuorumControlApiClient({ baseUrl: serverUrl });
      const mockNodeClient = {
        checkHealth: async () => ({ servingStatus: 'SERVING', healthy: true, latencyMs: 5 })
      } as unknown as QuorumNodeClient;

      const discovery = new ClusterDiscovery(controlClient, mockNodeClient);
      const session = new QuorumRunSession(controlClient, discovery);

      // 1. Validate readiness
      const readiness = await session.validateTargetReadiness('cluster-alpha');
      expect(readiness.status).toBe('READY');

      // 2. Dispatch run
      const run = await session.dispatchRun('exp-001', {
        executionId: 'session-exec-1',
        seed: 42
      });
      expect(run.status).toBe('EXECUTION_REQUESTED');

      // 3. Abort run
      const aborted = await session.abortRun(run.id, 'Teardown');
      expect(aborted.status).toBe('CANCELLED');
    });
  });
});
