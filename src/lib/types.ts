// Shared contracts for RINGSIDE ARENA. Every agent zone imports from here; do not fork these shapes.

export type WeaponArchetype =
  | 'horizontal_spinner'
  | 'vertical_spinner'
  | 'drum'
  | 'flipper'
  | 'hammer'
  | 'crusher'
  | 'lifter'
  | 'wedge'
  | 'multibot'
  | 'other';

export interface BotRecord {
  bot: string;
  weapon_class: WeaponArchetype;
  opponent: string;
  opponent_weapon_class: WeaponArchetype;
  outcome: 'win' | 'loss';
  method: 'ko' | 'jd' | 'tapout' | 'unknown';
  duration_sec: number | null;
  season: string;
  source_url: string;
  fetched_at: string;
}

export interface FighterProfile {
  name: string;
  weapon_class: WeaponArchetype;
  weight_kg: number | null;
  wins: number;
  losses: number;
  ko_wins: number;
  failure_pattern: string | null;
  source_urls: string[];
}

export interface TraceStep {
  id: string;
  kind: 'resolve' | 'scrape' | 'crosscheck' | 'fuse' | 'abstain' | 'error';
  label: string;
  detail?: string;
  at: string;
}

export interface MatchupOdds {
  winProbA: number;
  winProbB: number;
  confidenceInterval: [number, number];
  sampleCountA: number;
  sampleCountB: number;
  weighting: string;
  arithmeticTrace: string[];
  abstain: boolean;
  abstainReason?: string;
}

export interface SimResult {
  runs: number;
  winShareA: number;
  winShareB: number;
  modalOutcome: 'A_ko' | 'B_ko' | 'A_jd' | 'B_jd';
  marqueeSeed: number;
  medianDurationSec: number;
}

export interface Matchup {
  id: string;
  fighterA: FighterProfile;
  fighterB: FighterProfile;
  odds: MatchupOdds;
  sim: SimResult | null;
  narration: string | null;
  status: 'open' | 'locked' | 'settled' | 'void';
  hashSha256: string | null;
  gitCommitSha: string | null;
  createdAt: string;
  lockedAt: string | null;
}

export interface Bet {
  id: string;
  matchupId: string;
  nickname: string;
  side: 'A' | 'B';
  points: number;
  createdAt: string;
  voided: boolean;
}

export interface SettlementResult {
  matchupId: string;
  actualWinner: 'A' | 'B';
  method: 'live-scrape' | 'operator-confirmed';
  correct: boolean;
  settledAt: string;
}

// Zone map (who owns what — keep disjoint):
//   src/lib/data/*      DATA agent: MediaWiki + Bright Data scrape/fuse, SQLite schema, ingest
//   src/core/*          ENGINE agent: elo.ts (voice-mog lift), sim/ (rapier headless Monte Carlo)
//   src/app/*           APP agent: pages + API routes + bet/lock/settle state machine
//   src/three/*         ARENA agent: R3F bot assembly + marquee fight renderer
