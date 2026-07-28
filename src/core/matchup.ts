// Deterministic archetype-vs-archetype matchup odds. NO LLM, NO randomness: blends historical
// win rate (sample-count weighted) with archetype Elo expectation. Every number traces back to
// arithmetic performed against db.allRecords() and the elo ledger — never fabricated.

import type { FighterProfile, MatchupOdds } from '../lib/types';
import { allRecords } from '../lib/db';
import { currentRating, expectedScore } from './elo';

/** Below this many logged fights for an archetype pairing, we don't trust the historical rate. */
const MIN_SAMPLE_COUNT = 5;

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Wilson score interval (95% confidence) for a binomial proportion `wins/n`.
 * Standard closed-form approximation — no iteration, no dependency.
 */
function wilsonInterval(wins: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const lo = (center - margin) / denom;
  const hi = (center + margin) / denom;
  return [Math.max(0, round2(lo)), Math.min(1, round2(hi))];
}

interface HeadToHead {
  winsA: number;
  losses: number;
  total: number;
}

/**
 * Historical head-to-head between archetype A and archetype B, counted from both directions
 * logged in bot_records (A-beats-B rows recorded as A's win, and B-beats-A rows recorded as
 * A's loss from B's win row).
 */
function headToHead(archetypeA: string, archetypeB: string): HeadToHead {
  const rows = allRecords();
  let winsA = 0;
  let losses = 0;
  for (const r of rows) {
    const isAvB = r.weapon_class === archetypeA && r.opponent_weapon_class === archetypeB;
    const isBvA = r.weapon_class === archetypeB && r.opponent_weapon_class === archetypeA;
    if (!isAvB && !isBvA) continue;
    const aWon = (isAvB && r.outcome === 'win') || (isBvA && r.outcome === 'loss');
    if (aWon) winsA += 1;
    else losses += 1;
  }
  return { winsA, losses, total: winsA + losses };
}

/**
 * computeMatchup — deterministic, no LLM. Blends archetype-vs-archetype historical win rate
 * (sample-count weighted) with archetype Elo expectation to produce a full MatchupOdds record.
 *
 * If either fighter's archetype has fewer than MIN_SAMPLE_COUNT logged fights against the other
 * archetype, we abstain rather than fabricate a number — abstain:true, abstainReason set, and
 * winProbA/B fall back to a neutral 0.5/0.5 split (never used for display once abstain is true).
 */
export function computeMatchup(a: FighterProfile, b: FighterProfile): MatchupOdds {
  const trace: string[] = [];
  const h2h = headToHead(a.weapon_class, b.weapon_class);
  const sampleCountA = h2h.total;
  const sampleCountB = h2h.total; // symmetric — same logged pairing pool for both sides

  const eloA = currentRating(a.weapon_class);
  const eloB = currentRating(b.weapon_class);
  const eloExpectedA = expectedScore(eloA, eloB);
  trace.push(`archetype Elo ${Math.round(eloA)} vs ${Math.round(eloB)} -> expected ${round2(eloExpectedA).toFixed(2)}`);

  if (h2h.total < MIN_SAMPLE_COUNT) {
    trace.push(
      `${a.weapon_class} vs ${b.weapon_class}: only ${h2h.total} logged fight(s) between these archetypes ` +
      `(need >= ${MIN_SAMPLE_COUNT}) -> abstaining on historical blend`,
    );
    return {
      winProbA: 0.5,
      winProbB: 0.5,
      confidenceInterval: [0, 1],
      sampleCountA,
      sampleCountB,
      weighting: `insufficient sample (n=${h2h.total} < ${MIN_SAMPLE_COUNT}); elo-only expectation was ${round2(eloExpectedA).toFixed(2)}`,
      arithmeticTrace: trace,
      abstain: true,
      abstainReason: `${a.weapon_class} vs ${b.weapon_class} has only ${h2h.total} logged fight(s); minimum ${MIN_SAMPLE_COUNT} required to trust a historical win rate.`,
    };
  }

  const histRateA = h2h.winsA / h2h.total;
  trace.push(
    `${a.weapon_class} vs ${b.weapon_class}: ${h2h.winsA}-${h2h.losses} across ${h2h.total} logged fights (${pct(histRateA)})`,
  );

  // Sample-count weighting: more logged fights -> trust history more. Saturates at 30 fights,
  // where historical rate gets 80% of the blend weight (elo expectation always keeps >= 20%
  // influence, since archetype pairings can drift).
  const histWeight = round2(Math.min(0.8, 0.5 + h2h.total / 100));
  const eloWeight = round2(1 - histWeight);

  const winProbA = round2(histWeight * histRateA + eloWeight * eloExpectedA);
  const winProbB = round2(1 - winProbA);
  trace.push(
    `blend ${histWeight.toFixed(2)}*hist + ${eloWeight.toFixed(2)}*elo = ` +
    `${histWeight.toFixed(2)}*${round2(histRateA).toFixed(2)} + ${eloWeight.toFixed(2)}*${round2(eloExpectedA).toFixed(2)} = ${winProbA.toFixed(2)}`,
  );

  const confidenceInterval = wilsonInterval(h2h.winsA, h2h.total);
  trace.push(`Wilson 95% CI on historical rate (n=${h2h.total}): [${confidenceInterval[0].toFixed(2)}, ${confidenceInterval[1].toFixed(2)}]`);

  return {
    winProbA,
    winProbB,
    confidenceInterval,
    sampleCountA,
    sampleCountB,
    weighting: `${histWeight.toFixed(2)} historical (n=${h2h.total}, sample-count weighted, saturates at 30 fights) + ${eloWeight.toFixed(2)} archetype-Elo expectation`,
    arithmeticTrace: trace,
    abstain: false,
  };
}
