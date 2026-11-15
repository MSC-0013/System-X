/**
 * Zipfian key generator using an exact discrete inverse CDF.
 *
 * theta = 0.99 is the standard skew used in the YCSB benchmark and matches
 * @quorum-lab/benchmarks for cross-system comparability.
 *
 * Supports theta=1 as well as skew above 1 without a singular exponent.
 */
import { createMulberry32 } from './uniformGenerator.js';
const ZIPFIAN_THETA = 0.99;
/**
 * Creates a Zipfian generator over [0, n).
 *
 * @param prng   Seeded Mulberry32 PRNG.
 * @param n      Size of the key space (exclusive upper bound).
 * @param theta  Skew parameter (default 0.99).
 */
export function createZipfianGenerator(prng, n, theta = ZIPFIAN_THETA) {
    if (!Number.isSafeInteger(n) || n < 1)
        throw new RangeError('Zipfian key space must be an integer >= 1');
    if (!Number.isFinite(theta) || theta < 0.1 || theta > 2)
        throw new RangeError('Zipfian theta must be between 0.1 and 2');
    const cdf = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
        total += Math.pow(i + 1, -theta);
        cdf[i] = total;
    }
    return {
        next() {
            const target = prng() * total;
            let lo = 0;
            let hi = n - 1;
            while (lo < hi) {
                const mid = Math.floor((lo + hi) / 2);
                if (target < cdf[mid])
                    hi = mid;
                else
                    lo = mid + 1;
            }
            return lo;
        },
    };
}
/** Re-export createMulberry32 for convenience. */
export { createMulberry32 };
