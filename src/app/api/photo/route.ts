import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = new Set(['static.wikia.nocookie.net']);
const cache = new Map<string, Buffer>();

// Serves a wiki bot photo with the near-white studio background keyed to alpha,
// so real photos sit on the dark plates like cutouts instead of white cards.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  if (!u) return NextResponse.json({ error: 'u required' }, { status: 400 });
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return NextResponse.json({ error: 'bad url' }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 400 });
  }

  const hit = cache.get(u);
  if (hit) {
    return new NextResponse(new Uint8Array(hit), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return NextResponse.json({ error: `fetch ${res.status}` }, { status: 502 });
    const buf = Buffer.from(await res.arrayBuffer());

    const img = sharp(buf).resize(560, 560, { fit: 'inside', withoutEnlargement: true });
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);
      // near-white and near-neutral -> background
      if (min > 216 && max - min < 18) {
        px[i + 3] = 0;
      } else if (min > 196 && max - min < 14) {
        px[i + 3] = Math.round(((216 - min) / 20) * 255); // soft edge
      }
    }
    const out = await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
    cache.set(u, out);
    return new NextResponse(new Uint8Array(out), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
