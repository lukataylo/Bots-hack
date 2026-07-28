import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getMatchup, insertBet } from '@/lib/db';
import type { Bet } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BET_POINTS = 100;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { matchupId?: unknown; nickname?: unknown; side?: unknown }
    | null;

  const matchupId = typeof body?.matchupId === 'string' ? body.matchupId : '';
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim().slice(0, 40) : '';
  const side = body?.side === 'A' || body?.side === 'B' ? body.side : null;

  if (!matchupId || !nickname || !side) {
    return NextResponse.json({ error: 'matchupId, nickname and side (A|B) are required' }, { status: 400 });
  }

  const matchup = getMatchup(matchupId);
  if (!matchup) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (matchup.status !== 'open') {
    return NextResponse.json({ reason: 'lines closed' }, { status: 409 });
  }

  const bet: Bet = {
    id: randomUUID(),
    matchupId,
    nickname,
    side,
    points: BET_POINTS,
    createdAt: new Date().toISOString(),
    voided: false,
  };
  insertBet(bet);

  return NextResponse.json({ bet });
}
