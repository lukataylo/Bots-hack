import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  BotRecord, Bet, FighterProfile, Matchup, MatchupOdds, SettlementResult, SimResult,
} from './types';

const DB_PATH = process.env.RINGSIDE_DB ?? path.join(process.cwd(), 'data', 'ringside.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_records (
      bot TEXT NOT NULL,
      weapon_class TEXT NOT NULL,
      opponent TEXT NOT NULL,
      opponent_weapon_class TEXT NOT NULL,
      outcome TEXT NOT NULL,
      method TEXT NOT NULL,
      duration_sec INTEGER,
      season TEXT NOT NULL,
      source_url TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      UNIQUE(bot, opponent, season, outcome, method)
    );
    CREATE TABLE IF NOT EXISTS matchups (
      id TEXT PRIMARY KEY,
      fighter_a TEXT NOT NULL,
      fighter_b TEXT NOT NULL,
      odds TEXT NOT NULL,
      sim TEXT,
      narration TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      hash_sha256 TEXT,
      git_commit_sha TEXT,
      created_at TEXT NOT NULL,
      locked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      matchup_id TEXT NOT NULL REFERENCES matchups(id),
      nickname TEXT NOT NULL,
      side TEXT NOT NULL,
      points INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      voided INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settlements (
      matchup_id TEXT PRIMARY KEY REFERENCES matchups(id),
      actual_winner TEXT NOT NULL,
      method TEXT NOT NULL,
      correct INTEGER NOT NULL,
      settled_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS elo_ledger (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      archetype TEXT NOT NULL,
      rating_before REAL NOT NULL,
      rating_after REAL NOT NULL,
      matchup_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
  `);
  return db;
}

export function upsertBotRecords(rows: BotRecord[]): number {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT OR IGNORE INTO bot_records
    (bot, weapon_class, opponent, opponent_weapon_class, outcome, method, duration_sec, season, source_url, fetched_at)
    VALUES (@bot, @weapon_class, @opponent, @opponent_weapon_class, @outcome, @method, @duration_sec, @season, @source_url, @fetched_at)
  `);
  const tx = d.transaction((rs: BotRecord[]) => {
    let n = 0;
    for (const r of rs) n += stmt.run(r).changes;
    return n;
  });
  return tx(rows);
}

export function recordsForArchetype(archetype: string): BotRecord[] {
  return getDb().prepare('SELECT * FROM bot_records WHERE weapon_class = ?').all(archetype) as BotRecord[];
}

export function allRecords(): BotRecord[] {
  return getDb().prepare('SELECT * FROM bot_records').all() as BotRecord[];
}

function rowToMatchup(row: Record<string, unknown>): Matchup {
  return {
    id: row.id as string,
    fighterA: JSON.parse(row.fighter_a as string) as FighterProfile,
    fighterB: JSON.parse(row.fighter_b as string) as FighterProfile,
    odds: JSON.parse(row.odds as string) as MatchupOdds,
    sim: row.sim ? (JSON.parse(row.sim as string) as SimResult) : null,
    narration: (row.narration as string) ?? null,
    status: row.status as Matchup['status'],
    hashSha256: (row.hash_sha256 as string) ?? null,
    gitCommitSha: (row.git_commit_sha as string) ?? null,
    createdAt: row.created_at as string,
    lockedAt: (row.locked_at as string) ?? null,
  };
}

export function insertMatchup(m: Matchup): void {
  getDb().prepare(`
    INSERT INTO matchups (id, fighter_a, fighter_b, odds, sim, narration, status, hash_sha256, git_commit_sha, created_at, locked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    m.id, JSON.stringify(m.fighterA), JSON.stringify(m.fighterB), JSON.stringify(m.odds),
    m.sim ? JSON.stringify(m.sim) : null, m.narration, m.status, m.hashSha256, m.gitCommitSha,
    m.createdAt, m.lockedAt,
  );
}

export function getMatchup(id: string): Matchup | null {
  const row = getDb().prepare('SELECT * FROM matchups WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToMatchup(row) : null;
}

export function latestMatchup(): Matchup | null {
  const row = getDb().prepare('SELECT * FROM matchups ORDER BY created_at DESC LIMIT 1').get() as Record<string, unknown> | undefined;
  return row ? rowToMatchup(row) : null;
}

export function updateMatchup(id: string, fields: Partial<Pick<Matchup, 'sim' | 'narration' | 'status' | 'hashSha256' | 'gitCommitSha' | 'lockedAt'>>): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.sim !== undefined) { sets.push('sim = ?'); vals.push(fields.sim ? JSON.stringify(fields.sim) : null); }
  if (fields.narration !== undefined) { sets.push('narration = ?'); vals.push(fields.narration); }
  if (fields.status !== undefined) { sets.push('status = ?'); vals.push(fields.status); }
  if (fields.hashSha256 !== undefined) { sets.push('hash_sha256 = ?'); vals.push(fields.hashSha256); }
  if (fields.gitCommitSha !== undefined) { sets.push('git_commit_sha = ?'); vals.push(fields.gitCommitSha); }
  if (fields.lockedAt !== undefined) { sets.push('locked_at = ?'); vals.push(fields.lockedAt); }
  if (!sets.length) return;
  vals.push(id);
  getDb().prepare(`UPDATE matchups SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function insertBet(b: Bet): void {
  getDb().prepare(`
    INSERT INTO bets (id, matchup_id, nickname, side, points, created_at, voided)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(b.id, b.matchupId, b.nickname, b.side, b.points, b.createdAt, b.voided ? 1 : 0);
}

export function listBets(matchupId: string): Bet[] {
  return (getDb().prepare('SELECT * FROM bets WHERE matchup_id = ?').all(matchupId) as Record<string, unknown>[])
    .map((r) => ({
      id: r.id as string,
      matchupId: r.matchup_id as string,
      nickname: r.nickname as string,
      side: r.side as 'A' | 'B',
      points: r.points as number,
      createdAt: r.created_at as string,
      voided: !!r.voided,
    }));
}

export function voidLateBets(matchupId: string, lockedAt: string): number {
  return getDb().prepare('UPDATE bets SET voided = 1 WHERE matchup_id = ? AND created_at > ?').run(matchupId, lockedAt).changes;
}

export function insertSettlement(s: SettlementResult): void {
  getDb().prepare(`
    INSERT INTO settlements (matchup_id, actual_winner, method, correct, settled_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(s.matchupId, s.actualWinner, s.method, s.correct ? 1 : 0, s.settledAt);
}

export function accuracyTally(): { correct: number; total: number } {
  const row = getDb().prepare('SELECT SUM(correct) as c, COUNT(*) as t FROM settlements').get() as { c: number | null; t: number };
  return { correct: row.c ?? 0, total: row.t };
}

export function appendEloLedger(entry: { archetype: string; ratingBefore: number; ratingAfter: number; matchupId: string }): void {
  getDb().prepare(`
    INSERT INTO elo_ledger (archetype, rating_before, rating_after, matchup_id, at)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.archetype, entry.ratingBefore, entry.ratingAfter, entry.matchupId, new Date().toISOString());
}

export function eloLedger(): Array<{ seq: number; archetype: string; rating_before: number; rating_after: number; matchup_id: string; at: string }> {
  return getDb().prepare('SELECT * FROM elo_ledger ORDER BY seq ASC').all() as Array<{ seq: number; archetype: string; rating_before: number; rating_after: number; matchup_id: string; at: string }>;
}
