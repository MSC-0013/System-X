// ---------------------------------------------------------------------------
// Two-sample KS test
// ---------------------------------------------------------------------------
/**
 * Two-sample Kolmogorov-Smirnov test.
 *
 * @param a     First sample (latencies in ms). Need not be sorted.
 * @param b     Second sample (latencies in ms). Need not be sorted.
 * @param alpha Significance level (default 0.05).
 * @returns     KS statistic D, approximate p-value, and rejection decision.
 */
export function twoSampleKsTest(a, b, alpha = 0.05) {
    if (a.length === 0 || b.length === 0) {
        throw new RangeError('KS comparison requires two non-empty samples');
    }
    if (![...a, ...b].every(Number.isFinite))
        throw new RangeError('KS samples must be finite');
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);
    const n1 = sortedA.length;
    const n2 = sortedB.length;
    // Merge all values and compute ECDFs.
    const allValues = [...new Set([...sortedA, ...sortedB])].sort((x, y) => x - y);
    let maxDiff = 0;
    let ia = 0;
    let ib = 0;
    for (const v of allValues) {
        while (ia < n1 && sortedA[ia] <= v)
            ia++;
        while (ib < n2 && sortedB[ib] <= v)
            ib++;
        const diff = Math.abs(ia / n1 - ib / n2);
        if (diff > maxDiff)
            maxDiff = diff;
    }
    // Kolmogorov distribution approximation for p-value.
    const t = maxDiff * Math.sqrt((n1 * n2) / (n1 + n2));
    const pValue = kolmogorovPValue(t);
    return {
        dStatistic: maxDiff,
        pValue,
        rejected: pValue < alpha,
        alpha,
    };
}
/**
 * Approximate p-value from the Kolmogorov distribution using a series expansion.
 * Valid for t > 0.
 */
function kolmogorovPValue(t) {
    if (t <= 0)
        return 1;
    if (t > 4)
        return 0;
    // Two-sided KS p-value: P(K > t) = 2 * sum_{k=1}^{inf} (-1)^{k+1} * exp(-2*k^2*t^2)
    let sum = 0;
    for (let k = 1; k <= 100; k++) {
        const term = Math.pow(-1, k + 1) * Math.exp(-2 * k * k * t * t);
        sum += term;
        if (Math.abs(term) < 1e-10)
            break;
    }
    return Math.max(0, Math.min(1, 2 * sum));
}
// ---------------------------------------------------------------------------
// Wasserstein-1 (Earth Mover's Distance)
// ---------------------------------------------------------------------------
/**
 * Wasserstein-1 distance between two 1D distributions.
 * For sorted arrays: W1 = (1/n) * sum |sorted_a[i] - sorted_b[i]| (equal-size)
 * or integrated absolute difference of ECDFs.
 */
export function wassersteinDistance(a, b) {
    if (a.length === 0 || b.length === 0) {
        throw new RangeError('Wasserstein comparison requires two non-empty samples');
    }
    if (![...a, ...b].every(Number.isFinite))
        throw new RangeError('Wasserstein samples must be finite');
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);
    // Integrate the absolute ECDF difference exactly, including unequal sample
    // sizes, repeated values, and singleton distributions.
    const values = [...new Set([...sortedA, ...sortedB])].sort((x, y) => x - y);
    let ia = 0;
    let ib = 0;
    let totalDistance = 0;
    for (let i = 0; i < values.length - 1; i++) {
        const value = values[i];
        while (ia < sortedA.length && sortedA[ia] <= value)
            ia++;
        while (ib < sortedB.length && sortedB[ib] <= value)
            ib++;
        totalDistance += Math.abs(ia / sortedA.length - ib / sortedB.length) * (values[i + 1] - value);
    }
    return { distance: totalDistance };
}
// ---------------------------------------------------------------------------
// MAPE
// ---------------------------------------------------------------------------
/**
 * Mean Absolute Percentage Error between actual and predicted values.
 * Avoids division by zero by skipping zeros in actual.
 */
export function computeMape(actual, predicted) {
    if (actual === 0) {
        return { mapePercent: predicted === 0 ? 0 : 100 };
    }
    const mapePercent = (Math.abs(actual - predicted) / Math.abs(actual)) * 100;
    return { mapePercent };
}
