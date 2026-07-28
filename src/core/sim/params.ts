// Coarse per-archetype combat tuning. Deliberately simple — this is a headless Monte Carlo, not
// a full combat sim. Every archetype in WeaponArchetype gets a param set so lookups never fail.

import type { WeaponArchetype } from '../../lib/types';

export interface ArchetypeParams {
  /** Per-tick (0.1s) probability this archetype lands a strike attempt on its opponent. */
  strikeChance: number;
  /** Mean impulse magnitude (N.s) of a landed strike. */
  impulseMean: number;
  /** Spread around impulseMean. */
  impulseStd: number;
  /** Probability a landed strike also launches the defender into the air (drama + fall damage). */
  launchChance: number;
  /** Extra vertical impulse magnitude applied on a launch event. */
  launchImpulse: number;
  /** Probability a landed strike is a heavy "overhead" crit (hammer/crusher signature). */
  critChance: number;
  /** Damage multiplier on a crit. */
  critMultiplier: number;
  /** 0..1: how much a landed hit suppresses the defender's strikeChance next few ticks (control). */
  controlFactor: number;
}

const DEFAULT_PARAMS: ArchetypeParams = {
  strikeChance: 0.4,
  impulseMean: 140,
  impulseStd: 40,
  launchChance: 0.08,
  launchImpulse: 60,
  critChance: 0.06,
  critMultiplier: 1.6,
  controlFactor: 0.1,
};

export const ARCHETYPE_PARAMS: Record<WeaponArchetype, ArchetypeParams> = {
  // High impulse periodic strikes — hits hard and often once spun up.
  horizontal_spinner: {
    strikeChance: 0.5, impulseMean: 220, impulseStd: 70,
    launchChance: 0.1, launchImpulse: 50,
    critChance: 0.1, critMultiplier: 1.7,
    controlFactor: 0.05,
  },
  // Similar profile, more prone to launching the opponent (vertical throw).
  vertical_spinner: {
    strikeChance: 0.48, impulseMean: 200, impulseStd: 65,
    launchChance: 0.22, launchImpulse: 90,
    critChance: 0.08, critMultiplier: 1.6,
    controlFactor: 0.05,
  },
  // Medium impulse, frequent, moderate launch chance.
  drum: {
    strikeChance: 0.45, impulseMean: 150, impulseStd: 45,
    launchChance: 0.15, launchImpulse: 70,
    critChance: 0.07, critMultiplier: 1.5,
    controlFactor: 0.08,
  },
  // Flipper: low direct damage, high launch chance — wins on drama/positioning, not raw impulse.
  flipper: {
    strikeChance: 0.35, impulseMean: 90, impulseStd: 30,
    launchChance: 0.45, launchImpulse: 140,
    critChance: 0.03, critMultiplier: 1.3,
    controlFactor: 0.15,
  },
  // Hammer: overhead strikes — lower frequency, high variance, big crits.
  hammer: {
    strikeChance: 0.38, impulseMean: 250, impulseStd: 90,
    launchChance: 0.05, launchImpulse: 40,
    critChance: 0.18, critMultiplier: 1.9,
    controlFactor: 0.05,
  },
  // Crusher: hammer's slower, heavier cousin.
  crusher: {
    strikeChance: 0.32, impulseMean: 260, impulseStd: 85,
    launchChance: 0.04, launchImpulse: 30,
    critChance: 0.2, critMultiplier: 2.0,
    controlFactor: 0.05,
  },
  // Lifter: control-oriented, low damage, moderate launch (tips/lifts opponent).
  lifter: {
    strikeChance: 0.4, impulseMean: 70, impulseStd: 25,
    launchChance: 0.3, launchImpulse: 100,
    critChance: 0.02, critMultiplier: 1.2,
    controlFactor: 0.25,
  },
  // Wedge: control/pushes — frequent, low-damage hits that suppress the opponent.
  wedge: {
    strikeChance: 0.6, impulseMean: 60, impulseStd: 20,
    launchChance: 0.05, launchImpulse: 30,
    critChance: 0.02, critMultiplier: 1.2,
    controlFactor: 0.3,
  },
  // Multibot: many small hits, high frequency, low individual magnitude.
  multibot: {
    strikeChance: 0.55, impulseMean: 100, impulseStd: 35,
    launchChance: 0.1, launchImpulse: 40,
    critChance: 0.05, critMultiplier: 1.4,
    controlFactor: 0.1,
  },
  other: DEFAULT_PARAMS,
};

export function paramsFor(archetype: WeaponArchetype): ArchetypeParams {
  return ARCHETYPE_PARAMS[archetype] ?? DEFAULT_PARAMS;
}
