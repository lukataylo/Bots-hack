import { NextResponse } from 'next/server';
import { accuracyTally, eloLedger } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Small helper endpoint for the big-screen page: the global accuracy ticker and the
// append-only Elo scar ledger table, both independent of any single matchup.
export async function GET() {
  return NextResponse.json({
    accuracyTally: accuracyTally(),
    eloLedger: eloLedger(),
    betOrigin: process.env.BET_ORIGIN || null,
  });
}
