/**
 * I6 — Calibration Loop: types.
 *
 * Defines the parameter space, calibration request/response shapes,
 * and coordinate-descent state for tuning BLACKBOX-X simulation parameters
 * to match QUORUM LAB real measurements.
 *
 * Sovereignty rule: BLACKBOX-X is called via HTTP REST only.
 * No @blackbox-x/* package imports anywhere in SYSTEM-X.
 */
export const DEFAULT_CALIBRATION_CONFIG = {
    blackboxBaseUrl: 'http://localhost:3001',
    requestTimeoutMs: 60_000,
    maxRetries: 3,
    calibrationFraction: 0.7,
};
//# sourceMappingURL=types.js.map