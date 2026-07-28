// One-sentence TV-commentator narration via Claude. Nullable by design: any failure (missing
// key, network, model error) resolves to null and the UI renders fine without it.
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import type { MatchupOdds, SimResult } from '@/lib/types';

// @ai-sdk/anthropic ships the newer LanguageModelV4 provider spec while the installed `ai`
// package's LanguageModel union still expects V2/V3 — a version-drift mismatch between the two
// deps, not something fixable from this zone. Cast at the call site; if the runtime shapes have
// actually diverged too, generateText throws and the catch below still yields a null narration
// (nullable by design), so this never breaks the app.
type AnyLanguageModel = Parameters<typeof generateText>[0]['model'];

export async function generateNarration(
  nameA: string,
  nameB: string,
  odds: MatchupOdds,
  sim: SimResult | null,
): Promise<string | null> {
  try {
    const oddsLine = odds.abstain
      ? `The line makers abstained, not enough evidence to call it.`
      : `${nameA} is favoured ${(odds.winProbA * 100).toFixed(0)}% to ${(odds.winProbB * 100).toFixed(0)}%.`;
    const simLine = sim
      ? ` A thousand physics sims came back ${(sim.winShareA * 100).toFixed(0)}% in ${nameA}'s favour, modal outcome ${sim.modalOutcome}.`
      : '';
    const { text } = await generateText({
      model: anthropic('claude-sonnet-5') as unknown as AnyLanguageModel,
      prompt:
        `You are a hyped-up TV combat robotics commentator calling the pre-fight lockup between ` +
        `"${nameA}" and "${nameB}". ${oddsLine}${simLine} Give exactly ONE punchy broadcast-ready ` +
        `sentence of commentary. No hashtags, no emoji, no quotation marks.`,
    });
    const clean = text.trim().replace(/^"|"$/g, '');
    return clean || null;
  } catch {
    return null;
  }
}
