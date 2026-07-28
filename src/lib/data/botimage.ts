// Real-bot appearance: scrape the wiki's lead photo for a robot and extract its dominant
// colors, so the 3D rig fights in the real bot's livery. Fail-soft everywhere: a missing
// photo or decode error returns nulls and the rig falls back to team colors.
import sharp from 'sharp';
import type { TraceStep } from '../types';
import type { OnStep } from './brightdata';

const FANDOM_API = 'https://battlebots.fandom.com/api.php';
const TIMEOUT_MS = 10_000;

function step(kind: TraceStep['kind'], label: string, detail?: string): TraceStep {
  return { id: crypto.randomUUID(), kind, label, detail, at: new Date().toISOString() };
}

/** Resolve the page's lead image URL via the PageImages extension. */
export async function fetchBotImageUrl(title: string, onStep?: OnStep): Promise<string | null> {
  try {
    const u = `${FANDOM_API}?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original&format=json&formatversion=2&redirects=1`;
    const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json() as { query?: { pages?: Array<{ original?: { source?: string } }> } };
    const src = data.query?.pages?.[0]?.original?.source ?? null;
    if (src) onStep?.(step('scrape', `Scraped real photo of "${title}"`, src));
    return src;
  } catch {
    return null;
  }
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r / 255) h = ((g - b) / 255 / d) % 6;
    else if (max === g / 255) h = (b - r) / 255 / d + 2;
    else h = (r - g) / 255 / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Dominant saturated colors from the photo: bucket saturated pixels by hue, take the two
 * biggest distinct buckets. Grays/whites/blacks are ignored (every robot has steel).
 */
export async function extractPalette(imageUrl: string): Promise<{ primary: string; accent: string } | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const raw = await sharp(buf).resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        const i = (y * 48 + x) * 3;
        const r = raw[i]; const g = raw[i + 1]; const b = raw[i + 2];
        const [h, s, v] = rgbToHsv(r, g, b);
        if (s < 0.35 || v < 0.18 || v > 0.97) continue; // skip steel, shadow, background
        const bucket = Math.floor(h / 30);
        const cur = buckets.get(bucket) ?? { r: 0, g: 0, b: 0, n: 0 };
        cur.r += r; cur.g += g; cur.b += b; cur.n += 1;
        buckets.set(bucket, cur);
      }
    }
    const ranked = [...buckets.entries()].sort((a, b) => b[1].n - a[1].n);
    if (!ranked.length || ranked[0][1].n < 12) return null; // photo has no meaningful color
    const p = ranked[0][1];
    const primary = hex(p.r / p.n, p.g / p.n, p.b / p.n);
    const second = ranked.find(([k]) => Math.abs(k - ranked[0][0]) >= 2)?.[1] ?? p;
    const accent = hex(second.r / second.n, second.g / second.n, second.b / second.n);
    return { primary, accent };
  } catch {
    return null;
  }
}

export async function fetchBotAppearance(
  title: string,
  onStep?: OnStep,
): Promise<{ photo_url: string | null; palette: { primary: string; accent: string } | null }> {
  const photo_url = await fetchBotImageUrl(title, onStep);
  if (!photo_url) return { photo_url: null, palette: null };
  const palette = await extractPalette(photo_url);
  if (palette) {
    onStep?.(step('fuse', `Extracted real livery for "${title}"`, `${palette.primary} / ${palette.accent}`));
  }
  return { photo_url, palette };
}
