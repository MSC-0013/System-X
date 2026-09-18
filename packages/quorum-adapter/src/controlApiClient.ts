import {
  ControlApiClientConfig,
  QuorumControlApiError,
  QuorumProjectDto,
  QuorumClusterDto,
  QuorumNodeDto,
  QuorumExperimentDto,
  QuorumRunDto,
  QuorumRunExecutionRequest,
  RetryPolicyConfig
} from './types.js';

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxRetries: 3,
  initialBackoffMs: 200,
  maxBackoffMs: 3000,
  backoffMultiplier: 2.0
};

export class QuorumControlApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryPolicy: RetryPolicyConfig;
  private readonly customHeaders: Record<string, string>;

  constructor(config: ControlApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.retryPolicy = config.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.customHeaders = config.customHeaders ?? {};
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      isIdempotent?: boolean;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const isIdempotent = options.isIdempotent ?? (method === 'GET');
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= (isIdempotent ? this.retryPolicy.maxRetries : 0)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...this.customHeaders,
          ...(options.headers ?? {})
        };

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
        };

        const res = await fetch(url, fetchOptions);

        clearTimeout(timer);

        if (res.ok) {
          return (await res.json()) as T;
        }

        let errorBody: unknown;
        try {
          errorBody = await res.json();
        } catch {
          errorBody = await res.text();
        }

        // Non-retryable client errors
        if ([400, 401, 403, 404, 409, 422].includes(res.status)) {
          throw new QuorumControlApiError(
            `Quorum Control API ${method} ${path} failed with HTTP ${res.status}: ${JSON.stringify(errorBody)}`,
            res.status,
            path,
            errorBody
          );
        }

        // 429, 500, 502, 503, 504 are candidate for retries if idempotent
        lastError = new QuorumControlApiError(
          `Quorum Control API ${method} ${path} returned transient HTTP ${res.status}`,
          res.status,
          path,
          errorBody
        );
      } catch (err: any) {
        if (err instanceof QuorumControlApiError && [400, 401, 403, 404, 409, 422].includes(err.statusCode)) {
          throw err;
        }
        lastError = err;
      }

      attempt++;
      if (attempt <= (isIdempotent ? this.retryPolicy.maxRetries : 0)) {
        const delay = Math.min(
          this.retryPolicy.initialBackoffMs * Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1),
          this.retryPolicy.maxBackoffMs
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error(`Request to ${path} failed after ${attempt} attempts`);
  }

  // --- Projects ---
  public async createProject(params: { name: string; description?: string }): Promise<QuorumProjectDto> {
    return this.request<QuorumProjectDto>('POST', '/v1/projects', { body: params });
  }

  public async getProject(id: string): Promise<QuorumProjectDto> {
    return this.request<QuorumProjectDto>('GET', `/v1/projects/${id}`, { isIdempotent: true });
  }

  public async listProjects(): Promise<readonly QuorumProjectDto[]> {
    return this.request<readonly QuorumProjectDto[]>('GET', '/v1/projects', { isIdempotent: true });
  }

  // --- Clusters ---
  public async createCluster(params: {
    projectId: string;
    name: string;
    members: string[];
    policy: Record<string, unknown>;
  }): Promise<QuorumClusterDto> {
    return this.request<QuorumClusterDto>('POST', '/v1/clusters', { body: params });
  }

  public async getCluster(id: string): Promise<QuorumClusterDto> {
    return this.request<QuorumClusterDto>('GET', `/v1/clusters/${id}`, { isIdempotent: true });
  }

  public async listClusters(projectId?: string): Promise<readonly QuorumClusterDto[]> {
    const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return this.request<readonly QuorumClusterDto[]>('GET', `/v1/clusters${q}`, { isIdempotent: true });
  }

  public async registerNode(
    clusterId: string,
    params: { nodeId: string; grpcAddress: string }
  ): Promise<QuorumNodeDto> {
    return this.request<QuorumNodeDto>('POST', `/v1/clusters/${clusterId}/nodes`, { body: params });
  }

  public async getClusterNodes(clusterId: string): Promise<readonly QuorumNodeDto[]> {
    return this.request<readonly QuorumNodeDto[]>('GET', `/v1/clusters/${clusterId}/nodes`, {
      isIdempotent: true
    });
  }

  public async setClusterPolicy(
    clusterId: string,
    policy: Record<string, unknown>
  ): Promise<QuorumClusterDto> {
    return this.request<QuorumClusterDto>('POST', `/v1/clusters/${clusterId}/policies`, {
      body: { policy }
    });
  }

  // --- Experiments ---
  public async createExperiment(params: {
    projectId: string;
    clusterId: string;
    name: string;
    description?: string;
    workload: Record<string, unknown>;
    faultTimeline?: readonly Record<string, unknown>[];
  }): Promise<QuorumExperimentDto> {
    return this.request<QuorumExperimentDto>('POST', '/v1/experiments', { body: params });
  }

  public async getExperiment(id: string): Promise<QuorumExperimentDto> {
    return this.request<QuorumExperimentDto>('GET', `/v1/experiments/${id}`, { isIdempotent: true });
  }

  public async listExperiments(clusterId?: string): Promise<readonly QuorumExperimentDto[]> {
    const q = clusterId ? `?clusterId=${encodeURIComponent(clusterId)}` : '';
    return this.request<readonly QuorumExperimentDto[]>('GET', `/v1/experiments${q}`, { isIdempotent: true });
  }

  // --- Runs ---
  public async createRun(
    experimentId: string,
    params: { rootSeed?: string; runId?: string } = {}
  ): Promise<QuorumRunDto> {
    return this.request<QuorumRunDto>('POST', `/v1/experiments/${experimentId}/runs`, { body: params });
  }

  public async getRun(runId: string): Promise<QuorumRunDto> {
    return this.request<QuorumRunDto>('GET', `/v1/runs/${runId}`, { isIdempotent: true });
  }

  public async listRuns(experimentId?: string): Promise<readonly QuorumRunDto[]> {
    const path = experimentId ? `/v1/experiments/${experimentId}/runs` : `/v1/runs`;
    return this.request<readonly QuorumRunDto[]>('GET', path, { isIdempotent: true });
  }

  /**
   * Idempotent public run execution dispatch.
   * Sends Idempotency-Key: executionId.
   */
  public async executeRun(
    runId: string,
    request: QuorumRunExecutionRequest
  ): Promise<QuorumRunDto> {
    return this.request<QuorumRunDto>('POST', `/v1/runs/${runId}/execute`, {
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
  public async cancelRun(runId: string, reason?: string): Promise<QuorumRunDto> {
    return this.request<QuorumRunDto>('POST', `/v1/runs/${runId}/cancel`, {
      body: { reason },
      isIdempotent: true
    });
  }

  /**
   * Polls a run until terminal state (COMPLETED, FAILED, ABORTED, CANCELLED).
   */
  public async pollRunUntilComplete(
    runId: string,
    options: {
      intervalMs?: number;
      timeoutMs?: number;
      onProgress?: (run: QuorumRunDto) => void;
    } = {}
  ): Promise<QuorumRunDto> {
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
