import type { BotRecord, FighterProfile, TraceStep, WeaponArchetype } from '../types';
import { upsertBotRecords } from '../db';
import {
  FANDOM,
  WIKIPEDIA,
  resolvePage,
  parseBotInfobox,
  mapWeaponArchetype,
  parseWeightKg,
  parseFightNarratives,
  determineOutcome,
  guessWeaponFromNarrative,
  type WikiPage,
} from './mediawiki';

export class AbstainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbstainError';
  }
}

function step(onStep: (s: TraceStep) => void, kind: TraceStep['kind'], label: string, detail?: string) {
  onStep({ id: crypto.randomUUID(), kind, label, detail, at: new Date().toISOString() });
}

interface Segment {
  opponent: string;
  season: string;
  segment: string;
}

interface DerivedRow {
  opponent: string;
  season: string;
  outcome: 'win' | 'loss';
  method: 'ko' | 'jd' | 'tapout' | 'unknown';
  opponentWeaponClass: WeaponArchetype;
}

function deriveRows(segments: Segment[], botName: string): DerivedRow[] {
  const rows: DerivedRow[] = [];
  for (const seg of segments) {
    const { outcome, method } = determineOutcome(seg.segment, botName, seg.opponent);
    if (!outcome) continue;
    rows.push({
      opponent: seg.opponent,
      season: seg.season,
      outcome,
      method,
      opponentWeaponClass: guessWeaponFromNarrative(seg.segment),
    });
  }
  return rows;
}

function deriveFailurePattern(rows: DerivedRow[]): string | null {
  const losses = rows.filter((r) => r.outcome === 'loss');
  if (losses.length < 2) return null;
  const counts = new Map<WeaponArchetype, number>();
  for (const r of losses) {
    if (r.opponentWeaponClass === 'other') continue;
    counts.set(r.opponentWeaponClass, (counts.get(r.opponentWeaponClass) ?? 0) + 1);
  }
  let best: [WeaponArchetype, number] | null = null;
  for (const [k, v] of counts) if (!best || v > best[1]) best = [k, v];
  if (!best || best[1] < 2) return null;
  return `${best[1]} of ${losses.length} losses vs ${best[0].replace(/_/g, ' ')}s`;
}

async function resolveFandom(name: string, onStep_: (s: TraceStep) => void): Promise<WikiPage> {
  step(onStep_, 'resolve', `Resolving "${name}" on ${FANDOM.name}`);
  const page = await resolvePage(FANDOM, name, (s) => onStep_(s));
  if (!page) {
    step(onStep_, 'abstain', `Could not resolve "${name}" on ${FANDOM.name} (no direct hit or search match)`);
    throw new AbstainError(`Unable to resolve fighter "${name}" on BattleBots Wiki`);
  }
  return page;
}

/**
 * Resolves a fighter name to a fused profile: BattleBots Wiki is the
 * primary source (dedicated per-robot infoboxes + fight histories),
 * Wikipedia is a best-effort corroboration pass only — most robots don't
 * have a standalone Wikipedia article, so failure there is not fatal.
 */
export async function resolveAndFuse(name: string, onStep: (s: TraceStep) => void): Promise<FighterProfile> {
  const fandomPage = await resolveFandom(name, onStep);
  step(onStep, 'scrape', `Scraped ${FANDOM.name} page "${fandomPage.title}"`, `${fandomPage.wikitext.length} chars from ${fandomPage.url}`);

  const infobox = parseBotInfobox(fandomPage.wikitext);
  const weaponText = infobox.fields['weapons'] ?? infobox.fields['weapon'] ?? infobox.fields['weapon_class'] ?? '';
  const weaponClass = mapWeaponArchetype(weaponText);
  const weightKg = parseWeightKg(infobox.fields['weight']);

  step(onStep, 'crosscheck', `Cross-checking "${fandomPage.title}" on ${WIKIPEDIA.name}`);
  let wikiPage: WikiPage | null = null;
  try {
    wikiPage = await resolvePage(WIKIPEDIA, `${fandomPage.title} (robot)`, (s) => onStep(s));
    if (!wikiPage) wikiPage = await resolvePage(WIKIPEDIA, `${fandomPage.title} (BattleBots)`, (s) => onStep(s));
  } catch {
    wikiPage = null;
  }
  step(
    onStep,
    'crosscheck',
    wikiPage
      ? `Found ${WIKIPEDIA.name} corroboration at "${wikiPage.title}"`
      : `No ${WIKIPEDIA.name} article found for "${fandomPage.title}" (expected — most robots lack one)`,
  );

  const segments = parseFightNarratives(fandomPage.wikitext, fandomPage.title);
  const rows = deriveRows(segments, fandomPage.title);
  const wins = rows.filter((r) => r.outcome === 'win').length;
  const losses = rows.filter((r) => r.outcome === 'loss').length;
  const koWins = rows.filter((r) => r.outcome === 'win' && r.method === 'ko').length;
  const failurePattern = deriveFailurePattern(rows);

  step(
    onStep,
    'fuse',
    `Fused profile for "${fandomPage.title}"`,
    `weapon=${weaponClass} weight=${weightKg ?? 'unknown'}kg record=${wins}-${losses} ko_wins=${koWins}`,
  );

  return {
    name: fandomPage.title,
    weapon_class: weaponClass,
    weight_kg: weightKg,
    wins,
    losses,
    ko_wins: koWins,
    failure_pattern: failurePattern,
    source_urls: [fandomPage.url, ...(wikiPage ? [wikiPage.url] : [])],
  };
}

/**
 * Parses this fighter's fight history into BotRecord rows and upserts them.
 * Re-fetches/re-derives from the same BattleBots Wiki source rather than
 * threading state through from resolveAndFuse, to keep the two entry points
 * independently callable per the DATA agent contract.
 */
export async function fightRecordsFor(
  name: string,
  profile: FighterProfile,
  onStep: (s: TraceStep) => void,
): Promise<BotRecord[]> {
  const fandomPage = await resolveFandom(name, onStep);
  const segments = parseFightNarratives(fandomPage.wikitext, fandomPage.title);
  const derived = deriveRows(segments, fandomPage.title);

  const now = new Date().toISOString();
  const records: BotRecord[] = derived.map((r) => ({
    bot: profile.name,
    weapon_class: profile.weapon_class,
    opponent: r.opponent,
    opponent_weapon_class: r.opponentWeaponClass,
    outcome: r.outcome,
    method: r.method,
    duration_sec: null,
    season: r.season,
    source_url: fandomPage.url,
    fetched_at: now,
  }));

  step(onStep, 'scrape', `Parsed ${records.length} fight rows for "${profile.name}"`, `from ${fandomPage.url}`);
  const n = upsertBotRecords(records);
  step(onStep, 'fuse', `Upserted ${n} new fight rows for "${profile.name}" (${records.length} parsed, rest already known)`);
  return records;
}
