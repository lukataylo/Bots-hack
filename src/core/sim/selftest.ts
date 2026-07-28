// Self-test for the ENGINE zone: computeMatchup + simulate(runs=200) + recordMarquee against two
// synthetic FighterProfiles. Prints results and timing.
//
// Run it (bun for TS resolution + tsconfig paths, node for the actual run because better-sqlite3's
// native binding cannot be dlopen'd by the Bun runtime itself in this environment — see the note
// in the ENGINE handoff. This still only touches src/core/*):
//
//   bun build src/core/sim/selftest.ts --target=node --format=esm \
//     --conditions=react-server --external better-sqlite3 --external @dimforge/rapier3d-compat \
//     --outfile=.selftest-bundle.mjs && RINGSIDE_DB=data/selftest.db node .selftest-bundle.mjs
//
// (rm data/selftest.db* and .selftest-bundle.mjs afterward — this script is side-effect-free
// against the real ringside.db as long as RINGSIDE_DB points elsewhere.)

import type { BotRecord, FighterProfile } from '../../lib/types';
import { upsertBotRecords } from '../../lib/db';
import { recordArchetypeResult } from '../elo';
import { computeMatchup } from '../matchup';
import { simulate } from './engine';
import { recordMarquee, marqueePath } from './marquee';
import fs from 'fs';

const fighterA: FighterProfile = {
  name: 'Test Spinner',
  weapon_class: 'horizontal_spinner',
  weight_kg: 110,
  wins: 14,
  losses: 6,
  ko_wins: 9,
  failure_pattern: null,
  source_urls: [],
};

const fighterB: FighterProfile = {
  name: 'Test Flipper',
  weapon_class: 'flipper',
  weight_kg: 95,
  wins: 6,
  losses: 14,
  ko_wins: 2,
  failure_pattern: null,
  source_urls: [],
};

function seedSyntheticRecords(): void {
  const rows: BotRecord[] = [];
  const now = new Date().toISOString();
  // 14-6 across 20 logged horizontal_spinner-vs-flipper fights (matches the ENGINE brief's own
  // worked example trace line).
  for (let i = 0; i < 14; i += 1) {
    rows.push({
      bot: `SyntheticSpinner-${i}`, weapon_class: 'horizontal_spinner',
      opponent: `SyntheticFlipper-${i}`, opponent_weapon_class: 'flipper',
      outcome: 'win', method: 'ko', duration_sec: 45, season: `selftest-${i}`,
      source_url: 'https://selftest.local', fetched_at: now,
    });
  }
  for (let i = 0; i < 6; i += 1) {
    rows.push({
      bot: `SyntheticSpinner-${i + 14}`, weapon_class: 'horizontal_spinner',
      opponent: `SyntheticFlipper-${i + 14}`, opponent_weapon_class: 'flipper',
      outcome: 'loss', method: 'jd', duration_sec: 150, season: `selftest-${i + 14}`,
      source_url: 'https://selftest.local', fetched_at: now,
    });
  }
  const n = upsertBotRecords(rows);
  console.log(`[selftest] seeded ${n} synthetic bot_records rows`);
}

function seedSyntheticElo(): void {
  // Nudge archetype ratings away from the 1500 seed so the trace shows real, non-default numbers.
  recordArchetypeResult('horizontal_spinner', 'flipper', 1, 'selftest-elo-1');
  recordArchetypeResult('horizontal_spinner', 'flipper', 1, 'selftest-elo-2');
  recordArchetypeResult('horizontal_spinner', 'flipper', 0, 'selftest-elo-3');
  recordArchetypeResult('horizontal_spinner', 'flipper', 1, 'selftest-elo-4');
  console.log('[selftest] seeded 4 elo_ledger rounds for horizontal_spinner vs flipper');
}

async function main() {
  console.log('=== RINGSIDE ARENA / ENGINE selftest ===');
  seedSyntheticRecords();
  seedSyntheticElo();

  console.log('\n--- computeMatchup ---');
  const t0 = performance.now();
  const odds = computeMatchup(fighterA, fighterB);
  const t1 = performance.now();
  console.log(JSON.stringify(odds, null, 2));
  console.log(`computeMatchup took ${(t1 - t0).toFixed(2)}ms`);
  if (odds.abstain) throw new Error('selftest expected a non-abstain matchup (sample size was seeded to 20)');

  console.log('\n--- simulate(runs=200) ---');
  const t2 = performance.now();
  const sim = await simulate(fighterA, fighterB, odds, 200);
  const t3 = performance.now();
  console.log(JSON.stringify(sim, null, 2));
  console.log(`simulate(200 runs) took ${(t3 - t2).toFixed(2)}ms (${((t3 - t2) / 200).toFixed(2)}ms/run avg)`);
  console.log(`projected 1000-run time: ${(((t3 - t2) / 200) * 1000).toFixed(0)}ms`);

  console.log('\n--- recordMarquee ---');
  const matchupId = 'selftest-matchup-001';
  const t4 = performance.now();
  await recordMarquee(fighterA, fighterB, sim.marqueeSeed, matchupId);
  const t5 = performance.now();
  const outPath = marqueePath(matchupId);
  const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  console.log(`wrote ${outPath}`);
  console.log(`marquee shape: fps=${written.fps}, frames=${written.frames.length}, winner=${written.winner}, durationSec=${written.durationSec}`);
  console.log(`first frame: ${JSON.stringify(written.frames[0])}`);
  console.log(`last frame:  ${JSON.stringify(written.frames[written.frames.length - 1])}`);
  console.log(`recordMarquee took ${(t5 - t4).toFixed(2)}ms`);

  console.log('\n=== SELFTEST PASSED ===');
}

main().catch((e) => {
  console.error('SELFTEST FAILED:', e);
  process.exit(1);
});
