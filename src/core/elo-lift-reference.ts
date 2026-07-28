// Pure Elo rating — imported by BOTH the client (for optimistic display) and the
// server (authoritative). No I/O, no deps. Standard Elo, K=32, seed 1000.

import type { Winner } from "./protocol";

export const ELO_SEED = 1000;
export const ELO_K = 32;

/** Expected score of A against B (0..1). */
export function expectedScore(aElo: number, bElo: number): number {
  return 1 / (1 + Math.pow(10, (bElo - aElo) / 400));
}

export function winnerFromScores(aOverall: number, bOverall: number): Winner {
  if (aOverall > bOverall) return "A";
  if (bOverall > aOverall) return "B";
  return "tie";
}

/** Outcome value for A: win=1, loss=0, tie=0.5. */
export function outcomeForA(winner: Winner): number {
  return winner === "A" ? 1 : winner === "B" ? 0 : 0.5;
}

export interface EloUpdate {
  a: number;
  b: number;
  /** Signed change applied to A (B gets the negation). */
  delta: number;
}

/** Apply one Elo update. `outcomeA` is 1 / 0 / 0.5. Zero-sum and symmetric. */
export function eloUpdate(aElo: number, bElo: number, outcomeA: number, k = ELO_K): EloUpdate {
  const ea = expectedScore(aElo, bElo);
  const delta = Math.round(k * (outcomeA - ea));
  return { a: aElo + delta, b: bElo - delta, delta };
}

/** Convenience: resolve a round from both overalls + current ratings. */
export function resolveRound(
  aElo: number,
  bElo: number,
  aOverall: number,
  bOverall: number,
  k = ELO_K,
): { winner: Winner; update: EloUpdate } {
  const winner = winnerFromScores(aOverall, bOverall);
  const update = eloUpdate(aElo, bElo, outcomeForA(winner), k);
  return { winner, update };
}
