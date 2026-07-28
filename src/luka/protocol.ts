// Small shared vocabulary for the engine zone. Kept separate from lib/types.ts
// because the sim and the Elo engine both need it and neither should import the other.

export type Winner = 'A' | 'B' | 'tie';
export type Side = 'A' | 'B';
export type FightMethod = 'ko' | 'jd';

/** Deterministic PRNG (mulberry32). Same seed, same fight, forever. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
