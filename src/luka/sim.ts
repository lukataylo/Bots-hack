// RINGSIDE ARENA — the competition simulator.
//
// One deterministic planar rigid-body model of a BattleBox bout. The same
// function runs 1,000 times headless to produce the odds AND records the single
// marquee bout the 3D renderer replays, so what the room watches is literally
// one of the runs the number came from. Seeded: same seed, same fight, forever.
//
// ponytail: planar (x,z) physics with impulse collisions instead of a full 3D
// rigid-body engine. Combat robots are floor-constrained, so the extra axis buys
// nothing the audience can see and costs 1,000x the headless budget. Swap in
// Rapier only if bots need to leave the ground meaningfully (big flippers).

import type { FighterProfile, SimResult, WeaponArchetype } from '@/lib/types';
// .ts extension so `node scripts/sim-check.ts` runs the engine with no build step.
import { rng, type FightMethod, type Side } from './protocol';

// ---------------------------------------------------------------------------
// Calibration. These are the tuning knobs — a sim, like a servo, needs trimming
// against reality. Adjust here, never inline.
// ---------------------------------------------------------------------------

export const ARENA_HALF = 7; // metres. BattleBox is ~48ft square; this is the fighting area.
const DT = 1 / 60;
const MAX_SEC = 180; // three minute bout
const HP_PER_KG = 0.8; // heavyweight (113kg) with 1.0 armour => ~90 hp
const REF_MASS = 113; // heavyweight, kg
const DMG_SCALE = 0.5; // full-charge big spinner lands ~30 hp: about four clean hits
const RAM_SCALE = 0.004; // kinetic ram energy -> weapon-energy units
const KNOCKBACK = 3.2; // impulse spectacle multiplier
const HIT_COOLDOWN = 0.5; // seconds of push-only contact after an exchange
const PIN_DPS = 1.5; // damage per second while held on the wall by a better wedge
// ponytail: a flipper's real win condition is throwing you out of the box, which
// this model has no term for. Its slam damage is scaled up to stand in. Add an
// out-of-arena outcome if flippers start looking systematically underrated.
const CATASTROPHE_DIV = 220; // a big hit can end it outright: p = dmg / this

export interface ArchetypeSpec {
  weaponKE: number; // stored weapon energy at full charge (engine units)
  spinupSec: number; // time from zero to full charge
  damageCoef: number;
  selfDamageCoef: number; // spinners hurt themselves too
  armour: number; // hp multiplier
  accel: number; // m/s^2
  topSpeed: number; // m/s
  control: number; // the ground game: who gets under whom (0..1)
  aggression: number; // how willing to close instead of circling
  radiusScale: number;
}

export const ARCHETYPES: Record<WeaponArchetype, ArchetypeSpec> = {
  horizontal_spinner: { weaponKE: 90, spinupSec: 6.0, damageCoef: 1.00, selfDamageCoef: 0.06, armour: 0.85, accel: 7.0, topSpeed: 6.0, control: 0.30, aggression: 0.85, radiusScale: 1.25 },
  vertical_spinner:   { weaponKE: 78, spinupSec: 4.5, damageCoef: 1.05, selfDamageCoef: 0.05, armour: 0.95, accel: 8.0, topSpeed: 6.5, control: 0.62, aggression: 0.90, radiusScale: 1.00 },
  drum:               { weaponKE: 52, spinupSec: 2.0, damageCoef: 0.90, selfDamageCoef: 0.035, armour: 1.05, accel: 9.0, topSpeed: 7.0, control: 0.70, aggression: 0.95, radiusScale: 0.95 },
  flipper:            { weaponKE: 36, spinupSec: 3.0, damageCoef: 0.40, selfDamageCoef: 0.02, armour: 1.10, accel: 9.5, topSpeed: 7.5, control: 0.88, aggression: 0.80, radiusScale: 1.00 },
  hammer:             { weaponKE: 34, spinupSec: 2.5, damageCoef: 0.60, selfDamageCoef: 0.02, armour: 1.00, accel: 7.5, topSpeed: 5.5, control: 0.55, aggression: 0.70, radiusScale: 0.95 },
  crusher:            { weaponKE: 26, spinupSec: 3.5, damageCoef: 0.75, selfDamageCoef: 0.02, armour: 1.25, accel: 6.0, topSpeed: 4.5, control: 0.80, aggression: 0.60, radiusScale: 1.00 },
  lifter:             { weaponKE: 14, spinupSec: 2.0, damageCoef: 0.20, selfDamageCoef: 0.02, armour: 1.20, accel: 8.5, topSpeed: 6.5, control: 0.85, aggression: 0.75, radiusScale: 1.00 },
  wedge:              { weaponKE: 6,  spinupSec: 1.0, damageCoef: 0.10, selfDamageCoef: 0.01, armour: 1.35, accel: 9.0, topSpeed: 7.0, control: 0.95, aggression: 0.65, radiusScale: 1.00 },
  multibot:           { weaponKE: 40, spinupSec: 3.0, damageCoef: 0.55, selfDamageCoef: 0.03, armour: 0.90, accel: 8.0, topSpeed: 6.5, control: 0.60, aggression: 0.85, radiusScale: 0.85 },
  other:              { weaponKE: 40, spinupSec: 3.0, damageCoef: 0.60, selfDamageCoef: 0.035, armour: 1.00, accel: 8.0, topSpeed: 6.0, control: 0.60, aggression: 0.75, radiusScale: 1.00 },
};

// ---------------------------------------------------------------------------
// Fighter -> physical spec. Every modifier below comes off the scraped record,
// shrunk toward neutral when the record is thin. Nothing is invented.
// ---------------------------------------------------------------------------

export interface BotSpec extends ArchetypeSpec {
  name: string;
  archetype: WeaponArchetype;
  mass: number;
  radius: number;
  maxHp: number;
}

export function specFor(p: FighterProfile): BotSpec {
  const base = ARCHETYPES[p.weapon_class] ?? ARCHETYPES.other;
  const mass = p.weight_kg && p.weight_kg > 0 ? p.weight_kg : REF_MASS;
  const fights = p.wins + p.losses;
  const w = fights / (fights + 4); // shrinkage: thin record => trust the archetype
  const winRate = fights > 0 ? p.wins / fights : 0.5;
  const koRate = p.wins > 0 ? Math.min(1, p.ko_wins / p.wins) : 0.5;

  const damageMult = 1 + w * (0.8 + 0.5 * koRate - 1);
  const durabilityMult = 1 + w * (0.85 + 0.4 * winRate - 1);
  const driveMult = 1 + w * (0.9 + 0.25 * winRate - 1);

  return {
    ...base,
    name: p.name,
    archetype: p.weapon_class,
    mass,
    radius: 0.55 * Math.cbrt(mass / REF_MASS) * base.radiusScale,
    maxHp: HP_PER_KG * mass * base.armour * durabilityMult,
    damageCoef: base.damageCoef * damageMult,
    accel: base.accel * driveMult,
    topSpeed: base.topSpeed * driveMult,
    control: Math.min(0.98, base.control * (0.9 + 0.2 * winRate)),
  };
}

// ---------------------------------------------------------------------------
// Bout
// ---------------------------------------------------------------------------

export interface BotFrame {
  x: number; z: number;
  heading: number; // radians, facing direction
  charge: number; // 0..1 weapon spin-up
  hpFrac: number; // 0..1
}

export interface Frame { t: number; a: BotFrame; b: BotFrame }

export interface HitEvent {
  t: number;
  attacker: Side;
  energy: number; // engine units, drives spark count and camera shake
  damage: number;
  x: number; z: number;
  catastrophic: boolean;
}

export interface BoutOutcome {
  seed: number;
  winner: Side;
  method: FightMethod;
  durationSec: number;
  damageDealtA: number;
  damageDealtB: number;
  hpFracA: number;
  hpFracB: number;
}

export interface BoutRecording extends BoutOutcome {
  specA: BotSpec;
  specB: BotSpec;
  frames: Frame[]; // 30fps
  hits: HitEvent[];
}

interface Body {
  spec: BotSpec;
  x: number; z: number;
  vx: number; vz: number;
  heading: number;
  hp: number;
  charge: number;
  damageDealt: number;
  aggressionTicks: number;
  controlWins: number;
  dead: boolean;
}

function makeBody(spec: BotSpec, x: number, z: number, heading: number): Body {
  return { spec, x, z, vx: 0, vz: 0, heading, hp: spec.maxHp, charge: 0, damageDealt: 0, aggressionTicks: 0, controlWins: 0, dead: false };
}

function frameOf(b: Body): BotFrame {
  return { x: b.x, z: b.z, heading: b.heading, charge: b.charge, hpFrac: Math.max(0, b.hp / b.spec.maxHp) };
}

/**
 * Run one bout. Pass `record` to capture the 30fps timeline the 3D renderer replays.
 * Pure and deterministic in (specA, specB, seed).
 */
export function simulateBout(specA: BotSpec, specB: BotSpec, seed: number, record = false): BoutRecording {
  const rand = rng(seed);
  const a = makeBody(specA, -3.5, -3.5, Math.PI * 0.25);
  const b = makeBody(specB, 3.5, 3.5, Math.PI * 1.25);
  const frames: Frame[] = [];
  const hits: HitEvent[] = [];

  let t = 0;
  let cooldown = 0;
  let winner: Side | null = null;
  let method: FightMethod = 'jd';

  for (let tick = 0; t < MAX_SEC; tick++, t += DT) {
    if (record && tick % 2 === 0) frames.push({ t, a: frameOf(a), b: frameOf(b) });

    drive(a, b, rand);
    drive(b, a, rand);
    integrate(a);
    integrate(b);

    cooldown -= DT;
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    const touching = dist < a.spec.radius + b.spec.radius;

    if (touching) {
      const ux = dx / dist, uz = dz / dist;
      separate(a, b, ux, uz, dist);
      if (cooldown <= 0) {
        cooldown = HIT_COOLDOWN;
        const closing = (a.vx - b.vx) * ux + (a.vz - b.vz) * uz;
        // Ground game: whoever gets under sets the terms of the exchange.
        const edge = a.spec.control - b.spec.control + (rand() - 0.5) * 0.4;
        exchange(a, b, 'A', edge, Math.max(0, closing), t, hits, rand);
        exchange(b, a, 'B', -edge, Math.max(0, closing), t, hits, rand);
        if (edge > 0) a.controlWins++; else b.controlWins++;
        knockback(a, b, ux, uz);
      } else {
        // Pushed against the wall by a better wedge: the pin damage nobody scores.
        const pinned = onWall(b) && a.spec.control > b.spec.control ? b : onWall(a) && b.spec.control > a.spec.control ? a : null;
        if (pinned) pinned.hp -= PIN_DPS * DT;
      }
    }

    if (a.hp <= 0 || a.dead) { winner = 'B'; method = 'ko'; break; }
    if (b.hp <= 0 || b.dead) { winner = 'A'; method = 'ko'; break; }
  }

  if (!winner) winner = judgesDecision(a, b);
  if (record) frames.push({ t, a: frameOf(a), b: frameOf(b) });

  return {
    seed, winner, method,
    durationSec: Math.round(t * 10) / 10,
    damageDealtA: a.damageDealt,
    damageDealtB: b.damageDealt,
    hpFracA: Math.max(0, a.hp / a.spec.maxHp),
    hpFracB: Math.max(0, b.hp / b.spec.maxHp),
    specA, specB, frames, hits,
  };
}

function drive(self: Body, foe: Body, rand: () => number) {
  const s = self.spec;
  self.charge = Math.min(1, self.charge + DT / s.spinupSec);

  const dx = foe.x - self.x, dz = foe.z - self.z;
  const dist = Math.hypot(dx, dz) || 1e-6;
  let ux = dx / dist, uz = dz / dist;

  // The engagement cycle that makes a spinner a spinner: hit, break off, spin
  // back up, commit again. Without the break it never reaches full charge and a
  // bare wedge out-attritions Tombstone, which is not the sport we are modelling.
  const needsCharge = s.weaponKE > 20 && self.charge < 0.6;
  if (needsCharge) {
    const sign = self.x + self.z > 0 ? 1 : -1;
    const px = -uz * sign, pz = ux * sign; // orbit
    const back = dist < 4 ? 0.6 : 0; // and give itself room to wind up
    [ux, uz] = norm(px * 0.8 - ux * back, pz * 0.8 - uz * back);
  }
  const jitter = (rand() - 0.5) * 0.5;
  const c = Math.cos(jitter), sn = Math.sin(jitter);
  [ux, uz] = [ux * c - uz * sn, ux * sn + uz * c];

  const mobility = Math.max(0.15, Math.min(1, (self.hp / s.maxHp) * 1.4));
  self.vx += ux * s.accel * mobility * DT;
  self.vz += uz * s.accel * mobility * DT;

  const speed = Math.hypot(self.vx, self.vz);
  const cap = s.topSpeed * mobility;
  if (speed > cap) { self.vx = (self.vx / speed) * cap; self.vz = (self.vz / speed) * cap; }
  if (!needsCharge && speed > cap * 0.5) self.aggressionTicks++;
  if (speed > 0.05) self.heading = Math.atan2(self.vx, self.vz);
}

function norm(x: number, z: number): [number, number] {
  const d = Math.hypot(x, z) || 1e-6;
  return [x / d, z / d];
}

function integrate(bd: Body) {
  bd.vx *= 0.985; bd.vz *= 0.985; // floor friction
  bd.x += bd.vx * DT; bd.z += bd.vz * DT;
  const lim = ARENA_HALF - bd.spec.radius;
  if (bd.x < -lim) { bd.x = -lim; bd.vx *= -0.35; }
  if (bd.x > lim) { bd.x = lim; bd.vx *= -0.35; }
  if (bd.z < -lim) { bd.z = -lim; bd.vz *= -0.35; }
  if (bd.z > lim) { bd.z = lim; bd.vz *= -0.35; }
}

function onWall(bd: Body) {
  const lim = ARENA_HALF - bd.spec.radius - 0.25;
  return Math.abs(bd.x) > lim || Math.abs(bd.z) > lim;
}

function separate(a: Body, b: Body, ux: number, uz: number, dist: number) {
  const overlap = a.spec.radius + b.spec.radius - dist;
  const total = a.spec.mass + b.spec.mass;
  const sa = overlap * (b.spec.mass / total), sb = overlap * (a.spec.mass / total);
  a.x -= ux * sa; a.z -= uz * sa;
  b.x += ux * sb; b.z += uz * sb;
}

function exchange(
  atk: Body, def: Body, side: Side, edge: number, closing: number,
  t: number, hits: HitEvent[], rand: () => number,
) {
  // edge > 0 means the attacker won the ground game and lands clean; below it
  // rides up the opponent's wedge and most of the energy goes nowhere. A wedge
  // blunts a spinner, it does not make it harmless, hence the 0.3 floor.
  const quality = Math.max(0.3, Math.min(1.25, 0.78 + 0.5 * edge));
  const weaponEnergy = atk.spec.weaponKE * atk.charge;
  const ramEnergy = 0.5 * atk.spec.mass * closing * closing * RAM_SCALE;
  const energy = (weaponEnergy + ramEnergy) * quality;
  if (energy < 0.5) return;

  const damage = (energy * atk.spec.damageCoef * DMG_SCALE) / def.spec.armour;
  def.hp -= damage;
  atk.hp -= energy * atk.spec.selfDamageCoef; // recoil: the spinner pays too
  atk.damageDealt += damage;
  atk.charge *= 0.15; // energy dumped into the hit, spin it back up

  // One clean shot can end a fight. Probability scales with the hit, nothing else.
  const catastrophic = rand() < Math.min(0.35, damage / CATASTROPHE_DIV);
  if (catastrophic) def.dead = true;

  hits.push({
    t, attacker: side, energy, damage, catastrophic,
    x: (atk.x + def.x) / 2, z: (atk.z + def.z) / 2,
  });
}

function knockback(a: Body, b: Body, ux: number, uz: number) {
  const e = Math.max(a.spec.weaponKE * a.charge, b.spec.weaponKE * b.charge, 4);
  const va = Math.sqrt((2 * e) / a.spec.mass) * KNOCKBACK;
  const vb = Math.sqrt((2 * e) / b.spec.mass) * KNOCKBACK;
  a.vx -= ux * va; a.vz -= uz * va;
  b.vx += ux * vb; b.vz += uz * vb;
}

/** Three judges, BattleBots scoring: damage 5, aggression 3, control 3. */
function judgesDecision(a: Body, b: Body): Side {
  const share = (x: number, y: number) => (x + y > 0 ? x / (x + y) : 0.5);
  const dmg = share(a.damageDealt, b.damageDealt);
  const agg = share(a.aggressionTicks, b.aggressionTicks);
  const ctl = share(a.controlWins, b.controlWins);
  const scoreA = dmg * 5 + agg * 3 + ctl * 3;
  return scoreA >= 5.5 ? 'A' : 'B';
}

// ---------------------------------------------------------------------------
// Monte Carlo — the 1,000 fights that happen before the real one
// ---------------------------------------------------------------------------

export interface MonteCarlo {
  result: SimResult;
  marquee: BoutRecording;
}

/**
 * Fight it `runs` times, then re-run the single most representative bout with
 * recording on. Representative = matches the modal outcome and lands closest to
 * that group's median duration. Not cherry-picked: the marquee bout is chosen by
 * the distribution, so the fight the room watches is the fight the odds describe.
 */
export function monteCarlo(a: FighterProfile, b: FighterProfile, runs = 1000, baseSeed = 1): MonteCarlo {
  const specA = specFor(a), specB = specFor(b);
  const outcomes: BoutOutcome[] = [];
  for (let i = 0; i < runs; i++) outcomes.push(simulateBout(specA, specB, baseSeed + i * 7919));

  const key = (o: BoutOutcome) => `${o.winner}_${o.method}` as SimResult['modalOutcome'];
  const tally = new Map<string, BoutOutcome[]>();
  for (const o of outcomes) {
    const k = key(o);
    const g = tally.get(k);
    if (g) g.push(o); else tally.set(k, [o]);
  }
  let modal = key(outcomes[0]);
  for (const [k, g] of tally) if (g.length > (tally.get(modal)?.length ?? 0)) modal = k as SimResult['modalOutcome'];

  const group = tally.get(modal)!;
  const groupMedian = median(group.map((o) => o.durationSec));
  const pick = group.reduce((best, o) =>
    Math.abs(o.durationSec - groupMedian) < Math.abs(best.durationSec - groupMedian) ? o : best);

  const winsA = outcomes.filter((o) => o.winner === 'A').length;
  return {
    result: {
      runs,
      winShareA: winsA / runs,
      winShareB: 1 - winsA / runs,
      modalOutcome: modal,
      marqueeSeed: pick.seed,
      medianDurationSec: median(outcomes.map((o) => o.durationSec)),
    },
    marquee: simulateBout(specA, specB, pick.seed, true),
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
