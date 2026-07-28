// Engine self-check. `node scripts/sim-check.ts` — no build, no test framework.
// Fails loudly if the simulator stops being deterministic, symmetric, or sane.
import assert from 'node:assert/strict';
import { simulateBout, monteCarlo, specFor, ARENA_HALF } from '../src/core/sim.ts';
import { computeOdds, fitArchetypeRatings, ELO_SEED, MIN_SAMPLES } from '../src/core/elo.ts';

const fighter = (o: Partial<Parameters<typeof specFor>[0]> & { name: string }) => ({
  weapon_class: 'horizontal_spinner' as const,
  weight_kg: 113, wins: 10, losses: 5, ko_wins: 6,
  failure_pattern: null, source_urls: [], ...o,
});

// 1. Determinism: same seed, same fight, every time.
{
  const a = specFor(fighter({ name: 'Tombstone' }));
  const b = specFor(fighter({ name: 'Hydra', weapon_class: 'flipper' }));
  const x = simulateBout(a, b, 42, true);
  const y = simulateBout(a, b, 42, true);
  assert.equal(x.winner, y.winner);
  assert.equal(x.durationSec, y.durationSec);
  assert.equal(x.frames.length, y.frames.length);
  assert.deepEqual(x.frames.at(-1), y.frames.at(-1));
  assert.notEqual(simulateBout(a, b, 43).seed, x.seed);
}

// 2. Bots stay inside the BattleBox and the recording is playable.
{
  const rec = simulateBout(specFor(fighter({ name: 'A' })), specFor(fighter({ name: 'B', weapon_class: 'drum' })), 7, true);
  assert.ok(rec.frames.length > 10, 'marquee recording has frames');
  for (const f of rec.frames) {
    for (const s of [f.a, f.b]) {
      assert.ok(Math.abs(s.x) <= ARENA_HALF && Math.abs(s.z) <= ARENA_HALF, 'bot left the arena');
      assert.ok(s.hpFrac >= 0 && s.hpFrac <= 1, 'hp fraction out of range');
      assert.ok(s.charge >= 0 && s.charge <= 1, 'weapon charge out of range');
    }
  }
  assert.ok(rec.frames.at(-1)!.t <= rec.durationSec + 0.05, 'timeline overruns the bout');
}

// 3. Record quality moves the needle, in the right direction.
{
  const strong = fighter({ name: 'Strong', wins: 30, losses: 3, ko_wins: 24 });
  const weak = fighter({ name: 'Weak', wins: 3, losses: 30, ko_wins: 1 });
  const { result } = monteCarlo(strong, weak, 400, 11);
  assert.ok(result.winShareA > 0.6, `strong record should dominate, got ${result.winShareA}`);
}

// 4. No side bias: swapping the corners mirrors the number.
{
  const a = fighter({ name: 'A', weapon_class: 'vertical_spinner', wins: 12, losses: 6, ko_wins: 8 });
  const b = fighter({ name: 'B', weapon_class: 'wedge', wins: 9, losses: 9, ko_wins: 2 });
  const fwd = monteCarlo(a, b, 400, 5).result.winShareA;
  const rev = monteCarlo(b, a, 400, 5).result.winShareB;
  assert.ok(Math.abs(fwd - rev) < 0.12, `sided bug: ${fwd.toFixed(3)} vs ${rev.toFixed(3)}`);
}

// 5. Monte Carlo contract: shares sum, marquee matches the modal outcome.
{
  const { result, marquee } = monteCarlo(
    fighter({ name: 'A' }), fighter({ name: 'B', weapon_class: 'crusher' }), 500, 3);
  assert.equal(result.runs, 500);
  assert.ok(Math.abs(result.winShareA + result.winShareB - 1) < 1e-9);
  assert.equal(`${marquee.winner}_${marquee.method}`, result.modalOutcome, 'marquee is not representative');
  assert.equal(marquee.seed, result.marqueeSeed);
  assert.ok(marquee.frames.length > 0);
}

// 6. Odds engine: abstains on thin evidence, prints its arithmetic.
{
  const a = fighter({ name: 'A', wins: 1, losses: 0, ko_wins: 1 });
  const b = fighter({ name: 'B', weapon_class: 'flipper', wins: 1, losses: 0, ko_wins: 0 });
  const thin = computeOdds(a, b, []);
  assert.equal(thin.abstain, true, 'must refuse to post a line with no records');
  assert.ok(thin.abstainReason && thin.abstainReason.length > 0);

  const records = Array.from({ length: 30 }, (_, i) => ({
    bot: `bot${i}`, weapon_class: 'horizontal_spinner' as const,
    opponent: `foe${i}`, opponent_weapon_class: 'flipper' as const,
    outcome: (i % 4 === 0 ? 'loss' : 'win') as 'win' | 'loss',
    method: 'ko' as const, duration_sec: 60, season: `Season ${1 + (i % 5)}`,
    source_url: 'https://example.test', fetched_at: new Date(0).toISOString(),
  }));
  const ratings = fitArchetypeRatings(records);
  assert.ok(ratings.horizontal_spinner.rating > ELO_SEED, 'winning archetype should rate above seed');
  assert.ok(ratings.flipper.rating < ELO_SEED);

  const fat = computeOdds(
    fighter({ name: 'A', wins: 20, losses: 5, ko_wins: 15 }),
    { ...b, wins: 12, losses: 12 },
    records);
  assert.equal(fat.abstain, false, `should post a line with ${fat.sampleCountA}/${fat.sampleCountB} samples`);
  assert.ok(fat.winProbA > 0.5, 'better archetype and record should be favoured');
  assert.ok(fat.confidenceInterval[0] < fat.winProbA && fat.winProbA < fat.confidenceInterval[1]);
  assert.ok(fat.arithmeticTrace.length >= 5, 'the arithmetic has to be showable');
  assert.ok(Math.min(fat.sampleCountA, fat.sampleCountB) >= MIN_SAMPLES);
}

// 7. Stage budget: 1,000 bouts have to land while the room is still watching.
{
  const t0 = performance.now();
  monteCarlo(fighter({ name: 'A' }), fighter({ name: 'B', weapon_class: 'flipper' }), 1000, 1);
  const ms = performance.now() - t0;
  console.log(`  1000 bouts in ${ms.toFixed(0)}ms`);
  assert.ok(ms < 5000, `too slow for the stage: ${ms.toFixed(0)}ms`);
}

console.log('SIM CHECK PASSED');
