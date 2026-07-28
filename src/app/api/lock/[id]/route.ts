import { NextResponse } from 'next/server';
import { getMatchup, updateMatchup, voidLateBets } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const matchup = getMatchup(id);
  if (!matchup) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (matchup.status !== 'open') {
    return NextResponse.json({ error: 'lines already closed' }, { status: 409 });
  }

  const lockedAt = new Date().toISOString();
  updateMatchup(id, { status: 'locked', lockedAt });
  const voided = voidLateBets(id, lockedAt);

  return NextResponse.json({ ok: true, lockedAt, voided });
}
