import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Serves data/marquee-<id>.json written by src/core/sim/marquee.ts. 404 until the
// fire-and-forget sim has finished rendering the marquee script for this matchup.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const file = path.join(process.cwd(), 'data', `marquee-${id}.json`);
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: 'not ready' }, { status: 404 });
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return new Response(raw, { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return NextResponse.json({ error: 'not ready' }, { status: 404 });
  }
}
