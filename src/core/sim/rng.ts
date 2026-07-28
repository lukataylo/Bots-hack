// Seeded PRNG — mulberry32. Deterministic: same seed always produces the same sequence, so the
// same seed always produces the same fight. Used by both the aggregate Monte Carlo (simulate())
// and the single-fight marquee replay (recordMarquee()) so a `seed` fully determines outcome.

export type Rng = () => number;

/** mulberry32(seed) returns a generator function producing floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Approximately-normal sample via sum of 3 uniforms (cheap, deterministic, good enough here). */
export function jitteredMean(rng: Rng, mean: number, std: number): number {
  const u = (rng() + rng() + rng()) / 3; // triangular-ish, centered at 0.5
  return Math.max(0, mean + (u - 0.5) * 2 * std);
}

/** Derive a fresh integer seed from a parent rng — used to fan out per-run seeds deterministically. */
export function nextSeed(rng: Rng): number {
  return Math.floor(rng() * 0xffffffff);
}
