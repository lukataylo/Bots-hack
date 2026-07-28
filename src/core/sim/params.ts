// Coarse per-archetype combat FLAVOR (not win-rate). Every archetype in WeaponArchetype gets a
// param set so lookups never fail.
//
// IMPORTANT: who wins each engagement is decided by engine.ts's odds-driven roll, not by these
// numbers — that's what keeps sim winShare tracking the passed MatchupOdds instead of whichever
// archetype happens to have the biggest impulseMean. These params only control what a LANDED
// blow looks/feels like once an archetype has already won the exchange: impulse size/spread,
// crit chance (hammer/crusher signature), and launch chance (flipper/lifter signature — launches
// carry their own bonus damage roll in engine.ts, so a flipper that keeps landing launches has a
// real, structural path to KO-ing even a heavier spinner).
//
// impulseMean is intentionally kept in a narrow band (150-190) across every archetype so no
// archetype is inherently a bigger hitter than another "for free" — the spread in average damage
// per landed blow across archetypes should stay small; the spread in *variance* (crit/launch
// chance) is where the flavor lives.

import type { WeaponArchetype } from '../../lib/types';

export interface ArchetypeParams {
  /** Mean impulse magnitude (N.s) of a landed strike. Kept close across archetypes by design. */
  impulseMean: number;
  /** Spread around impulseMean. */
  impulseStd: number;
  /** Probability a landed strike is a heavy "overhead" crit (hammer/crusher signature). */
  critChance: number;
  /** Damage multiplier on a crit. */
  critMultiplier: number;
  /** Probability a landed strike also launches the defender into the air (flipper/lifter signature). */
  launchChance: number;
  /** Extra vertical impulse magnitude applied on a launch event — also drives bonus launch damage. */
  launchImpulse: number;
}

const DEFAULT_PARAMS: ArchetypeParams = {
  impulseMean: 165, impulseStd: 45,
  critChance: 0.08, critMultiplier: 1.6,
  launchChance: 0.12, launchImpulse: 60,
};

export const ARCHETYPE_PARAMS: Record<WeaponArchetype, ArchetypeParams> = {
  // High-RPM horizontal disc — consistent mid-heavy hits, modest crit, rarely launches.
  horizontal_spinner: {
    impulseMean: 175, impulseStd: 50,
    critChance: 0.12, critMultiplier: 1.6,
    launchChance: 0.1, launchImpulse: 55,
  },
  // Similar profile, more prone to popping the opponent airborne (vertical throw).
  vertical_spinner: {
    impulseMean: 170, impulseStd: 48,
    critChance: 0.1, critMultiplier: 1.55,
    launchChance: 0.22, launchImpulse: 85,
  },
  // Fast, frequent-feeling hits, moderate launch chance.
  drum: {
    impulseMean: 165, impulseStd: 42,
    critChance: 0.09, critMultiplier: 1.5,
    launchChance: 0.18, launchImpulse: 75,
  },
  // Flipper: low crit, but the HIGHEST launch chance + biggest launch impulse in the roster —
  // its whole kit is "catch the opponent and throw them", which is where its damage comes from.
  flipper: {
    impulseMean: 155, impulseStd: 40,
    critChance: 0.04, critMultiplier: 1.3,
    launchChance: 0.5, launchImpulse: 150,
  },
  // Hammer: overhead strikes — highest crit chance/multiplier in the roster, rarely launches.
  hammer: {
    impulseMean: 180, impulseStd: 55,
    critChance: 0.22, critMultiplier: 1.9,
    launchChance: 0.06, launchImpulse: 45,
  },
  // Crusher: hammer's heavier, slightly-more-consistent cousin.
  crusher: {
    impulseMean: 185, impulseStd: 50,
    critChance: 0.2, critMultiplier: 1.85,
    launchChance: 0.05, launchImpulse: 35,
  },
  // Lifter: control-oriented — modest hits, second-highest launch chance (tips/lifts opponent).
  lifter: {
    impulseMean: 150, impulseStd: 38,
    critChance: 0.03, critMultiplier: 1.25,
    launchChance: 0.35, launchImpulse: 110,
  },
  // Wedge: control/pushes — frequent-feeling, low crit, low launch, steady mid impulse.
  wedge: {
    impulseMean: 150, impulseStd: 35,
    critChance: 0.05, critMultiplier: 1.3,
    launchChance: 0.08, launchImpulse: 40,
  },
  // Multibot: many small hits read as slightly lower mean, low variance.
  multibot: {
    impulseMean: 150, impulseStd: 40,
    critChance: 0.07, critMultiplier: 1.4,
    launchChance: 0.14, launchImpulse: 50,
  },
  other: DEFAULT_PARAMS,
};

export function paramsFor(archetype: WeaponArchetype): ArchetypeParams {
  return ARCHETYPE_PARAMS[archetype] ?? DEFAULT_PARAMS;
}
