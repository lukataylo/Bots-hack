import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { insertMatchup, updateMatchup } from '@/lib/db';
import type { FighterProfile, Matchup, MatchupOdds, SimResult, TraceStep } from '@/lib/types';
import { createJob, pushStep, finishJob } from '../_lib/trace-store';
import { generateNarration } from '../_lib/narration';

// better-sqlite3 + child_process(git) require Node — never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function step(kind: TraceStep['kind'], label: string, detail?: string): TraceStep {
  return { id: randomUUID(), kind, label, detail, at: new Date().toISOString() };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { fighterA?: unknown; fighterB?: unknown; jobId?: unknown } | null;
  const fighterA = typeof body?.fighterA === 'string' ? body.fighterA.trim() : '';
  const fighterB = typeof body?.fighterB === 'string' ? body.fighterB.trim() : '';
  if (!fighterA || !fighterB) {
    return NextResponse.json({ error: 'fighterA and fighterB are required' }, { status: 400 });
  }

  const jobId = typeof body?.jobId === 'string' && body.jobId.length >= 8 ? body.jobId : randomUUID();
  createJob(jobId);
  const onStep = (s: TraceStep) => pushStep(jobId, s);

  let dataMod: typeof import('@/lib/data/fuse');
  try {
    dataMod = await import('@/lib/data/fuse');
  } catch (e) {
    onStep(step('error', 'data engine unavailable', String(e)));
    finishJob(jobId);
    return NextResponse.json({ error: 'scouting engine unavailable', jobId }, { status: 503 });
  }
  const { resolveAndFuse, fightRecordsFor, AbstainError } = dataMod;

  let profileA: FighterProfile;
  let profileB: FighterProfile;
  try {
    // Both fighters scrape in parallel; fightRecordsFor persists rows to bot_records itself.
    [profileA, profileB] = await Promise.all([
      resolveAndFuse(fighterA, onStep).then(async (p) => { await fightRecordsFor(fighterA, p, onStep); return p; }),
      resolveAndFuse(fighterB, onStep).then(async (p) => { await fightRecordsFor(fighterB, p, onStep); return p; }),
    ]);
  } catch (err) {
    if (err instanceof AbstainError) {
      onStep(step('abstain', err.message));
      finishJob(jobId);
      return NextResponse.json({ error: 'insufficient evidence', reason: err.message, jobId }, { status: 422 });
    }
    onStep(step('error', 'scouting failed', String(err)));
    finishJob(jobId);
    return NextResponse.json({ error: 'scouting failed', jobId }, { status: 500 });
  }

  let computeMatchup: (a: FighterProfile, b: FighterProfile) => MatchupOdds;
  try {
    ({ computeMatchup } = await import('@/core/matchup'));
  } catch (e) {
    onStep(step('error', 'matchup engine unavailable', String(e)));
    finishJob(jobId);
    return NextResponse.json({ error: 'matchup engine unavailable', jobId }, { status: 503 });
  }

  const odds = computeMatchup(profileA, profileB);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const hashSha256 = createHash('sha256')
    .update(`${id}${fighterA}${fighterB}${odds.winProbA}${createdAt}`)
    .digest('hex');

  let gitCommitSha: string | null = null;
  try {
    const cwd = process.cwd();
    execFileSync('git', ['commit', '--allow-empty', '-m', `prediction ${id} ${hashSha256}`], { cwd });
    gitCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd }).toString().trim();
  } catch (e) {
    onStep(step('error', 'pre-commit failed', String(e)));
  }

  const matchup: Matchup = {
    id,
    fighterA: profileA,
    fighterB: profileB,
    odds,
    sim: null,
    narration: null,
    status: 'open',
    hashSha256,
    gitCommitSha,
    createdAt,
    lockedAt: null,
  };
  insertMatchup(matchup);
  onStep(step('fuse', 'line posted', odds.abstain ? 'INSUFFICIENT EVIDENCE' : `${fighterA} ${(odds.winProbA * 100).toFixed(0)}% / ${fighterB} ${(odds.winProbB * 100).toFixed(0)}%`));
  finishJob(jobId);

  // Fire-and-forget: physics sim + marquee render + narration. Never blocks the response.
  void runBackground(id, fighterA, fighterB, profileA, profileB, odds);

  return NextResponse.json({ id, jobId, matchup });
}

async function runBackground(
  matchupId: string,
  nameA: string,
  nameB: string,
  profileA: FighterProfile,
  profileB: FighterProfile,
  odds: MatchupOdds,
): Promise<void> {
  let sim: SimResult | null = null;
  try {
    const { simulate } = await import('@/core/sim/engine');
    sim = await simulate(profileA, profileB, odds, 1000);
    updateMatchup(matchupId, { sim });
  } catch (e) {
    console.error(`[ringside] simulate(${matchupId}) failed:`, e);
  }

  if (sim) {
    try {
      const { recordMarquee } = await import('@/core/sim/marquee');
      await recordMarquee(profileA, profileB, sim.marqueeSeed, matchupId);
    } catch (e) {
      console.error(`[ringside] recordMarquee(${matchupId}) failed:`, e);
    }
  }

  try {
    const narration = await generateNarration(nameA, nameB, odds, sim);
    updateMatchup(matchupId, { narration });
  } catch (e) {
    console.error(`[ringside] narration(${matchupId}) failed:`, e);
    updateMatchup(matchupId, { narration: null });
  }
}
