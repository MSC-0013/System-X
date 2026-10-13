/**
 * Mulberry32 — fast, seedable 32-bit PRNG.
 * Returns a function that yields floats in [0, 1).
 */
export function createMulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/**
 * Uniform integer generator over [min, max) using a Mulberry32 PRNG.
 */
export function createUniformGenerator(prng, min, max) {
    const range = max - min;
    return () => Math.floor(prng() * range) + min;
}
//# sourceMappingURL=uniformGenerator.js.map