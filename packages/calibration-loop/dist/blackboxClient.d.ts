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
import type { BlackboxCalibrationRequest, BlackboxCalibrationResponse, CalibrationLoopConfig } from './types.js';
/** Error class for BLACKBOX-X API errors. */
export declare class BlackboxApiError extends Error {
    readonly statusCode?: number | undefined;
    readonly retryable: boolean;
    constructor(message: string, statusCode?: number | undefined, retryable?: boolean);
}
/**
 * Send a calibration request to BLACKBOX-X.
 */
export declare function requestBlackboxCalibration(request: BlackboxCalibrationRequest, config: CalibrationLoopConfig): Promise<BlackboxCalibrationResponse>;
//# sourceMappingURL=blackboxClient.d.ts.map