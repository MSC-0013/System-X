/**
 * I6 — Calibration Loop: BLACKBOX-X HTTP client.
 *
 * Calls POST /v1/calibration/runs on BLACKBOX-X.
 * This is the ONLY point of contact between SYSTEM-X and BLACKBOX-X.
 * No @blackbox-x/* package imports are used anywhere in SYSTEM-X.
 *
 * Retry policy: exponential backoff on 429/503.
 * Fail-fast on: 400, 422, 404.
 */
import type {
  BlackboxCalibrationRequest,
  BlackboxCalibrationResponse,
  CalibrationLoopConfig,
} from './types.js';

/** Error class for BLACKBOX-X API errors. */
export class BlackboxApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'BlackboxApiError';
  }
}

const FAIL_FAST_CODES = new Set([400, 404, 422]);
const RETRYABLE_CODES = new Set([429, 503]);

/**
 * Send a calibration request to BLACKBOX-X.
 */
export async function requestBlackboxCalibration(
  request: BlackboxCalibrationRequest,
  config: CalibrationLoopConfig,
): Promise<BlackboxCalibrationResponse> {
  const url = `${config.blackboxBaseUrl}/v1/calibration/runs`;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s.
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      await sleep(delayMs);
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Integration-Run-Id': request.integrationRunId,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = new BlackboxApiError(`Network error calling BLACKBOX-X: ${message}`, undefined, true);
      continue;
    }

    if (FAIL_FAST_CODES.has(response.status)) {
      const body = await response.text().catch(() => '');
      throw new BlackboxApiError(
        `BLACKBOX-X returned ${response.status}: ${body}`,
        response.status,
        false,
      );
    }

    if (response.status === 200 || response.status === 201 || response.status === 202) {
      const data = await response.json() as BlackboxCalibrationResponse;
      return data;
    }

    if (RETRYABLE_CODES.has(response.status)) {
      lastError = new BlackboxApiError(
        `BLACKBOX-X returned ${response.status} (retryable)`,
        response.status,
        true,
      );
      continue;
    }

    // Unexpected status.
    const body = await response.text().catch(() => '');
    throw new BlackboxApiError(
      `Unexpected BLACKBOX-X response ${response.status}: ${body}`,
      response.status,
      false,
    );
  }

  throw lastError ?? new BlackboxApiError('Max retries exceeded for BLACKBOX-X calibration');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
