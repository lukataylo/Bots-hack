// Headless deterministic Monte Carlo fight sim on @dimforge/rapier3d-compat (Node-safe, async
// init, inlined wasm — no native build step). Coarse model: two rigid-body boxes sized/massed
// from weight_kg circle each other, trade archetype-flavoured blows on an engagement/cooldown
// cadence, and an HP pool drains until KO or the sim-time cap (judges' decision on remaining HP).
// Same seed -> same fight, always (mulberry32 PRNG drives every stochastic decision).
//
// BALANCE MODEL (the important bit): who wins each engagement is decided by a roll driven
// strongly by the passed MatchupOdds (see `engagementWinProbA`), NOT by archetype identity.
// params.ts intentionally keeps average impulse per landed blow close across archetypes so no
// archetype is a bigger hitter "for free" — archetype only controls the FLAVOR of a landed blow
// (impulse spread, crit chance, launch chance/size). This is what makes a 0.5/0.5 abstain odds
// pairing land near a 50/50 winShare regardless of which two archetypes are fighting, and makes
// a 0.66 odds pairing land close to a 0.66 winShare, while every archetype (including flippers
// launching heavier spinners) keeps a genuine, structural path to a KO via the launch mechanic.
//
// PACING: engagements happen on a flat per-tick chance while not in cooldown; landing a blow
// triggers a cooldown (repositioning) window before the next engagement can happen. Combined
// with modest per-hit damage this targets a 20-60 sim-second median fight, comfortably clearing
// the "marquee needs >= 8s of frames" requirement.
//
// Perf: 10Hz physics ticks, hard-capped at 90 sim-seconds (900 ticks) so 1000 runs stays well
// under the 10s Monte Carlo budget even with the slower pacing.

import RAPIER from '@dimforge/rapier3d-compat';
import type { FighterProfile, MatchupOdds, SimResult } from '../../lib/types';
import { paramsFor } from './params';
import { mulberry32, jitteredMean, type Rng } from './rng';

const TICK_HZ = 10;
const DT = 1 / TICK_HZ;
const MAX_TICKS = 900; // 90 sim-second hard cap — headroom above the 20-60s median target

const ENGAGEMENT_CHANCE = 0.16; // per-tick chance of a clash while not in cooldown
const COOLDOWN_MIN_TICKS = 9; // ~0.9s repositioning after a landed blow
const COOLDOWN_MAX_TICKS = 22; // ~2.2s

const DAMAGE_SCALE = 0.032; // HP lost per unit impulse (N.s) on a base landed blow
const LAUNCH_DAMAGE_SCALE = 0.045; // extra HP lost per unit launchImpulse on a launch event
// Calibrated empirically (not derived) against a spinner-vs-flipper matchup swept across
// winProbA in [0.34, 0.90]: a per-engagement race to ~15 landed hits amplifies a fixed
// per-trial edge a lot (classic gambler's-ruin sharpening), so BIAS_K stays well below 1 to
// compensate — 0.4 keeps the resulting winShare within ~0.15 of the passed odds across that
// whole sweep while abstain (odds 0.5/0.5) still lands within 0.5 +/- 0.15.
const BIAS_K = 0.4;
const REFERENCE_WEIGHT_KG = 100;

let initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = RAPIER.init();
  return initPromise;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic base seed for a matchup — same two fighters always Monte-Carlo the same way. */
export function matchupSeed(a: FighterProfile, b: FighterProfile): number {
  return fnv1a(`${a.name}|${a.weapon_class}|${b.name}|${b.weapon_class}`);
}

function runSeed(baseSeed: number, i: number): number {
  return (baseSeed + i * 0x9e3779b9) >>> 0;
}

function computeHP(weightKg: number | null): number {
  const w = weightKg ?? REFERENCE_WEIGHT_KG;
  return clamp(100 + (w - REFERENCE_WEIGHT_KG) * 0.15, 60, 160);
}

function computeHalfExtents(weightKg: number | null): [number, number, number] {
  const w = weightKg ?? REFERENCE_WEIGHT_KG;
  const scale = clamp(Math.cbrt(w / REFERENCE_WEIGHT_KG), 0.6, 1.6);
  return [0.5 * scale, 0.35 * scale, 0.5 * scale];
}

/**
 * Per-engagement probability that A wins the exchange. This is the ONLY place matchup odds
 * influence who wins — deliberately amplified (BIAS_K > 1) because a fixed per-engagement
 * probability gets damped by the HP race before it turns into a winShare (a coinflip-per-hit
 * process doesn't preserve its own probability 1:1 across a multi-hit race). When odds.abstain
 * (winProbA === winProbB === 0.5) this returns exactly 0.5 — a fair coin.
 */
function engagementWinProbA(odds: MatchupOdds): number {
  if (odds.abstain) return 0.5;
  return clamp(0.5 + (odds.winProbA - 0.5) * BIAS_K, 0.05, 0.95);
}

export interface FightEvent {
  type: 'hit' | 'launch' | 'ko';
  magnitude: number;
}

export interface MarqueeFrame {
  t: number;
  a: { p: [number, number, number]; q: [number, number, number, number] };
  b: { p: [number, number, number]; q: [number, number, number, number] };
  events: FightEvent[];
}

export interface FightRunResult {
  winner: 'A' | 'B';
  method: 'ko' | 'jd';
  /** Raw sim duration in seconds (ticks * DT) — exactly what the physics ran, unscaled. */
  durationSec: number;
  seed: number;
  frames: MarqueeFrame[] | null;
}

/**
 * Run a single deterministic fight. Pass `recordFrames: true` to capture 10Hz keyframes for the
 * marquee renderer (src/three reads these — see marquee.ts for the exact JSON shape written).
 */
export async function runFight(
  a: FighterProfile,
  b: FighterProfile,
  odds: MatchupOdds,
  seed: number,
  opts: { recordFrames?: boolean } = {},
): Promise<FightRunResult> {
  await ensureInit();
  const rng: Rng = mulberry32(seed);

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;

  const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0);
  const ground = world.createRigidBody(groundDesc);
  world.createCollider(RAPIER.ColliderDesc.cuboid(12, 0.5, 12).setFriction(0.7).setRestitution(0.05), ground);

  const [hxA, hyA, hzA] = computeHalfExtents(a.weight_kg);
  const [hxB, hyB, hzB] = computeHalfExtents(b.weight_kg);

  // NOTE: Collider.setMass() called *after* creation is a no-op in @dimforge/rapier3d-compat
  // 0.19.3 (verified empirically — body.mass() stays at the density-derived default). Mass MUST
  // be set on the ColliderDesc *before* world.createCollider().
  const bodyA = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(-1.6, hyA + 0.02, 0).setLinearDamping(0.5).setAngularDamping(0.7),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hxA, hyA, hzA).setFriction(0.6).setRestitution(0.1).setMass(a.weight_kg ?? REFERENCE_WEIGHT_KG),
    bodyA,
  );

  const bodyB = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(1.6, hyB + 0.02, 0).setLinearDamping(0.5).setAngularDamping(0.7),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hxB, hyB, hzB).setFriction(0.6).setRestitution(0.1).setMass(b.weight_kg ?? REFERENCE_WEIGHT_KG),
    bodyB,
  );

  const paramsA = paramsFor(a.weapon_class);
  const paramsB = paramsFor(b.weapon_class);
  const pAeff = engagementWinProbA(odds);

  let hpA = computeHP(a.weight_kg);
  let hpB = computeHP(b.weight_kg);

  const frames: MarqueeFrame[] | null = opts.recordFrames ? [] : null;
  let winner: 'A' | 'B' | null = null;
  let method: 'ko' | 'jd' = 'jd';
  let tick = 0;
  let cooldownTicks = 0;

  const landBlow = (
    landingSide: 'A' | 'B',
    attackerBody: RAPIER.RigidBody,
    defenderBody: RAPIER.RigidBody,
    params: ReturnType<typeof paramsFor>,
  ): { events: FightEvent[]; damage: number } => {
    const impulseMag = jitteredMean(rng, params.impulseMean, params.impulseStd);
    const isCrit = rng() < params.critChance;
    const isLaunch = rng() < params.launchChance;

    const at = attackerBody.translation();
    const dt_ = defenderBody.translation();
    const dx = dt_.x - at.x;
    const dz = dt_.z - at.z;
    const horizMag = Math.hypot(dx, dz) || 1;
    const dirX = dx / horizMag;
    const dirZ = dz / horizMag;
    const vertical = isLaunch ? params.launchImpulse : impulseMag * 0.12;

    defenderBody.applyImpulseAtPoint(
      { x: dirX * impulseMag, y: vertical, z: dirZ * impulseMag },
      dt_,
      true,
    );

    let damage = impulseMag * DAMAGE_SCALE * (isCrit ? params.critMultiplier : 1);
    const events: FightEvent[] = [{ type: 'hit', magnitude: Math.round(impulseMag * 100) / 100 }];
    if (isLaunch) {
      damage += params.launchImpulse * LAUNCH_DAMAGE_SCALE;
      events.push({ type: 'launch', magnitude: Math.round(vertical * 100) / 100 });
    }

    return { events, damage };
  };

  // Gentle circling drift during cooldown so the marquee replay stays visually alive between
  // exchanges instead of freezing — purely cosmetic, far too small to affect HP.
  const applyCircling = () => {
    const angle = tick * 0.15;
    bodyA.applyImpulseAtPoint({ x: Math.cos(angle) * 1.5, y: 0, z: Math.sin(angle) * 1.5 }, bodyA.translation(), true);
    bodyB.applyImpulseAtPoint({ x: Math.cos(angle + Math.PI) * 1.5, y: 0, z: Math.sin(angle + Math.PI) * 1.5 }, bodyB.translation(), true);
  };

  while (tick < MAX_TICKS && winner === null) {
    const tickEvents: FightEvent[] = [];

    if (cooldownTicks > 0) {
      cooldownTicks -= 1;
      applyCircling();
    } else if (rng() < ENGAGEMENT_CHANCE) {
      const landingSide: 'A' | 'B' = rng() < pAeff ? 'A' : 'B';
      const res = landingSide === 'A'
        ? landBlow('A', bodyA, bodyB, paramsA)
        : landBlow('B', bodyB, bodyA, paramsB);

      if (landingSide === 'A') hpB -= res.damage;
      else hpA -= res.damage;
      tickEvents.push(...res.events);

      cooldownTicks = COOLDOWN_MIN_TICKS + Math.floor(rng() * (COOLDOWN_MAX_TICKS - COOLDOWN_MIN_TICKS + 1));
    }

    world.step();

    if (hpB <= 0 && hpA <= 0) {
      // Simultaneous KO (rare, coarse model) — higher remaining HP margin wins; tie -> A.
      winner = hpA >= hpB ? 'A' : 'B';
      method = 'ko';
      tickEvents.push({ type: 'ko', magnitude: 1 });
    } else if (hpB <= 0) {
      winner = 'A';
      method = 'ko';
      tickEvents.push({ type: 'ko', magnitude: 1 });
    } else if (hpA <= 0) {
      winner = 'B';
      method = 'ko';
      tickEvents.push({ type: 'ko', magnitude: 1 });
    }

    if (frames) {
      const pa = bodyA.translation();
      const qa = bodyA.rotation();
      const pb = bodyB.translation();
      const qb = bodyB.rotation();
      frames.push({
        t: Math.round(tick * DT * 100) / 100,
        a: { p: [pa.x, pa.y, pa.z], q: [qa.x, qa.y, qa.z, qa.w] },
        b: { p: [pb.x, pb.y, pb.z], q: [qb.x, qb.y, qb.z, qb.w] },
        events: tickEvents,
      });
    }

    tick += 1;
  }

  if (winner === null) {
    winner = hpA >= hpB ? 'A' : 'B';
    method = 'jd';
  }

  const durationSec = Math.round(tick * DT * 100) / 100;
  world.free();

  return { winner, method, durationSec, seed, frames };
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * simulate — headless Monte Carlo. Same (fighterA, fighterB, odds) always produces the same
 * SimResult: per-run seeds fan out deterministically from matchupSeed(a, b), no wall-clock or
 * external randomness involved. Each run's per-engagement outcome is a real coinflip around
 * engagementWinProbA(odds), so individual fights carry genuine variance even though the
 * aggregate winShare tracks the passed odds closely.
 */
export async function simulate(
  a: FighterProfile,
  b: FighterProfile,
  odds: MatchupOdds,
  runs = 1000,
): Promise<SimResult> {
  await ensureInit();
  const base = matchupSeed(a, b);

  type Outcome = { seed: number; winner: 'A' | 'B'; method: 'ko' | 'jd'; durationSec: number };
  const outcomes: Outcome[] = [];

  for (let i = 0; i < runs; i += 1) {
    const seed = runSeed(base, i);
    // eslint-disable-next-line no-await-in-loop
    const r = await runFight(a, b, odds, seed, { recordFrames: false });
    outcomes.push({ seed, winner: r.winner, method: r.method, durationSec: r.durationSec });
  }

  const winsA = outcomes.filter((o) => o.winner === 'A').length;
  const winShareA = Math.round((winsA / runs) * 1000) / 1000;
  const winShareB = Math.round((1 - winShareA) * 1000) / 1000;

  const modalKeys = ['A_ko', 'B_ko', 'A_jd', 'B_jd'] as const;
  const counts: Record<(typeof modalKeys)[number], number> = { A_ko: 0, B_ko: 0, A_jd: 0, B_jd: 0 };
  for (const o of outcomes) counts[`${o.winner}_${o.method}` as keyof typeof counts] += 1;
  let modalOutcome: (typeof modalKeys)[number] = modalKeys[0];
  for (const k of modalKeys) if (counts[k] > counts[modalOutcome]) modalOutcome = k;

  const matching = outcomes.filter((o) => `${o.winner}_${o.method}` === modalOutcome);
  const matchingDurations = matching.map((o) => o.durationSec);
  const matchingMedian = median(matchingDurations);
  let marqueeSeed = matching[0]?.seed ?? outcomes[0].seed;
  let bestDelta = Infinity;
  for (const o of matching) {
    const delta = Math.abs(o.durationSec - matchingMedian);
    if (delta < bestDelta) {
      bestDelta = delta;
      marqueeSeed = o.seed;
    }
  }

  const medianDurationSec = Math.round(median(outcomes.map((o) => o.durationSec)) * 100) / 100;

  return {
    runs,
    winShareA,
    winShareB,
    modalOutcome,
    marqueeSeed,
    medianDurationSec,
  };
}
