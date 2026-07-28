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
// impulseMean is solved per archetype (see the comment above each entry) so that EXPECTED DAMAGE
// PER LANDED BLOW — impulseMean*DAMAGE_SCALE*(1 + critChance*(critMultiplier-1)) + launchChance*
// launchImpulse*LAUNCH_DAMAGE_SCALE (both constants live in engine.ts) — comes out to the same
// ~6.5 HP for every archetype. This matters a lot: without it, an archetype with a big launch
// bonus (flipper) needs fewer average landed hits to KO than one without, which skews the sim's
// winShare even at a perfectly fair 50/50 engagement roll (verified empirically — this is the
// actual bug behind the "flipper always loses to spinner" balance report). Flavor now lives
// entirely in HOW damage arrives (raw impulse vs crit spikes vs launch spikes), not how much.

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
