import { createHash } from 'node:crypto';
/**
 * Derives a deterministic 32-bit unsigned integer seed for a named sub-stream.
 *
 * Formula:
 * streamSeed = uint32(SHA-256(experimentSpecHash + ":" + masterSeed + ":" + streamName))
 *
 * Invariant: Identical experiment spec + masterSeed + streamName always yields the identical seed.
 */
export function deriveStreamSeed(experimentSpecHash, masterSeed, streamName) {
    const payload = `${experimentSpecHash}:${masterSeed}:${streamName}`;
    const hashBuffer = createHash('sha256').update(payload, 'utf8').digest();
    return hashBuffer.readUInt32BE(0);
}
/**
 * Well-characterized Mulberry32 32-bit deterministic PRNG.
 * Returns a function producing pseudo-random numbers in [0, 1) with uniform distribution.
 */
export function createMulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
//# sourceMappingURL=seed.js.map