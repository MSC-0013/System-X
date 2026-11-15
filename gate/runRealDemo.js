/** Local empirical evidence run: actual sibling engines, measured samples, no synthetic certification. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { QuorumNodeApp, SimulationRunner, engineAvailability } from './clusterAdapters.js';
import { computeExperimentSpecHash } from '@system-x/integration-contracts';
import { compileWorkload } from '@system-x/workload-compiler';
import { compileFaultSchedule } from '@system-x/fault-compiler';
import { normalizeRunResult } from '@system-x/result-normalizer';
import { generateComparisonReport, DEFAULT_COMPARISON_CRITERIA } from '@system-x/comparison-engine';
import { evaluateCertification, computeSha256 } from '@system-x/certification-gate';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function runRealDemo() {
    for (const engine of Object.values(engineAvailability))
        if (!engine.available)
            throw new Error(engine.error);
    const runId = `run-${Date.now().toString(36)}`;
    const artifactDir = path.resolve(process.env.SYSTEM_X_ARTIFACTS_DIR ?? path.join(root, 'artifacts'), runId);
    const temporaryRoot = fs.mkdtempSync(path.join(root, 'tmp-cluster-'));
    const members = ['node-1', 'node-2', 'node-3'];
    const masterSeed = 1337;
    const workload = { operationCount: 150, concurrency: 8, distribution: 'ZIPFIAN', zipfianTheta: 0.99, keyRange: { min: 1000, max: 2000 }, readRatio: 0.65, writeRatio: 0.35, targetThroughputOpsSec: 50 };
    const consistency = { replicationEngine: 'LEADERLESS', readConsistency: 'QUORUM', writeAckPolicy: 'QUORUM', durability: 'SYNC_FSYNC', conflictStrategy: 'LAST_WRITE_WINS' };
    const faultSchedule = { faults: [
            { id: 'partition-node-2', type: 'PARTITION', targetNodes: ['node-2'], offsetMs: 300, durationMs: 600 },
            { id: 'delay-node-3', type: 'DELAY', targetNodes: ['node-3'], offsetMs: 1200, durationMs: 500, parameters: { delayMs: 10 } },
        ] };
    const spec = { id: 'local-quorum-baseline', name: 'Local Quorum and Blackbox baseline', contractVersion: '1.0.0', workload, consistency, masterSeed, faultSchedule };
    const specHash = computeExperimentSpecHash(spec);
    const trace = compileWorkload(spec, specHash);
    const timeline = compileFaultSchedule(faultSchedule, specHash);
    const replay = compileWorkload(spec, specHash);
    if (trace.entries.length !== workload.operationCount || trace.traceHash !== replay.traceHash)
        throw new Error('Workload count or deterministic replay check failed');
    const canonical = trace.entries.map(entry => ({
        operationId: 'op-' + entry.sequence, clientId: entry.logicalClientId, key: entry.key,
        operationType: entry.operation === 'GET' ? 'READ' : 'WRITE',
        offsetUs: entry.scheduledOffsetUs ?? entry.sequence * 20000,
        ...(entry.operation === 'GET' ? {} : { value: entry.value ?? 'val-' + entry.sequence }),
    }));
    let git = { commit: null, dirty: null };
    try {
        git = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0 };
    }
    catch { /* Unavailable provenance stays unknown. */ }
    const apps = members.map((id) => new QuorumNodeApp({ node: { id, clusterId: runId, dataDir: path.join(temporaryRoot, id), grpcPort: 0, grpcHost: '127.0.0.1' }, cluster: { membershipVersion: 1, members } }, { replicationMode: 'QUORUM', quorumConfig: { W: 2, R: 2 }, durabilityMode: 'SYNC_FSYNC' }));
    const started = [];
    const faultsExecuted = [];
    let faultTask;
    try {
        const ports = [];
        for (const app of apps) {
            ports.push(await app.start());
            started.push(app);
        }
        for (let i = 0; i < apps.length; i++)
            for (let j = 0; j < apps.length; j++)
                if (i !== j)
                    apps[i].engine.peerPool.registerPeer({ nodeId: members[j], address: `127.0.0.1:${ports[j]}` });
        console.log(`[REAL ENGINES] Three gRPC replicas listening on ${ports.join(', ')}. Executing ${trace.entries.length} operations.`);
        const startWallMs = Date.now();
        const startMonotonic = performance.now();
        const currentOffset = () => performance.now() - startMonotonic;
        const qrSamples = [];
        const events = faultSchedule.faults.flatMap((fault) => [{ fault, offset: fault.offsetMs, active: true }, { fault, offset: fault.offsetMs + fault.durationMs, active: false }]).sort((a, b) => a.offset - b.offset);
        faultTask = (async () => {
            for (const event of events) {
                await pause(event.offset - currentOffset());
                for (let i = 0; i < apps.length; i++) {
                    const isTarget = members[i] === event.fault.targetNodes[0];
                    if (event.active)
                        apps[i].faultRegistry.setRule({ faultId: event.fault.id, scope: 'NODE_TO_NODE', type: event.fault.type, ...(isTarget ? { targetNodeId: members[i] } : { peerNodeId: event.fault.targetNodes[0] }), ...(event.fault.type === 'DELAY' ? { delayMs: 10 } : {}) });
                    else
                        apps[i].faultRegistry.clearRule(event.fault.id);
                }
                faultsExecuted.push({ id: event.fault.id, action: event.active ? 'INJECT' : 'CLEAR', actualOffsetMs: currentOffset() });
            }
        })();
        const executeEntry = async (entry) => {
            const plan = canonical[entry.sequence];
            await pause(plan.offsetUs / 1000 - currentOffset());
            const nodeIndex = entry.sequence % apps.length;
            const app = apps[nodeIndex];
            const operationStart = process.hrtime.bigint();
            const wallTimeMs = Date.now();
            const actualOffsetMs = currentOffset();
            let success = true;
            let errorCode;
            try {
                if (entry.operation === 'GET')
                    await app.engine.distributedGet({ key: entry.key });
                else {
                    const result = await app.engine.put({ key: entry.key, value: Buffer.from(entry.value ?? `val-${entry.sequence}`), runId, clientId: String(entry.logicalClientId), operationId: `op-${entry.sequence}`, requestId: `req-${entry.sequence}` });
                    if ((result.replicationResult?.totalDurableAcks ?? 0) < 2)
                        throw new Error('Write did not receive two durable acknowledgements');
                }
            }
            catch (error) {
                success = false;
                errorCode = error instanceof Error ? error.message : String(error);
            }
            qrSamples.push({ ...plan, success, nodeId: members[nodeIndex], wallTimeMs, actualOffsetMs,
                realElapsedUs: Number(process.hrtime.bigint() - operationStart) / 1000, ...(errorCode ? { errorCode } : {}) });
        };
        // At most one outstanding operation per logical client. No synthetic latency offsets.
        await Promise.all(Array.from({ length: workload.concurrency }, async (_, client) => {
            for (const entry of trace.entries.filter((operation) => operation.logicalClientId === client))
                await executeEntry(entry);
        }));
        await faultTask;
        const executionDurationMs = currentOffset();
        const simRunner = new SimulationRunner({
            nodes: [{ nodeId: 'storage', nodeKind: 'DATABASE', cpuCores: 4, threadPoolSize: 8, threadPoolQueueCapacity: 150, connectionPoolSize: 8 }],
            operations: [{ operationId: 'read', operationName: 'get', nodeId: 'storage', baseLatencyUs: 2500 },
                { operationId: 'write', operationName: 'put', nodeId: 'storage', baseLatencyUs: 4900 }],
            workload: { id: runId, name: 'Canonical arrival replay', totalDurationSeconds: 3 }, seed: BigInt(masterSeed),
            arrivals: canonical.map(plan => ({ eventId: plan.operationId, operationName: plan.operationType === 'READ' ? 'get' : 'put',
                virtualTimeUs: plan.offsetUs, metadata: plan })),
        });
        const simulation = simRunner.run();
        if (!Array.isArray(simulation.samples) || simulation.samples.length === 0)
            throw new Error('BLACKBOX-X must expose actual per-request samples; rebuild its simulation-engine package');
        const bbSamples = simulation.samples.map(sample => ({ ...sample.traceMetadata,
            operationId: sample.requestId, operationType: sample.operationName === 'get' ? 'READ' : 'WRITE',
            success: sample.success, simulationTimeUs: sample.arrivalTimeUs, latencyUs: sample.latencyUs }));
        const sameEntry = (sample, plan) => ['operationId', 'clientId', 'key', 'operationType', 'offsetUs', 'value']
            .every(field => sample?.[field] === plan[field]);
        const realById = new Map(qrSamples.map(sample => [sample.operationId, sample]));
        const modeledById = new Map(bbSamples.map(sample => [sample.operationId, sample]));
        if (realById.size !== canonical.length || modeledById.size !== canonical.length ||
            qrSamples.length !== canonical.length || bbSamples.length !== canonical.length ||
            !canonical.every(plan => sameEntry(realById.get(plan.operationId), plan) &&
                sameEntry(modeledById.get(plan.operationId), plan) && modeledById.get(plan.operationId).simulationTimeUs === plan.offsetUs)) {
            throw new Error('Canonical trace identity, request count, keys, client, request type or arrival offsets diverged.');
        }
        const normalized = normalizeRunResult(runId, specHash, bbSamples, qrSamples);
        const comparison = generateComparisonReport(normalized, DEFAULT_COMPARISON_CRITERIA);
        const bb = normalized.summaries.find((summary) => summary.source === 'BLACKBOX_SIMULATION');
        const qr = normalized.summaries.find((summary) => summary.source === 'QUORUM_CLIENT');
        const gateEvidence = {
            G1: { status: 'PASS', evidence: 'Canonical workload compiled twice with a matching digest and operation count.' },
            G2: { status: faultsExecuted.length === events.length && faultsExecuted.every((event, i) =>
                event.id === events[i].fault.id && event.action === (events[i].active ? 'INJECT' : 'CLEAR') &&
                (i === 0 || event.actualOffsetMs >= faultsExecuted[i - 1].actualOffsetMs)) ? 'PASS' : 'FAIL',
                evidence: 'Recorded injected and cleared fault actions on empirical peers.' },
            G3: { status: 'BLOCKED', evidence: 'The empirical peers run in one OS process and the complete distributed safety gate was not executed.' },
            G4: { status: 'FAIL', evidence: 'The simulator replays request identities but lacks semantic state and peer-fault parity.',
                diagnostic: { ks: comparison.latencyKs, wasserstein: comparison.latencyWasserstein } },
            G5: { status: qr.p99Ms < 25 && qr.failureCount / qrSamples.length < .01 ? 'PASS' : 'FAIL',
                evidence: { p99Ms: qr.p99Ms, errorRate: qr.failureCount / qrSamples.length } },
            G6: { status: 'BLOCKED', evidence: 'No held-out evaluation was executed.' },
            G7: { status: 'BLOCKED', evidence: 'No remote calibration optimizer was invoked.' },
            G8: { status: 'BLOCKED', evidence: 'Local artifact manifests do not establish exact retained S3 versions.' },
        };
        fs.mkdirSync(artifactDir, { recursive: true });
        const writeArtifact = (name, value) => {
            const bytes = JSON.stringify(value, null, 2);
            const filename = path.join(artifactDir, name);
            fs.mkdirSync(path.dirname(filename), { recursive: true });
            fs.writeFileSync(filename, bytes);
            return { name, uri: pathToFileURL(filename).href, sha256: computeSha256(bytes), sizeBytes: Buffer.byteLength(bytes), mediaType: 'application/json', uploadedAt: new Date().toISOString() };
        };
        const lineage = { integrationRunId: runId, experimentSpecHash: specHash, workloadTrace: writeArtifact('workload/trace.json', trace), faultTimeline: writeArtifact('faults/timeline.json', { ...timeline, executed: faultsExecuted }), quorumResults: writeArtifact('telemetry/quorum.json', qrSamples), blackboxResults: writeArtifact('telemetry/blackbox.json', bbSamples), comparisonReport: writeArtifact('comparison.json', comparison) };
        writeArtifact('telemetry/normalized.json', normalized);
        writeArtifact('gates.json', { integrationRunId: runId, experimentSpecHash: specHash, traceHash: trace.traceHash, gates: gateEvidence });
        // Local files have no S3 version IDs or retention: certification must remain false.
        const certification = evaluateCertification(runId, specHash, comparison, lineage, true);
        writeArtifact('certification.json', certification);
        const limitations = ['Local three-node experiment in one OS process, with real gRPC peer traffic and WAL files.', 'Blackbox replays canonical request identities and intended arrivals. The baseline model does not execute Quorum key-state or peer-fault semantics, so comparison metrics are descriptive.', 'No parameter calibration or held-out validation is performed by this demo.', 'Artifacts are local checksum manifests; S3 Object Lock and WORM retention are not verified.', 'Network partition and delay are applied to real peer calls; hard process crashes and production durability are not tested.'];
        const summary = { runId, certified: certification.certified, verdict: certification.verdict, evidenceVersion: 2, engines: engineAvailability, git, execution: { startWallMs, durationMs: executionDurationMs, operations: qrSamples.length, successes: qr.successCount, failures: qr.failureCount, faultEvents: faultsExecuted }, bbMetrics: { p50: bb.p50Ms, p95: bb.p95Ms, p99: bb.p99Ms }, qrMetrics: { p50: qr.p50Ms, p95: qr.p95Ms, p99: qr.p99Ms }, p99Mape: comparison.p99LatencyMape.mapePercent, ksPValue: comparison.latencyKs.pValue, wasserstein: comparison.latencyWasserstein.distance, certificationRecordHash: certification.recordHash, traceHash: trace.traceHash, timelineHash: timeline.timelineHash, limitations };
        writeArtifact('summary.json', summary);
        const report = `<!DOCTYPE html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYSTEM-X measured experiment ${escapeHtml(runId)}</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:0 24px;color:#172033;background:#f8fafc}pre{white-space:pre-wrap;background:white;padding:20px;border:1px solid #cbd5e1;border-radius:8px}a{color:#155ac0}.verdict{color:#a33b10}</style><h1>SYSTEM-X measured local experiment</h1><p>${escapeHtml(runId)}</p><h2 class="verdict">${certification.certified ? 'CERTIFIED' : 'NOT CERTIFIED'}</h2><p>${qrSamples.length} measured operations: ${qr.successCount} succeeded; ${qr.failureCount} failed.</p><p>Empirical P99: ${qr.p99Ms.toFixed(3)} ms. Independent simulation P99: ${bb.p99Ms.toFixed(3)} ms.</p><p>KS p-value: ${comparison.latencyKs.pValue.toFixed(6)}. Wasserstein distance: ${comparison.latencyWasserstein.distance.toFixed(3)} ms.</p><h2>Scope and limitations</h2><ul>${limitations.map((limitation) => `<li>${escapeHtml(limitation)}</li>`).join('')}</ul><p><a href="summary.json">Summary JSON</a> · <a href="certification.json">Certification decision</a> · <a href="telemetry/normalized.json">Measured samples</a> · <a href="comparison.json">Comparison</a></p><h2>Executed network faults</h2><pre>${escapeHtml(JSON.stringify(faultsExecuted, null, 2))}</pre></html>`;
        fs.writeFileSync(path.join(artifactDir, 'report.html'), report);
        console.log(JSON.stringify(summary, null, 2));
        console.log(`Artifacts: ${artifactDir}`);
        // Execution success is distinct from certification. CI may require certification explicitly.
        if (process.argv.includes('--require-certification') && !certification.certified)
            process.exitCode = 1;
        return summary;
    }
    finally {
        await faultTask?.catch(() => undefined);
        for (const app of started)
            app.faultRegistry.clearAll();
        await Promise.allSettled(started.map((app) => app.stop()));
        const resolvedTemporary = path.resolve(temporaryRoot);
        if (path.dirname(resolvedTemporary) !== root || !path.basename(resolvedTemporary).startsWith('tmp-cluster-'))
            throw new Error('Refusing to remove unexpected temporary cluster path');
        fs.rmSync(resolvedTemporary, { recursive: true, force: true });
    }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
    runRealDemo().catch((error) => { console.error('Experiment failed:', error); process.exitCode = 1; });
