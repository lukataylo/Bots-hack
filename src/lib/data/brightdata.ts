// Bright Data Web Unlocker wrapper. Every outbound page/API fetch in the DATA
// pipeline routes through here so that pasting BRIGHTDATA_API_TOKEN into
// .env.local instantly turns every call into a real Bright Data call, with
// zero code changes elsewhere.
import type { TraceStep } from '../types';

export type OnStep = (step: TraceStep) => void;

const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const DEFAULT_TIMEOUT_MS = 15_000;

function newStep(kind: TraceStep['kind'], label: string, detail?: string): TraceStep {
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    detail,
    at: new Date().toISOString(),
  };
}

async function directFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RingsideArena/0.1 (hackathon research bot; contact: team@ringside.arena)' },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`direct fetch failed: ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

/**
 * Fetches a URL, transparently routed through Bright Data's Web Unlocker
 * REST API when BRIGHTDATA_API_TOKEN is configured. Falls back to a direct
 * fetch (and emits a TraceStep kind:'error') when it is not, so the pipeline
 * always produces data during development / before the venue token exists.
 */
export async function fetchViaBrightData(url: string, onStep?: OnStep): Promise<string> {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  const zone = process.env.BRIGHTDATA_ZONE;

  if (!token) {
    onStep?.(newStep('error', 'Bright Data token not configured, direct fetch path', url));
    return directFetch(url);
  }

  try {
    const started = Date.now();
    const res = await fetch(BRIGHTDATA_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ zone: zone || 'web_unlocker1', url, format: 'raw' }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Bright Data request failed: ${res.status} ${res.statusText}`);
    }
    const body = await res.text();
    onStep?.(newStep(
      'scrape',
      `Bright Data Web Unlocker hit (zone ${zone || 'web_unlocker1'}, ${((Date.now() - started) / 1000).toFixed(1)}s)`,
      url,
    ));
    return body;
  } catch (err) {
    onStep?.(newStep('error', 'Bright Data request errored, falling back to direct fetch', err instanceof Error ? err.message : String(err)));
    return directFetch(url);
  }
}
