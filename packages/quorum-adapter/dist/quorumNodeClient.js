import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { QuorumNodeError } from './types.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class QuorumNodeClient {
    tlsConfig;
    protoRoot;
    packageDefsLoaded = false;
    healthProto;
    nodeProto;
    clients = new Map();
    constructor(options = {}) {
        this.tlsConfig = options.tlsConfig;
        // Default to bundled protocol directory relative to package root
        this.protoRoot = options.protoRoot ?? resolve(__dirname, '../../../protocol/quorum/v1');
    }
    loadDefinitions() {
        if (this.packageDefsLoaded)
            return;
        const loaderOptions = {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
            includeDirs: [this.protoRoot]
        };
        const healthPackageDef = protoLoader.loadSync(resolve(this.protoRoot, 'health.proto'), loaderOptions);
        this.healthProto = grpc.loadPackageDefinition(healthPackageDef);
        const nodePackageDef = protoLoader.loadSync(resolve(this.protoRoot, 'node.proto'), loaderOptions);
        this.nodeProto = grpc.loadPackageDefinition(nodePackageDef);
        this.packageDefsLoaded = true;
    }
    createCredentials() {
        if (this.tlsConfig?.enabled) {
            const rootCert = this.tlsConfig.caCert ? Buffer.from(this.tlsConfig.caCert) : null;
            const clientKey = this.tlsConfig.clientKey ? Buffer.from(this.tlsConfig.clientKey) : null;
            const clientCert = this.tlsConfig.clientCert ? Buffer.from(this.tlsConfig.clientCert) : null;
            return grpc.credentials.createSsl(rootCert, clientKey, clientCert);
        }
        return grpc.credentials.createInsecure();
    }
    getHealthClient(endpoint) {
        this.loadDefinitions();
        const cacheKey = `health:${endpoint}`;
        let client = this.clients.get(cacheKey);
        if (!client) {
            const HealthService = this.healthProto.grpc.health.v1.Health;
            client = new HealthService(endpoint, this.createCredentials());
            this.clients.set(cacheKey, client);
        }
        return client;
    }
    getNodeServiceClient(endpoint) {
        this.loadDefinitions();
        const cacheKey = `node:${endpoint}`;
        let client = this.clients.get(cacheKey);
        if (!client) {
            const NodeService = this.nodeProto.quorum.node.v1.NodeService;
            client = new NodeService(endpoint, this.createCredentials());
            this.clients.set(cacheKey, client);
        }
        return client;
    }
    /**
     * Probes standard gRPC Health Check on the given node endpoint.
     */
    async checkHealth(endpoint, service = '', timeoutMs = 5000) {
        const client = this.getHealthClient(endpoint);
        const start = Date.now();
        return new Promise((resolve, reject) => {
            const deadline = new Date(Date.now() + timeoutMs);
            client.Check({ service }, { deadline }, (err, res) => {
                const latencyMs = Date.now() - start;
                if (err) {
                    return reject(new QuorumNodeError(`gRPC Health check failed on ${endpoint}: ${err.message}`, endpoint, err.code));
                }
                const serving = res?.status === 'SERVING';
                resolve({
                    servingStatus: res?.status ?? 'UNKNOWN',
                    healthy: serving,
                    latencyMs
                });
            });
        });
    }
    /**
     * ⚠️ DIAGNOSTIC ONLY: Diagnostic smoke Put call.
     * Do NOT use for experiment workloads (owned by I2 and dispatched via /execute).
     */
    async diagnosticPut(endpoint, params, timeoutMs = 5000) {
        const client = this.getNodeServiceClient(endpoint);
        return new Promise((resolve, reject) => {
            const deadline = new Date(Date.now() + timeoutMs);
            client.Put({
                key: params.key,
                value: Buffer.from(params.value, 'utf8'),
                run_id: params.runId ?? 'smoke-run',
                client_id: params.clientId ?? 'smoke-client',
                operation_id: params.operationId ?? `op-${Date.now()}`,
                request_id: params.requestId ?? `req-${Date.now()}`
            }, { deadline }, (err, res) => {
                if (err) {
                    return reject(new QuorumNodeError(`Diagnostic Put failed: ${err.message}`, endpoint, err.code));
                }
                resolve(res);
            });
        });
    }
    /**
     * ⚠️ DIAGNOSTIC ONLY: Diagnostic smoke Get call.
     */
    async diagnosticGet(endpoint, params, timeoutMs = 5000) {
        const client = this.getNodeServiceClient(endpoint);
        return new Promise((resolve, reject) => {
            const deadline = new Date(Date.now() + timeoutMs);
            client.Get({
                key: params.key,
                run_id: params.runId ?? 'smoke-run',
                read_consistency: params.readConsistency ?? 'QUORUM'
            }, { deadline }, (err, res) => {
                if (err) {
                    return reject(new QuorumNodeError(`Diagnostic Get failed: ${err.message}`, endpoint, err.code));
                }
                resolve(res);
            });
        });
    }
    /**
     * ⚠️ DIAGNOSTIC ONLY: Diagnostic storage snapshot trigger.
     */
    async diagnosticCreateSnapshot(endpoint, destinationPath, timeoutMs = 10000) {
        const client = this.getNodeServiceClient(endpoint);
        return new Promise((resolve, reject) => {
            const deadline = new Date(Date.now() + timeoutMs);
            client.CreateSnapshot({ destination_path: destinationPath ?? '' }, { deadline }, (err, res) => {
                if (err) {
                    return reject(new QuorumNodeError(`Snapshot failed: ${err.message}`, endpoint, err.code));
                }
                resolve(res);
            });
        });
    }
    close() {
        for (const client of this.clients.values()) {
            client.close();
        }
        this.clients.clear();
    }
}
//# sourceMappingURL=quorumNodeClient.js.map