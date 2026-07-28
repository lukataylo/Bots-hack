// Records the single marquee fight (SimResult.marqueeSeed — the run nearest the modal outcome,
// chosen in engine.ts's simulate()) as 10Hz keyframes to data/marquee-<matchupId>.json.
//
// This JSON file is the ONLY interface the 3D renderer (src/three) reads. Keep the shape exactly:
//   { fps: 10, frames: [{ t, a: {p,q}, b: {p,q}, events }], winner: 'A'|'B', durationSec }

import fs from 'fs';
import path from 'path';
import type { FighterProfile } from '../../lib/types';
import { computeMatchup } from '../matchup';
import { runFight } from './engine';
import type { MarqueeFrame } from './engine';

export interface MarqueeFile {
  fps: 10;
  frames: MarqueeFrame[];
  winner: 'A' | 'B';
  durationSec: number;
}

const DATA_DIR = process.env.RINGSIDE_DATA_DIR ?? path.join(process.cwd(), 'data');

export function marqueePath(matchupId: string): string {
  return path.join(DATA_DIR, `marquee-${matchupId}.json`);
}

/**
 * Re-runs the single fight at `seed` (should be SimResult.marqueeSeed, produced by
 * engine.simulate()) and writes the keyframe JSON the 3D renderer consumes.
 *
 * Odds aren't threaded through the public signature (brief contract: a, b, seed, matchupId
 * only) — they're recomputed via computeMatchup(a, b), which is a pure function of the current
 * bot_records / elo_ledger tables. As long as no new fight results are ingested between the
 * simulate() call that picked `seed` and this recordMarquee() call, computeMatchup returns byte
 * -identical odds, so the archetype strike-chance bias reproduces exactly and the same seed
 * yields the same fight (mulberry32 PRNG is otherwise the only source of randomness).
 */
export async function recordMarquee(
  a: FighterProfile,
  b: FighterProfile,
  seed: number,
  matchupId: string,
): Promise<void> {
  const odds = computeMatchup(a, b);
  const result = await runFight(a, b, odds, seed, { recordFrames: true });
  if (!result.frames) throw new Error('recordMarquee: runFight did not return frames');

  const file: MarqueeFile = {
    fps: 10,
    frames: result.frames,
    winner: result.winner,
    durationSec: result.durationSec,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(marqueePath(matchupId), JSON.stringify(file));
}
