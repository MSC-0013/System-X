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
export interface ZipfianGenerator {
    next: () => number;
}
/**
 * Creates a Zipfian generator over [0, n).
 *
 * @param prng   Seeded Mulberry32 PRNG.
 * @param n      Size of the key space (exclusive upper bound).
 * @param theta  Skew parameter (default 0.99).
 */
export declare function createZipfianGenerator(prng: () => number, n: number, theta?: number): ZipfianGenerator;
/** Re-export createMulberry32 for convenience. */
export { createMulberry32 };
//# sourceMappingURL=zipfianGenerator.d.ts.map