import { strict as assert } from 'node:assert';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

export async function runQuorumProcessExperiment(dir, { observation } = {}) {
    const quorum = fileURLToPath(new URL('../../../QUORUM LAB/', import.meta.url));
    const req = createRequire(new URL('../../packages/quorum-adapter/package.json', import.meta.url));
    const grpc = req('@grpc/grpc-js');
    const protoLoader = req('@grpc/proto-loader');
    const grpcDir = join(quorum, 'packages/protocol/proto');
    const schema = grpc.loadPackageDefinition(protoLoader.loadSync(['node.proto', 'fault.proto'].map(p => join(grpcDir, p)), {
      keepCase: true, enums: String, longs: String, defaults: true, includeDirs: [grpcDir],
    }));
    const memberNames = ['qa-a','qa-b','qa-c'];
    const identity = 'audit-' + randomUUID();
    const childProcesses = new Set();
    const clients = [];
    const evidence = [];
    const rows = [];
    const checks = [
      ['QL-REAL-PEERS', 'Three independent processes expose real gRPC states for identical N=3 membership.'],
      ['QL-REAL-MINORITY', 'An isolated node cannot acknowledge a W=2 write. The remaining majority still reads and writes.'],
      ['QL-REAL-MAJORITY-LOSS', 'The last connected node rejects W=2 writes when both peers are unreachable.'],
      ['QL-REAL-HEAL', 'All three node-local reads return the post-heal value.'],
      ['QL-REAL-CRASH-WAL', 'Abruptly killed process restarts with the snapshot value and committed post-snapshot WAL write.'],
      ['QL-REAL-STALE-REPAIR', 'The isolated node serves an old value before healing. The gRPC repair endpoint brings it to the committed value.'],
      ['QL-REAL-TOMBSTONE-REPAIR', 'A tombstone repairs a stale replica and remains dominant after replay of the old version.'],
    ];
    if (observation) checks.push(['QL-HOSTED-OBSERVATION', 'The hosted HTTP evidence survives process restart and matches the exact bytes on all replicas.']);
    const ok = response => assert.equal(response.status?.code, 'STATUS_CODE_OK', JSON.stringify(response.status));
    async function reserve() {
      const listener = createServer();
      await new Promise((done, fail) => listener.listen(0, '127.0.0.1', done).once('error', fail));
      return listener;
    }
    const reservations = await Promise.all(Array.from({ length: 6 }, reserve));
    const nodes = memberNames.map((id, i) => ({
      id, grpc: reservations[i].address().port, http: reservations[i + 3].address().port,
      data: join(dir, id), generations: 0,
    }));
    const peers = nodes.map(n => n.id + '=127.0.0.1:' + n.grpc).join(',');
    await Promise.all(reservations.map(listener => new Promise(done => listener.close(done))));
    function call(client, method, input = {}, metadata = new grpc.Metadata()) {
      return new Promise((done, fail) => client[method](input, metadata, { deadline: new Date(Date.now() + 5000) },
        (error, response) => error ? fail(error) : done(response)));
    }
    async function startNode(node) {
      await mkdir(node.data, { recursive: true });
      const log = fs.openSync(join(dir, node.id + '-' + ++node.generations + '.log'), 'w');
      try {
        node.child = spawn(process.execPath, [join(quorum, 'apps/quorum-node/dist/main.js')], {
          cwd: quorum, stdio: ['ignore', log, log], windowsHide: true,
          env: { ...process.env, PORT: String(node.http), QUORUM_GRPC_PORT: String(node.grpc), QUORUM_GRPC_HOST: '127.0.0.1',
            QUORUM_NODE_ID: node.id, QUORUM_CLUSTER_ID: identity, QUORUM_CLUSTER_MEMBERS: memberNames.join(','),
            QUORUM_DATA_DIR: node.data, QUORUM_REPLICATION_MODE: 'QUORUM', QUORUM_WRITE_QUORUM: '2',
            QUORUM_READ_QUORUM: '2', QUORUM_PEER_ENDPOINTS: peers },
        });
        childProcesses.add(node.child);
        const endpoint = '127.0.0.1:' + node.grpc;
        node.rpc = new schema.quorum.node.v1.NodeService(endpoint, grpc.credentials.createInsecure());
        node.fault = new schema.quorum.fault.v1.FaultControlService(endpoint, grpc.credentials.createInsecure());
        clients.push(node.rpc, node.fault);
        for (let i = 0; i < 90; i++) {
          if (node.child.exitCode !== null) throw new Error(node.id + ' exited before health check');
          const health = await fetch('http://127.0.0.1:' + node.http + '/health', { signal: AbortSignal.timeout(300) }).catch(() => null);
          if (health?.ok) {
            const state = await call(node.rpc, 'GetNodeState');
            const status = await health.json();
            assert.equal(state.node_id, node.id);
            assert.deepEqual(state.membership.members, memberNames);
            assert.equal(status.replication, 'QUORUM');
            evidence.push({ id: node.id, pid: node.child.pid, endpoint, http: node.http, state });
            return;
          }
          await setTimeout(100);
        }
        throw new Error(node.id + ' failed readiness');
      } finally { fs.closeSync(log); }
    }
    async function kill(child) {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      const ended = new Promise(done => child.once('exit', done));
      child.kill('SIGKILL');
      await ended;
    }
    const put = (node, key, value, operation = key) => call(node.rpc, 'Put', {
      key, value: Buffer.from(value), run_id: identity, client_id: 'qa-client', operation_id: operation, request_id: operation,
    });
    const localRead = new grpc.Metadata();
    localRead.set('x-internal-quorum-read', '1');
    const entries = async (node, key) => (await call(node.rpc, 'Get', {
      key, run_id: identity, read_consistency: 'ONE',
    }, localRead)).key_state?.entries ?? [];
    async function value(node, key, read_consistency = 'ONE') {
      const result = await call(node.rpc, 'Get', { key, run_id: identity, read_consistency }, read_consistency === 'ONE' ? localRead : undefined);
      return result.key_state?.entries?.find(entry => !entry.tombstone)?.value?.toString('utf8');
    }
    async function eventually(read, expected) {
      for (let i = 0; i < 25; i++) {
        if (await read() === expected) return;
        await setTimeout(40);
      }
      assert.equal(await read(), expected);
    }
    const partition = (node, peer) => call(node.fault, 'SetFault', { rule: {
      fault_id: node.id + '-' + (peer ?? 'all'), fault_type: 'FAULT_TYPE_PARTITION', scope: 'FAULT_SCOPE_NODE_TO_NODE',
      target_node_id: node.id, ...(peer ? { peer_node_id: peer } : {}),
    } });
    function record(index, result, observed) {
      const [featureId, expected] = checks[index];
      rows.push({ featureId, runtimeMode: 'REAL-INTEGRATION', expected, result, observed });
    }
    let stage = 0;
    try {
      await Promise.all(nodes.map(startNode));
      assert.equal(new Set(nodes.map(node => node.child.pid)).size, 3);
      record(stage++, 'PASS', evidence.map(node => node.id + ' pid=' + node.pid + ' gRPC=' + node.endpoint).join(' | '));
      const [a, b, c] = nodes;
      ok(await put(a, 'before', 'committed'));
      for (const node of nodes) await eventually(() => value(node, 'before'), 'committed');
      for (const [node, peer] of [[a, c.id], [b, c.id], [c, undefined]]) ok(await partition(node, peer));
      const rejectedMinority = await put(c, 'minority', 'unacknowledged').catch(error => ({ error: error.message }));
      assert.notEqual(rejectedMinority.status?.code, 'STATUS_CODE_OK');
      ok(await put(a, 'majority', 'two-acks'));
      assert.equal(await value(b, 'majority', 'QUORUM'), 'two-acks');
      record(stage++, 'PASS', JSON.stringify({ rejectedMinority: rejectedMinority.status?.message ?? rejectedMinority.error, majorityRead: 'two-acks' }));
      ok(await partition(a, b.id));
      ok(await partition(b, a.id));
      const rejectedSingle = await put(a, 'majority-lost', 'unacknowledged').catch(error => ({ error: error.message }));
      assert.notEqual(rejectedSingle.status?.code, 'STATUS_CODE_OK');
      record(stage++, 'PASS', rejectedSingle.status?.message ?? rejectedSingle.error);
      const recoveryStart = performance.now();
      for (const node of nodes) ok(await call(node.fault, 'ClearAllFaults'));
      ok(await put(a, 'healed', 'fresh-after-heal'));
      for (const node of nodes) await eventually(() => value(node, 'healed'), 'fresh-after-heal');
      record(stage++, 'PASS', 'All replica-local reads converged in ' + Math.round(performance.now() - recoveryStart) + ' ms for a new post-heal key.');
      ok(await call(c.rpc, 'CreateSnapshot'));
      ok(await put(a, 'post-snapshot', 'durable-replica-value'));
      await eventually(() => value(c, 'post-snapshot'), 'durable-replica-value');
      const originalPid = c.child.pid;
      await kill(c.child);
      await startNode(c);
      assert.notEqual(c.child.pid, originalPid);
      assert.equal(await value(c, 'healed'), 'fresh-after-heal');
      assert.equal(await value(c, 'post-snapshot'), 'durable-replica-value');
      record(stage++, 'PASS', JSON.stringify({ originalPid, newPid: c.child.pid, files: await readdir(c.data), recovered: ['healed', 'post-snapshot'] }));
      ok(await put(a, 'stale-after-partition', 'old'));
      ok(await put(a, 'tombstone-after-partition', 'old'));
      await eventually(() => value(c, 'stale-after-partition'), 'old');
      await eventually(() => value(c, 'tombstone-after-partition'), 'old');
      const [oldEntry] = await entries(c, 'tombstone-after-partition');
      for (const [node, peer] of [[a, c.id], [b, c.id], [c, undefined]]) ok(await partition(node, peer));
      ok(await put(a, 'stale-after-partition', 'new', 'update-stale'));
      ok(await call(a.rpc, 'Delete', { key: 'tombstone-after-partition', run_id: identity, client_id: 'qa-client',
        operation_id: 'acknowledged-delete', request_id: 'acknowledged-delete' }));
      assert.equal(await value(c, 'stale-after-partition'), 'old');
      assert.equal(await value(c, 'tombstone-after-partition'), 'old');
      for (const node of nodes) ok(await call(node.fault, 'ClearAllFaults'));
      const latestEntry = (await entries(a, 'stale-after-partition')).find(entry => entry.value.toString('utf8') === 'new');
      assert.ok(latestEntry);
      const repairStart = performance.now();
      ok(await call(c.rpc, 'Repair', { key: 'stale-after-partition', entry: latestEntry }));
      for (const node of nodes) await eventually(() => value(node, 'stale-after-partition'), 'new');
      record(stage++, 'PASS', JSON.stringify({ before: 'old', after: 'new', repairMs: performance.now() - repairStart }));
      const tombstone = (await entries(a, 'tombstone-after-partition')).find(entry => entry.tombstone);
      assert.ok(tombstone, 'Committed tombstone must be observable through the node protocol.');
      ok(await call(c.rpc, 'Repair', { key: 'tombstone-after-partition', entry: tombstone }));
      assert.equal(await value(c, 'tombstone-after-partition'), undefined);
      ok(await call(c.rpc, 'Repair', { key: 'tombstone-after-partition', entry: oldEntry }));
      const afterReplay = await entries(c, 'tombstone-after-partition');
      assert.ok(afterReplay.some(entry => entry.tombstone));
      assert.ok(afterReplay.every(entry => entry.tombstone), 'Replaying the old value resurrected a deleted key.');
      record(stage++, 'PASS', 'Stale replica repaired with the exact committed tombstone and rejected resurrection.');
      if (observation) {
        const body = JSON.stringify(observation);
        ok(await put(a, 'hosted-observation', body));
        for (const node of nodes) await eventually(() => value(node, 'hosted-observation'), body);
        await kill(c.child);
        await startNode(c);
        assert.equal(await value(c, 'hosted-observation'), body);
        record(stage++, 'PASS', JSON.stringify({ replicas: nodes.length, recoveredPid: c.child.pid, digest: observation.sha256 }));
      }
    } catch (error) {
      record(stage, 'FAIL', error.message);
      console.error(error);
      for (let i = stage + 1; i < checks.length; i++) {
        record(i, 'BLOCKED', 'Initial verification stage failed. See per-process logs.');
      }
    } finally {
      for (const client of clients) client.close();
      await Promise.all([...childProcesses].map(kill));
    }
    return { rows, evidence };
}
