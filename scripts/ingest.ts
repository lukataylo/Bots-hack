#!/usr/bin/env -S bunx tsx
// bunx tsx scripts/ingest.ts <bot name> [<bot name> ...]
//
// Idempotent (db.upsertBotRecords is INSERT OR IGNORE under the hood).
//
// Runtime note: run this with `bunx tsx`, not `bun scripts/ingest.ts`.
// src/lib/db.ts uses better-sqlite3 (a native addon), which Bun's own JS
// runtime does not support (oven-sh/bun#4290) even though `bun` is the
// package manager for this repo. tsx runs on real Node under the hood
// (`#!/usr/bin/env node`), where the native addon loads fine.
import { resolveAndFuse, fightRecordsFor, AbstainError } from '../src/lib/data/fuse';
import type { TraceStep } from '../src/lib/types';

async function main() {
  const names = process.argv.slice(2);
  if (!names.length) {
    console.error('Usage: bunx tsx scripts/ingest.ts <bot name> [<bot name> ...]');
    process.exit(1);
  }

  const summary: Record<string, { ok: boolean; wins?: number; losses?: number; rows?: number; error?: string }> = {};

  for (const name of names) {
    console.log(`\n=== ${name} ===`);
    const onStep = (s: TraceStep) => {
      console.log(`  [${s.kind}] ${s.label}${s.detail ? ` (${s.detail})` : ''}`);
    };
    try {
      const profile = await resolveAndFuse(name, onStep);
      const rows = await fightRecordsFor(name, profile, onStep);
      summary[name] = { ok: true, wins: profile.wins, losses: profile.losses, rows: rows.length };
      console.log(`  -> resolved "${name}" as "${profile.name}" [${profile.weapon_class}] ${profile.wins}-${profile.losses}, ${rows.length} fight rows`);
    } catch (err) {
      const msg = err instanceof AbstainError ? err.message : err instanceof Error ? err.message : String(err);
      summary[name] = { ok: false, error: msg };
      console.log(`  -> FAILED: ${msg}`);
    }
  }

  console.log('\n=== INGEST SUMMARY ===');
  let resolved = 0;
  for (const [name, r] of Object.entries(summary)) {
    if (r.ok) resolved++;
    console.log(r.ok ? `${name}: OK record=${r.wins}-${r.losses} rows=${r.rows}` : `${name}: FAIL (${r.error})`);
  }
  console.log(`\nResolved ${resolved}/${names.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
