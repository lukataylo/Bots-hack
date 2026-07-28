import { NextResponse } from 'next/server';
import { accuracyTally, getMatchup, listBets } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const matchup = getMatchup(id);
  if (!matchup) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const bets = listBets(id).filter((b) => !b.voided);
  const crowd = {
    A: bets.filter((b) => b.side === 'A').length,
    B: bets.filter((b) => b.side === 'B').length,
  };

  return NextResponse.json({ matchup, crowd, accuracyTally: accuracyTally() });
}
