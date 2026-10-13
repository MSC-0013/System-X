/**
 * Zipfian key generator — Gray et al. rejection-inversion method.
 *
 * theta = 0.99 is the standard skew used in the YCSB benchmark and matches
 * @quorum-lab/benchmarks for cross-system comparability.
 *
 * Reference: Gray et al., "Quickly Generating Billion-Record Synthetic
 * Databases", SIGMOD 1994.
 */
import { createMulberry32 } from './uniformGenerator.js';
const ZIPFIAN_THETA = 0.99;
/**
 * Precompute the Zipfian normalization constant (zeta) up to n elements
 * with the given theta.
 */
function zetaN(n, theta) {
    let sum = 0;
    for (let i = 1; i <= n; i++) {
        sum += Math.pow(1.0 / i, theta);
    }
    return sum;
}
/**
 * Creates a Zipfian generator over [0, n).
 *
 * @param prng   Seeded Mulberry32 PRNG.
 * @param n      Size of the key space (exclusive upper bound).
 * @param theta  Skew parameter (default 0.99).
 */
export function createZipfianGenerator(prng, n, theta = ZIPFIAN_THETA) {
    if (n < 1)
        throw new RangeError('Zipfian key space must be >= 1');
    const zeta2 = zetaN(2, theta);
    const zetaN_ = zetaN(n, theta);
    const alpha = 1.0 / (1.0 - theta);
    const eta = (1.0 - Math.pow(2.0 / n, 1.0 - theta)) / (1.0 - zeta2 / zetaN_);
    return {
        next() {
            const u = prng();
            const uz = u * zetaN_;
            if (uz < 1.0)
                return 0;
            if (uz < 1.0 + Math.pow(0.5, theta))
                return 1;
            return Math.floor(n * Math.pow(eta * (u - 1.0) + 1.0, alpha));
        },
    };
}
/** Re-export createMulberry32 for convenience. */
export { createMulberry32 };
//# sourceMappingURL=zipfianGenerator.js.map