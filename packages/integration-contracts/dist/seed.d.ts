/**
 * Derives a deterministic 32-bit unsigned integer seed for a named sub-stream.
 *
 * Formula:
 * streamSeed = uint32(SHA-256(experimentSpecHash + ":" + masterSeed + ":" + streamName))
 *
 * Invariant: Identical experiment spec + masterSeed + streamName always yields the identical seed.
 */
export declare function deriveStreamSeed(experimentSpecHash: string, masterSeed: number, streamName: string): number;
/**
 * Well-characterized Mulberry32 32-bit deterministic PRNG.
 * Returns a function producing pseudo-random numbers in [0, 1) with uniform distribution.
 */
export declare function createMulberry32(seed: number): () => number;
//# sourceMappingURL=seed.d.ts.map