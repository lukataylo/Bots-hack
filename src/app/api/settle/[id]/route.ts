import { NextResponse } from 'next/server';
import { getMatchup, insertSettlement, updateMatchup } from '@/lib/db';
import { recordArchetypeResult } from '@/core/elo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { actualWinner?: unknown; method?: unknown }
    | null;

  const actualWinner = body?.actualWinner === 'A' || body?.actualWinner === 'B' ? body.actualWinner : null;
  const method = body?.method === 'live-scrape' || body?.method === 'operator-confirmed' ? body.method : null;

  if (!actualWinner || !method) {
    return NextResponse.json({ error: 'actualWinner (A|B) and method are required' }, { status: 400 });
  }

  const matchup = getMatchup(id);
  if (!matchup) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (matchup.status !== 'locked') {
    return NextResponse.json({ error: 'matchup must be locked before settlement' }, { status: 409 });
  }
  if (!matchup.gitCommitSha) {
    return NextResponse.json({ error: 'no pre-commit hash recorded for this matchup' }, { status: 409 });
  }

  const predictedFavourite = matchup.odds.winProbA >= matchup.odds.winProbB ? 'A' : 'B';
  const correct = predictedFavourite === actualWinner;
  const settledAt = new Date().toISOString();

  insertSettlement({ matchupId: id, actualWinner, method, correct, settledAt });
  updateMatchup(id, { status: 'settled' });

  const outcomeA = actualWinner === 'A' ? 1 : 0;
  const eloUpdate = recordArchetypeResult(
    matchup.fighterA.weapon_class,
    matchup.fighterB.weapon_class,
    outcomeA,
    id,
  );

  return NextResponse.json({ ok: true, correct, predictedFavourite, eloUpdate, settledAt });
}
