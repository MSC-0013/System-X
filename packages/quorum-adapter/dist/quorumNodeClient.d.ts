import { QuorumNodeTlsConfig } from './types.js';
export interface QuorumHealthCheckResult {
    readonly servingStatus: string;
    readonly healthy: boolean;
    readonly latencyMs: number;
}
export declare class QuorumNodeClient {
    private readonly tlsConfig?;
    private readonly protoRoot;
    private packageDefsLoaded;
    private healthProto;
    private nodeProto;
    private readonly clients;
    constructor(options?: {
        tlsConfig?: QuorumNodeTlsConfig;
        protoRoot?: string;
    });
    private loadDefinitions;
    private createCredentials;
    private getHealthClient;
    private getNodeServiceClient;
    /**
     * Probes standard gRPC Health Check on the given node endpoint.
     */
    checkHealth(endpoint: string, service?: string, timeoutMs?: number): Promise<QuorumHealthCheckResult>;
    /**
     * ⚠️ DIAGNOSTIC ONLY: Diagnostic smoke Put call.
     * Do NOT use for experiment workloads (owned by I2 and dispatched via /execute).
     */
    diagnosticPut(endpoint: string, params: {
        key: string;
        value: string;
        runId?: string;
        clientId?: string;
        operationId?: string;
        requestId?: string;
    }, timeoutMs?: number): Promise<any>;
    /**
     * ⚠️ DIAGNOSTIC ONLY: Diagnostic smoke Get call.
     */
    diagnosticGet(endpoint: string, params: {
        key: string;
        runId?: string;
        readConsistency?: string;
    }, timeoutMs?: number): Promise<any>;
    /**
     * ⚠️ DIAGNOSTIC ONLY: Diagnostic storage snapshot trigger.
     */
    diagnosticCreateSnapshot(endpoint: string, destinationPath?: string, timeoutMs?: number): Promise<any>;
    close(): void;
}
//# sourceMappingURL=quorumNodeClient.d.ts.map