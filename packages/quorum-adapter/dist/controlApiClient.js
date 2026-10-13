import { QuorumControlApiError } from './types.js';
export const DEFAULT_RETRY_POLICY = {
    maxRetries: 3,
    initialBackoffMs: 200,
    maxBackoffMs: 3000,
    backoffMultiplier: 2.0
};
export class QuorumControlApiClient {
    baseUrl;
    timeoutMs;
    retryPolicy;
    customHeaders;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.timeoutMs = config.timeoutMs ?? 10000;
        this.retryPolicy = config.retryPolicy ?? DEFAULT_RETRY_POLICY;
        this.customHeaders = config.customHeaders ?? {};
    }
    async request(method, path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const isIdempotent = options.isIdempotent ?? (method === 'GET');
        let attempt = 0;
        let lastError;
        while (attempt <= (isIdempotent ? this.retryPolicy.maxRetries : 0)) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), this.timeoutMs);
                const headers = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...this.customHeaders,
                    ...(options.headers ?? {})
                };
                const fetchOptions = {
                    method,
                    headers,
                    signal: controller.signal,
                    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
                };
                const res = await fetch(url, fetchOptions);
                clearTimeout(timer);
                if (res.ok) {
                    return (await res.json());
                }
                let errorBody;
                try {
                    errorBody = await res.json();
                }
                catch {
                    errorBody = await res.text();
                }
                // Non-retryable client errors
                if ([400, 401, 403, 404, 409, 422].includes(res.status)) {
                    throw new QuorumControlApiError(`Quorum Control API ${method} ${path} failed with HTTP ${res.status}: ${JSON.stringify(errorBody)}`, res.status, path, errorBody);
                }
                // 429, 500, 502, 503, 504 are candidate for retries if idempotent
                lastError = new QuorumControlApiError(`Quorum Control API ${method} ${path} returned transient HTTP ${res.status}`, res.status, path, errorBody);
            }
            catch (err) {
                if (err instanceof QuorumControlApiError && [400, 401, 403, 404, 409, 422].includes(err.statusCode)) {
                    throw err;
                }
                lastError = err;
            }
            attempt++;
            if (attempt <= (isIdempotent ? this.retryPolicy.maxRetries : 0)) {
                const delay = Math.min(this.retryPolicy.initialBackoffMs * Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1), this.retryPolicy.maxBackoffMs);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        throw lastError ?? new Error(`Request to ${path} failed after ${attempt} attempts`);
    }
    // --- Projects ---
    async createProject(params) {
        return this.request('POST', '/v1/projects', { body: params });
    }
    async getProject(id) {
        return this.request('GET', `/v1/projects/${id}`, { isIdempotent: true });
    }
    async listProjects() {
        return this.request('GET', '/v1/projects', { isIdempotent: true });
    }
    // --- Clusters ---
    async createCluster(params) {
        return this.request('POST', '/v1/clusters', { body: params });
    }
    async getCluster(id) {
        return this.request('GET', `/v1/clusters/${id}`, { isIdempotent: true });
    }
    async listClusters(projectId) {
        const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
        return this.request('GET', `/v1/clusters${q}`, { isIdempotent: true });
    }
    async registerNode(clusterId, params) {
        return this.request('POST', `/v1/clusters/${clusterId}/nodes`, { body: params });
    }
    async getClusterNodes(clusterId) {
        return this.request('GET', `/v1/clusters/${clusterId}/nodes`, {
            isIdempotent: true
        });
    }
    async setClusterPolicy(clusterId, policy) {
        return this.request('POST', `/v1/clusters/${clusterId}/policies`, {
            body: { policy }
        });
    }
    // --- Experiments ---
    async createExperiment(params) {
        return this.request('POST', '/v1/experiments', { body: params });
    }
    async getExperiment(id) {
        return this.request('GET', `/v1/experiments/${id}`, { isIdempotent: true });
    }
    async listExperiments(clusterId) {
        const q = clusterId ? `?clusterId=${encodeURIComponent(clusterId)}` : '';
        return this.request('GET', `/v1/experiments${q}`, { isIdempotent: true });
    }
    // --- Runs ---
    async createRun(experimentId, params = {}) {
        return this.request('POST', `/v1/experiments/${experimentId}/runs`, { body: params });
    }
    async getRun(runId) {
        return this.request('GET', `/v1/runs/${runId}`, { isIdempotent: true });
    }
    async listRuns(experimentId) {
        const path = experimentId ? `/v1/experiments/${experimentId}/runs` : `/v1/runs`;
        return this.request('GET', path, { isIdempotent: true });
    }
    /**
     * Idempotent public run execution dispatch.
     * Sends Idempotency-Key: executionId.
     */
    async executeRun(runId, request) {
        return this.request('POST', `/v1/runs/${runId}/execute`, {
            body: request,
            headers: {
                'Idempotency-Key': request.executionId
            },
            isIdempotent: true
        });
    }
    /**
     * Safe cancellation of an active or queued run.
     */
    async cancelRun(runId, reason) {
        return this.request('POST', `/v1/runs/${runId}/cancel`, {
            body: { reason },
            isIdempotent: true
        });
    }
    /**
     * Polls a run until terminal state (COMPLETED, FAILED, ABORTED, CANCELLED).
     */
    async pollRunUntilComplete(runId, options = {}) {
        const interval = options.intervalMs ?? 500;
        const timeout = options.timeoutMs ?? 60000;
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const run = await this.getRun(runId);
            options.onProgress?.(run);
            if (['COMPLETED', 'FAILED', 'ABORTED', 'CANCELLED'].includes(run.status)) {
                return run;
            }
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
        throw new Error(`Polling run ${runId} timed out after ${timeout}ms`);
    }
}
//# sourceMappingURL=controlApiClient.js.map