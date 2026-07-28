// Defensive MediaWiki clients for en.wikipedia.org and battlebots.fandom.com.
// Both are confirmed-live standard MediaWiki installs (api.php). All network
// access goes through fetchViaBrightData so the Bright Data path lights up
// the instant a token is configured.
import { fetchViaBrightData, type OnStep } from './brightdata';
import type { WeaponArchetype } from '../types';

export interface WikiSite {
  name: string;
  apiUrl: string;
  wikiBase: string;
}

export const FANDOM: WikiSite = {
  name: 'BattleBots Wiki',
  apiUrl: 'https://battlebots.fandom.com/api.php',
  wikiBase: 'https://battlebots.fandom.com/wiki/',
};

export const WIKIPEDIA: WikiSite = {
  name: 'Wikipedia',
  apiUrl: 'https://en.wikipedia.org/w/api.php',
  wikiBase: 'https://en.wikipedia.org/wiki/',
};

export interface SearchHit {
  title: string;
  pageid: number;
}

export interface WikiPage {
  title: string;
  wikitext: string;
  url: string;
}

function apiUrl(site: WikiSite, params: Record<string, string>): string {
  const usp = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return `${site.apiUrl}?${usp.toString()}`;
}

/** action=query&list=search — used when there is no direct title hit. */
export async function search(site: WikiSite, query: string, limit = 5, onStep?: OnStep): Promise<SearchHit[]> {
  try {
    const url = apiUrl(site, { action: 'query', list: 'search', srsearch: query, srlimit: String(limit) });
    const body = await fetchViaBrightData(url, onStep);
    const json = JSON.parse(body);
    const hits = json?.query?.search;
    if (!Array.isArray(hits)) return [];
    return hits.map((h: { title: string; pageid: number }) => ({ title: h.title, pageid: h.pageid }));
  } catch {
    return [];
  }
}

/**
 * Fetches a page's raw wikitext via action=parse, following server-side
 * redirects. Returns null (never throws) if the title genuinely doesn't
 * exist so callers can fall back to search.
 */
export async function getWikitext(site: WikiSite, title: string, onStep?: OnStep): Promise<WikiPage | null> {
  try {
    const url = apiUrl(site, { action: 'parse', page: title, prop: 'wikitext', redirects: '1' });
    const body = await fetchViaBrightData(url, onStep);
    const json = JSON.parse(body);
    if (json?.error || !json?.parse?.wikitext) return null;
    const resolvedTitle: string = json.parse.title ?? title;
    return {
      title: resolvedTitle,
      wikitext: json.parse.wikitext as string,
      url: `${site.wikiBase}${encodeURIComponent(resolvedTitle.replace(/ /g, '_'))}`,
    };
  } catch {
    return null;
  }
}

/** Resolve a bot name to a page: try the exact title first, then fall back to search. */
export async function resolvePage(site: WikiSite, name: string, onStep?: OnStep): Promise<WikiPage | null> {
  const direct = await getWikitext(site, name, onStep);
  if (direct) return direct;
  const hits = await search(site, name, 5, onStep);
  for (const hit of hits) {
    const page = await getWikitext(site, hit.title, onStep);
    if (page) return page;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Defensive infobox parsing ({{Bot ... }} template on battlebots.fandom.com,
// or {{Infobox ...}} elsewhere). Fandom infoboxes are wildly inconsistent —
// field presence, key naming, and even the template name vary — so every
// step here returns null/'other' rather than throwing.
// ---------------------------------------------------------------------------

/** Finds the full `{{Name ... }}` template block via brace-depth counting. */
function extractTemplate(wikitext: string, nameRe: RegExp): string | null {
  const m = nameRe.exec(wikitext);
  if (!m) return null;
  const start = m.index;
  let i = start;
  let depth = 0;
  while (i < wikitext.length) {
    if (wikitext.startsWith('{{', i)) {
      depth++;
      i += 2;
      continue;
    }
    if (wikitext.startsWith('}}', i)) {
      depth--;
      i += 2;
      if (depth === 0) return wikitext.slice(start, i);
      continue;
    }
    i++;
  }
  return null;
}

/** Splits a template body into top-level `key=value` fields, respecting nested [[ ]] / {{ }}. */
function splitTemplateFields(template: string): Record<string, string> {
  const withoutGalleries = template.replace(/<gallery[\s\S]*?<\/gallery>/gi, '');
  const body = withoutGalleries.replace(/^\{\{\s*[^|}\n]*/, '').replace(/\}\}\s*$/, '');
  const fields: string[] = [];
  let depth = 0;
  let cur = '';
  for (let k = 0; k < body.length; k++) {
    const two = body.slice(k, k + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      cur += two;
      k++;
      continue;
    }
    if (two === '}}' || two === ']]') {
      depth = Math.max(0, depth - 1);
      cur += two;
      k++;
      continue;
    }
    if (body[k] === '|' && depth === 0) {
      fields.push(cur);
      cur = '';
      continue;
    }
    cur += body[k];
  }
  if (cur.trim()) fields.push(cur);

  const map: Record<string, string> = {};
  for (const f of fields) {
    const eq = f.indexOf('=');
    if (eq === -1) continue;
    const key = f.slice(0, eq).trim().toLowerCase();
    const val = f.slice(eq + 1).trim();
    if (key) map[key] = val;
  }
  return map;
}

export interface ParsedInfobox {
  fields: Record<string, string>;
}

/** Best-effort parse of the BattleBots Wiki `{{Bot ...}}` infobox. Returns {} if none found. */
export function parseBotInfobox(wikitext: string): ParsedInfobox {
  const template = extractTemplate(wikitext, /\{\{\s*(Bot|Infobox\s*[A-Za-z]*)\b/i);
  if (!template) return { fields: {} };
  return { fields: splitTemplateFields(template) };
}

const WEAPON_KEYWORDS: Array<[RegExp, WeaponArchetype]> = [
  [/multibot|multiple\s+robots|two[- ]robot/i, 'multibot'],
  [/\bflipp?(er|ing)?\b|pneumatic.{0,15}(lift|flip)|full[- ]body flipper/i, 'flipper'],
  [/\bhammer\b|\baxe\b|thwack/i, 'hammer'],
  [/\bcrush(er)?\b|\bclamp\b|\bpincer\b|\bjaw/i, 'crusher'],
  [/\blift(er)?\b|fork[- ]?lift|\bscoop\b/i, 'lifter'],
  [/\bwedge\b/i, 'wedge'],
  [/\bdrum\b/i, 'drum'],
  [/vertical.{0,15}(spinner|disc|blade)|vertical\s+spinner/i, 'vertical_spinner'],
  [/horizontal.{0,15}(spinner|bar|blade|disc)/i, 'horizontal_spinner'],
  [/spinner|bar\s?spinner|blade|disc\b|saw\b/i, 'horizontal_spinner'],
];

export function mapWeaponArchetype(text: string | undefined | null): WeaponArchetype {
  if (!text) return 'other';
  for (const [re, cls] of WEAPON_KEYWORDS) {
    if (re.test(text)) return cls;
  }
  return 'other';
}

/** Extracts the first plausible weight in lbs from an infobox `weight=` field and converts to kg. */
export function parseWeightKg(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = /(\d{2,4})\s*(?:lbs?|pounds?)/i.exec(text);
  if (!m) return null;
  const lbs = Number(m[1]);
  if (!Number.isFinite(lbs) || lbs <= 0) return null;
  return Math.round(lbs * 0.45359237 * 10) / 10;
}

// ---------------------------------------------------------------------------
// Fight narrative parsing. BattleBots Wiki bot pages don't use a clean
// tabular win/loss format — they use a wikitable wrapper containing prose
// paragraphs per matchup, headed by `'''Bot vs. Opponent'''` and grouped
// under `===Season Name===` headings. We parse those narrative segments with
// keyword heuristics rather than requiring a strict grammar.
// ---------------------------------------------------------------------------

export interface FightNarrative {
  opponent: string;
  season: string;
  segment: string;
}

function stripWikiMarkup(s: string): string {
  return s.replace(/'''/g, '').replace(/\[\[([^|\]]*\|)?([^\]]+)\]\]/g, '$2').trim();
}

export function parseFightNarratives(wikitext: string, botTitle: string): FightNarrative[] {
  const headingRe = /={2,4}\s*'''?([^=\n]{3,80}?)'''?\s*={2,4}/g;
  const vsRe = /'''\s*([^'\n<{}[\]]{2,60}?)\s+[Vv][Ss]\.?\s+([^'\n<{}[\]]{2,60}?)\s*'''/g;

  type Token =
    | { index: number; end: number; type: 'heading'; season: string }
    | { index: number; end: number; type: 'vs'; a: string; b: string };

  const tokens: Token[] = [];
  for (const m of wikitext.matchAll(headingRe)) {
    tokens.push({ index: m.index!, end: m.index! + m[0].length, type: 'heading', season: stripWikiMarkup(m[1]) });
  }
  for (const m of wikitext.matchAll(vsRe)) {
    tokens.push({ index: m.index!, end: m.index! + m[0].length, type: 'vs', a: stripWikiMarkup(m[1]), b: stripWikiMarkup(m[2]) });
  }
  tokens.sort((x, y) => x.index - y.index);

  const botLower = botTitle.toLowerCase();
  const out: FightNarrative[] = [];
  let currentSeason = 'Unknown Season';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading') {
      currentSeason = t.season;
      continue;
    }
    const segStart = t.end;
    const segEnd = i + 1 < tokens.length ? tokens[i + 1].index : wikitext.length;
    const segment = wikitext.slice(segStart, Math.min(segEnd, segStart + 4000));
    const isBotA = t.a.toLowerCase() === botLower || botLower.includes(t.a.toLowerCase());
    const opponent = isBotA ? t.b : t.a;
    if (!opponent) continue;
    out.push({ opponent, season: currentSeason, segment });
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type FightMethod = 'ko' | 'jd' | 'tapout' | 'unknown';

export function determineOutcome(
  segment: string,
  botName: string,
  opponentName: string,
): { outcome: 'win' | 'loss' | null; method: FightMethod } {
  const method: FightMethod = /knock[- ]?out|\bKO'?d?\b|\bkos\b/i.test(segment)
    ? 'ko'
    : /judges['’]?\s+decision|by\s+decision/i.test(segment)
      ? 'jd'
      : /tap(?:ped|s)?\s+out|tap-out/i.test(segment)
        ? 'tapout'
        : 'unknown';

  const botEsc = escapeRe(botName);
  const oppEsc = escapeRe(opponentName);
  const winVerbs = 'won|wins|advances?|advanced|defeats?|defeated|knocks out|knocked out';
  const lossVerbs = 'lost|loses|eliminated|is eliminated|was defeated|was eliminated';

  const botWinRe = new RegExp(`\\b${botEsc}\\b[^.]{0,100}\\b(${winVerbs})\\b`, 'i');
  const botLossRe = new RegExp(`\\b${botEsc}\\b[^.]{0,100}\\b(${lossVerbs})\\b`, 'i');
  const oppWinRe = new RegExp(`\\b${oppEsc}\\b[^.]{0,100}\\b(${winVerbs})\\b`, 'i');
  const oppLossRe = new RegExp(`\\b${oppEsc}\\b[^.]{0,100}\\b(${lossVerbs})\\b`, 'i');

  if (botWinRe.test(segment) || oppLossRe.test(segment)) return { outcome: 'win', method };
  if (botLossRe.test(segment) || oppWinRe.test(segment)) return { outcome: 'loss', method };
  return { outcome: null, method };
}

/** Best-effort guess at an opponent's weapon archetype purely from the fight prose (no extra fetch). */
export function guessWeaponFromNarrative(segment: string): WeaponArchetype {
  return mapWeaponArchetype(segment);
}
