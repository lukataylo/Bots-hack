// Archetype-level Elo rating — re-keyed from the per-player reference (elo-lift-reference.ts)
// to per-WeaponArchetype ratings. Standard Elo, K=32, seed 1500. Ratings persist via
// db.eloLedger()/appendEloLedger(): current rating for an archetype = the rating_after of the
// most recent ledger row for that archetype (default 1500 if none exists).
//
// No I/O side effects beyond the explicit db calls below — pure math mirrors elo-lift-reference.ts.

import type { WeaponArchetype } from '../lib/types';
import { appendEloLedger, eloLedger } from '../lib/db';

export const ARCHETYPE_ELO_SEED = 1500;
export const ARCHETYPE_ELO_K = 32;

/** Expected score of A against B (0..1). Identical formula to elo-lift-reference.ts. */
export function expectedScore(aElo: number, bElo: number): number {
  return 1 / (1 + Math.pow(10, (bElo - aElo) / 400));
}

export interface EloUpdate {
  a: number;
  b: number;
  /** Signed change applied to A (B gets the negation). */
  delta: number;
}

/** Apply one Elo update. `outcomeA` is 1 / 0 / 0.5. Zero-sum and symmetric. */
export function eloUpdate(aElo: number, bElo: number, outcomeA: number, k = ARCHETYPE_ELO_K): EloUpdate {
  const ea = expectedScore(aElo, bElo);
  const delta = Math.round(k * (outcomeA - ea));
  return { a: aElo + delta, b: bElo - delta, delta };
}

/**
 * Current rating for an archetype = rating_after of the most recent elo_ledger row for that
 * archetype, or ARCHETYPE_ELO_SEED (1500) if the archetype has never appeared in the ledger.
 */
export function currentRating(archetype: WeaponArchetype, ledger = eloLedger()): number {
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    if (ledger[i].archetype === archetype) return ledger[i].rating_after;
  }
  return ARCHETYPE_ELO_SEED;
}

/** Snapshot of current ratings for every archetype seen so far (for display / debugging). */
export function allCurrentRatings(): Record<string, number> {
  const ledger = eloLedger();
  const seen = new Set<string>();
  const out: Record<string, number> = {};
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    const row = ledger[i];
    if (seen.has(row.archetype)) continue;
    seen.add(row.archetype);
    out[row.archetype] = row.rating_after;
  }
  return out;
}

/**
 * Record the outcome of a matchup between two archetypes and persist the Elo update to
 * elo_ledger via appendEloLedger. `outcomeA` is 1 (A won), 0 (A lost), or 0.5 (draw/void).
 * Returns the resulting ratings.
 */
export function recordArchetypeResult(
  archetypeA: WeaponArchetype,
  archetypeB: WeaponArchetype,
  outcomeA: number,
  matchupId: string,
  k = ARCHETYPE_ELO_K,
): EloUpdate {
  const ledger = eloLedger();
  const beforeA = currentRating(archetypeA, ledger);
  const beforeB = currentRating(archetypeB, ledger);
  const update = eloUpdate(beforeA, beforeB, outcomeA, k);

  appendEloLedger({ archetype: archetypeA, ratingBefore: beforeA, ratingAfter: update.a, matchupId });
  appendEloLedger({ archetype: archetypeB, ratingBefore: beforeB, ratingAfter: update.b, matchupId });

  return update;
}
