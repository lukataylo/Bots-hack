// RINGSIDE ARENA — the odds engine.
//
// Weapon-archetype Elo fitted over scraped fight records, plus a shrunk per-bot
// record offset. Every number the room bets against is produced here by
// arithmetic that gets printed on screen. No model is asked to guess a price.
// Below the evidence threshold this abstains instead of inventing a line.

import type { BotRecord, FighterProfile, MatchupOdds, WeaponArchetype } from '../lib/types';

export const ELO_SEED = 1500;
export const ELO_K = 24;
/** Fewer records than this on either side and the bookie posts no line. */
export const MIN_SAMPLES = 8;

export function expectedScore(aElo: number, bElo: number): number {
  return 1 / (1 + Math.pow(10, (bElo - aElo) / 400));
}

export interface ArchetypeRating { rating: number; n: number }
export type Ratings = Record<string, ArchetypeRating>;

/**
 * Fit archetype ratings from fight records, oldest season first.
 * Mirror rows (the same fight scraped from both bots) are collapsed, and
 * same-archetype fights are skipped: they carry no archetype information.
 */
export function fitArchetypeRatings(records: BotRecord[]): Ratings {
  const ratings: Ratings = {};
  const get = (k: WeaponArchetype) => (ratings[k] ??= { rating: ELO_SEED, n: 0 });

  const seen = new Set<string>();
  const ordered = [...records].sort((a, b) => seasonNum(a.season) - seasonNum(b.season));

  for (const r of ordered) {
    if (r.weapon_class === r.opponent_weapon_class) continue;
    const pair = [r.bot.toLowerCase(), r.opponent.toLowerCase()].sort().join('|');
    const k = `${pair}|${r.season}|${r.method}`;
    if (seen.has(k)) continue;
    seen.add(k);

    const A = get(r.weapon_class), B = get(r.opponent_weapon_class);
    const outcomeA = r.outcome === 'win' ? 1 : 0;
    const delta = ELO_K * (outcomeA - expectedScore(A.rating, B.rating));
    A.rating += delta; B.rating -= delta;
    A.n++; B.n++;
  }
  return ratings;
}

function seasonNum(s: string): number {
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** A fighter's own record as an Elo offset, shrunk hard when the record is thin. */
function recordOffset(p: FighterProfile): { offset: number; fights: number; shrink: number } {
  const fights = p.wins + p.losses;
  if (fights === 0) return { offset: 0, fights: 0, shrink: 0 };
  const wr = Math.min(0.95, Math.max(0.05, p.wins / fights));
  const raw = Math.max(-250, Math.min(250, 400 * Math.log10(wr / (1 - wr))));
  const shrink = fights / (fights + 6);
  return { offset: raw * shrink, fights, shrink };
}

/**
 * Price the matchup. Returns `abstain: true` with a reason when either side has
 * less evidence than MIN_SAMPLES; the caller must not post a line in that case.
 */
export function computeOdds(a: FighterProfile, b: FighterProfile, records: BotRecord[]): MatchupOdds {
  const ratings = fitArchetypeRatings(records);
  const ra = ratings[a.weapon_class] ?? { rating: ELO_SEED, n: 0 };
  const rb = ratings[b.weapon_class] ?? { rating: ELO_SEED, n: 0 };
  const oa = recordOffset(a), ob = recordOffset(b);

  const eloA = ra.rating + oa.offset;
  const eloB = rb.rating + ob.offset;
  const p = expectedScore(eloA, eloB);

  const sampleCountA = ra.n + oa.fights;
  const sampleCountB = rb.n + ob.fights;
  const nEff = Math.max(1, Math.min(sampleCountA, sampleCountB));
  const se = 0.5 / Math.sqrt(nEff);
  const ci: [number, number] = [
    Math.max(0.01, p - 1.96 * se),
    Math.min(0.99, p + 1.96 * se),
  ];

  const r = (x: number, d = 0) => x.toFixed(d);
  const arithmeticTrace = [
    `${a.weapon_class} archetype Elo ${r(ra.rating)} from ${ra.n} archetype-vs-archetype results`,
    `${b.weapon_class} archetype Elo ${r(rb.rating)} from ${rb.n} archetype-vs-archetype results`,
    `${a.name} record ${a.wins}-${a.losses} -> ${oa.offset >= 0 ? '+' : ''}${r(oa.offset)} Elo (shrunk x${r(oa.shrink, 2)})`,
    `${b.name} record ${b.wins}-${b.losses} -> ${ob.offset >= 0 ? '+' : ''}${r(ob.offset)} Elo (shrunk x${r(ob.shrink, 2)})`,
    `expected(${r(eloA)}, ${r(eloB)}) = 1 / (1 + 10^((${r(eloB)} - ${r(eloA)}) / 400)) = ${r(p, 3)}`,
    `95% interval from n=${nEff}: ${r(ci[0], 3)} to ${r(ci[1], 3)}`,
  ];

  const thin = Math.min(sampleCountA, sampleCountB) < MIN_SAMPLES;
  return {
    winProbA: p,
    winProbB: 1 - p,
    confidenceInterval: ci,
    sampleCountA,
    sampleCountB,
    weighting: `archetype Elo (K=${ELO_K}, seed ${ELO_SEED}) + record offset shrunk by n/(n+6)`,
    arithmeticTrace,
    abstain: thin,
    abstainReason: thin
      ? `Insufficient evidence: ${Math.min(sampleCountA, sampleCountB)} results on the thinner side, ${MIN_SAMPLES} required. No line posted, bets void.`
      : undefined,
  };
}

/** Decimal odds for display. Vig-free: this is a probability, not a price. */
export function toDecimalOdds(p: number): string {
  return (1 / Math.max(0.01, p)).toFixed(2);
}
