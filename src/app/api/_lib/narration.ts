// One-sentence TV-commentator narration. Nullable by design: any failure (missing key, network,
// model error, rate limit) resolves to null and the UI renders fine without it. Never load-bearing.
//
// Provider: Groq (llama-3.3-70b-versatile) primary, OpenAI fallback if Groq errors. No Anthropic
// key exists on this machine (team-lead contract change 2026-07-28) — do not reintroduce it.
import { groq } from '@ai-sdk/groq';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import type { MatchupOdds, SimResult } from '@/lib/types';

function buildPrompt(nameA: string, nameB: string, odds: MatchupOdds, sim: SimResult | null): string {
  const oddsLine = odds.abstain
    ? `The line makers abstained, not enough evidence to call it.`
    : `${nameA} is favoured ${(odds.winProbA * 100).toFixed(0)}% to ${(odds.winProbB * 100).toFixed(0)}%.`;
  const simLine = sim
    ? ` A thousand physics sims came back ${(sim.winShareA * 100).toFixed(0)}% in ${nameA}'s favour, modal outcome ${sim.modalOutcome}.`
    : '';
  return (
    `You are a hyped-up TV combat robotics commentator calling the pre-fight lockup between ` +
    `"${nameA}" and "${nameB}". ${oddsLine}${simLine} Give exactly ONE punchy broadcast-ready ` +
    `sentence of commentary. No hashtags, no emoji, no quotation marks.`
  );
}

function clean(text: string): string | null {
  const trimmed = text.trim().replace(/^"|"$/g, '');
  return trimmed || null;
}

export async function generateNarration(
  nameA: string,
  nameB: string,
  odds: MatchupOdds,
  sim: SimResult | null,
): Promise<string | null> {
  const prompt = buildPrompt(nameA, nameB, odds, sim);

  try {
    const { text } = await generateText({ model: groq('llama-3.3-70b-versatile'), prompt });
    return clean(text);
  } catch (groqErr) {
    console.error('[ringside] narration groq failed, falling back to openai:', groqErr);
  }

  try {
    const { text } = await generateText({ model: openai('gpt-4o-mini'), prompt });
    return clean(text);
  } catch (openaiErr) {
    console.error('[ringside] narration openai fallback failed:', openaiErr);
    return null;
  }
}
