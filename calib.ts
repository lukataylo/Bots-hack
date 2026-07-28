import type { FighterProfile, MatchupOdds } from './src/lib/types';
import { simulate } from './src/core/sim/engine';

const spinner: FighterProfile = { name: 'A', weapon_class: 'horizontal_spinner', weight_kg: 110, wins: 14, losses: 6, ko_wins: 9, failure_pattern: null, source_urls: [] };
const flipper: FighterProfile = { name: 'B', weapon_class: 'flipper', weight_kg: 95, wins: 6, losses: 14, ko_wins: 2, failure_pattern: null, source_urls: [] };

function odds(winProbA: number, abstain = false): MatchupOdds {
  return { winProbA, winProbB: 1 - winProbA, confidenceInterval: [0, 1], sampleCountA: 20, sampleCountB: 20, weighting: '', arithmeticTrace: [], abstain };
}

async function run(label: string, o: MatchupOdds) {
  const r = await simulate(spinner, flipper, o, 150);
  console.log(label, JSON.stringify(r));
}

async function main() {
  await run('abstain(0.5)', odds(0.5, true));
  await run('0.55', odds(0.55));
  await run('0.60', odds(0.6));
  await run('0.66', odds(0.66));
  await run('0.75', odds(0.75));
}
main();
