/**
 * Mulberry32 — fast, seedable 32-bit PRNG.
 * Returns a function that yields floats in [0, 1).
 */
export declare function createMulberry32(seed: number): () => number;
/**
 * Uniform integer generator over [min, max) using a Mulberry32 PRNG.
 */
export declare function createUniformGenerator(prng: () => number, min: number, max: number): () => number;
//# sourceMappingURL=uniformGenerator.d.ts.map