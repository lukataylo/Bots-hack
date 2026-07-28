import { NextResponse } from 'next/server';
import { allRecords } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The odds engine fits over whatever the DATA zone has ingested. Empty is a
// valid answer: the bookie then abstains instead of inventing a line.
export async function GET() {
  try {
    return NextResponse.json({ records: allRecords() });
  } catch {
    return NextResponse.json({ records: [] });
  }
}
