"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import CountUp from "react-countup";
import type { FighterProfile, Matchup, SettlementResult, TraceStep } from "@/lib/types";
import type { MarqueeScript } from "@/three/types";

// Real footage keyed by fighter pair (order-insensitive). Falls back to null (no embed).
const FOOTAGE: Record<string, string> = {
  "ripperoni|tombstone": "cRyghAsC_3Y",
  "mad catter|tombstone": "_GPZAhE0rLM",
  "end game|ripperoni": "Iaii-XUxqqU",
  "black dragon|ripperoni": "3JCKZpFO9zY",
};
function footageFor(m: { fighterA: { name: string }; fighterB: { name: string } }): string | null {
  const key = [m.fighterA.name.toLowerCase(), m.fighterB.name.toLowerCase()].sort().join("|");
  return FOOTAGE[key] ?? null;
}

const photoSrc = (url: string | null | undefined, fallback: string) => url ? `/api/photo?u=${encodeURIComponent(url)}` : fallback;

const LukaFight = dynamic(() => import("./LukaFight"), { ssr: false });
const RevealBot = dynamic(() => import("./RevealBot"), { ssr: false });
const BotAssembly = dynamic(() => import("@/three").then((m) => m.BotAssembly), { ssr: false });
const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), { ssr: false });

const KIND_CLASS: Record<TraceStep["kind"], string> = {
  resolve: "k-resolve",
  scrape: "k-scrape",
  crosscheck: "k-crosscheck",
  fuse: "k-fuse",
  abstain: "k-abstain",
  error: "k-error",
};

function traceTime(at: string): string {
  try {
    return new Date(at).toLocaleTimeString([], { hour12: false });
  } catch {
    return "";
  }
}

const STAGES = ["input", "scrape", "fight", "bet", "grade"] as const;
export type ShowStage = (typeof STAGES)[number];

interface EloLedgerRow {
  seq: number;
  archetype: string;
  rating_before: number;
  rating_after: number;
  matchup_id: string;
  at: string;
}

export interface ShowModeProps {
  onExit: () => void;

  fighterAName: string;
  fighterBName: string;
  setFighterAName: (v: string) => void;
  setFighterBName: (v: string) => void;
  busy: boolean;
  scoutError: string | null;
  handleGo: () => void;

  jobId: string | null;
  trace: TraceStep[];

  matchup: Matchup | null;
  crowd: { A: number; B: number };
  marqueeScript: MarqueeScript | null;
  betUrl: string;

  handleLock: () => void;
  operatorMsg: string | null;
  lastSettlement: SettlementResult | null;

  accuracy: { correct: number; total: number };
  ledger: EloLedgerRow[];
}

function placeholderProfile(name: string): FighterProfile {
  return {
    name: name || "UNNAMED",
    weapon_class: "other",
    weight_kg: null,
    wins: 0,
    losses: 0,
    ko_wins: 0,
    failure_pattern: null,
    source_urls: [],
  };
}

function computeMaxIndex(props: ShowModeProps, marqueePlayed: boolean): number {
  const { busy, jobId, trace, matchup, lastSettlement } = props;
  let idx = 0;
  if (busy || (jobId && trace.length > 0)) idx = Math.max(idx, 1);
  if (matchup) idx = Math.max(idx, 2);
  if (matchup && (matchup.status === "locked" || matchup.status === "settled" || marqueePlayed)) {
    idx = Math.max(idx, 3);
  }
  if (matchup?.status === "settled" && lastSettlement) idx = Math.max(idx, 4);
  return idx;
}

export default function ShowMode(props: ShowModeProps) {
  const {
    onExit,
    fighterAName,
    fighterBName,
    setFighterAName,
    setFighterBName,
    busy,
    scoutError,
    handleGo,
    trace,
    matchup,
    crowd,
    marqueeScript,
    betUrl,
    handleLock,
    operatorMsg,
    lastSettlement,
    accuracy,
    ledger,
  } = props;

  const [marqueePlayed, setMarqueePlayed] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const traceLogRef = useRef<HTMLDivElement | null>(null);

  const maxIndex = useMemo(() => computeMaxIndex(props, marqueePlayed), [props, marqueePlayed]);

  // Auto-advance whenever the pipeline reaches a new milestone. A manual arrow-key
  // move sticks until the next real milestone change (maxIndex value changes).
  useEffect(() => {
    setStageIndex(maxIndex);
  }, [maxIndex]);

  // Reset the "marquee has played" flag whenever a fresh script arrives, then flip it
  // after the script's own duration so fight -> bet can auto-advance.
  useEffect(() => {
    setMarqueePlayed(false);
    if (!marqueeScript) return;
    const t = setTimeout(() => setMarqueePlayed(true), Math.max(1500, marqueeScript.durationSec * 1000));
    return () => clearTimeout(t);
  }, [marqueeScript]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExit();
        return;
      }
      if (e.key === "ArrowRight") {
        setStageIndex((i) => Math.min(STAGES.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setStageIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  useEffect(() => {
    traceLogRef.current?.scrollTo({ top: traceLogRef.current.scrollHeight });
  }, [trace]);

  const stage: ShowStage = STAGES[stageIndex];
  const odds = matchup?.odds ?? null;
  const totalVotes = crowd.A + crowd.B;
  const pctA = totalVotes ? Math.round((crowd.A / totalVotes) * 100) : 50;
  const pctB = 100 - pctA;
  const linesClosed = matchup?.status === "locked" || matchup?.status === "settled";

  return (
    <div className="show-stage">
      <div className="show-topbar">
        <span className="show-brand">
          <img src="/assets/logo.png" alt="Ringside Arena" className="show-brand-logo" />
        </span>
        <div className="show-dots">
          {STAGES.map((s, i) => (
            <span key={s} className={`show-dot ${i === stageIndex ? "show-dot-active" : ""}`} />
          ))}
        </div>
        <button className="btn show-exit-btn" onClick={onExit}>
          EXIT SHOW
        </button>
      </div>

      {stage === "input" && (
        <div className="show-scene show-fade">
          <div className="show-kicker">SCOUT THE MATCHUP</div>
          <div className="show-entry-row">
            <input
              className="show-input show-input-a display"
              placeholder="FIGHTER A"
              value={fighterAName}
              onChange={(e) => setFighterAName(e.target.value)}
              disabled={busy}
            />
            <img src="/assets/vs-badge.png" alt="VS" className="show-vs-badge" />
            <input
              className="show-input show-input-b display"
              placeholder="FIGHTER B"
              value={fighterBName}
              onChange={(e) => setFighterBName(e.target.value)}
              disabled={busy}
            />
          </div>
          <button className="plate plate-gold-solid display show-go-btn" onClick={handleGo} disabled={busy}>
            {busy ? "SCOUTING..." : "RUN MATCHUP"}
          </button>
          {scoutError && <p className="show-error mono">{scoutError}</p>}
        </div>
      )}

      {stage === "scrape" && (
        <div className="show-scene show-fade">
          <div className="show-kicker">THE SCRAPE BECOMES A BODY</div>
          <div className="show-rig-row">
            <div className="show-rig-cell">
              <div className="plate plate-blue show-rig-canvas">
                <RevealBot profile={matchup?.fighterA ?? placeholderProfile(fighterAName)} accent="#3D7BFF" />
              </div>
              {matchup?.fighterA.photo_url && (
                <img className="show-rig-photo" src={photoSrc(matchup.fighterA.photo_url, "/assets/bot-blue.png")} alt="" />
              )}
              <div className="show-rig-name display side-a-text">{fighterAName || "FIGHTER A"}</div>
            </div>
            <div className="show-rig-cell">
              <div className="plate plate-purple show-rig-canvas">
                <RevealBot profile={matchup?.fighterB ?? placeholderProfile(fighterBName)} accent="#9B4DFF" />
              </div>
              {matchup?.fighterB.photo_url && (
                <img className="show-rig-photo" src={photoSrc(matchup.fighterB.photo_url, "/assets/bot-purple.png")} alt="" />
              )}
              <div className="show-rig-name display side-b-text">{fighterBName || "FIGHTER B"}</div>
            </div>
          </div>
          <div className="show-trace-log mono" ref={traceLogRef}>
            {trace.length === 0 && <span style={{ color: "var(--text-dim)" }}>Awaiting scouting run...</span>}
            {trace.map((t) => (
              <div key={t.id} className="show-trace-line">
                {t.at && <span className="trace-time mono">{traceTime(t.at)}</span>}
                <span className={`trace-kind ${KIND_CLASS[t.kind]}`}>{t.kind}</span>
                <span>
                  {t.label}
                  {t.detail ? <span style={{ color: "var(--text-dim)" }}> : {t.detail}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === "fight" && matchup && (
        <div className="show-scene show-fade">
          <div className="show-kicker">PHYSICS FIGHTS THE FIGHT BEFORE REALITY DOES</div>
          <div className="show-marquee-wrap">
            <LukaFight matchup={matchup} />
          </div>
          {odds && !odds.abstain && (
            <div className="show-odds-row">
              <div className="show-odds-side">
                <img
                  src={photoSrc(matchup.fighterA.photo_url, "/assets/bot-blue.png")}
                  alt=""
                  className="show-fighter-photo"
                />
                <div className="show-odds-name display side-a-text">{matchup.fighterA.name}</div>
                <div className="show-odds-pct num side-a-text">{(odds.winProbA * 100).toFixed(1)}%</div>
              </div>
              <div className="show-odds-arith mono">
                {odds.arithmeticTrace.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div style={{ marginTop: 4 }}>
                  95% CI [{odds.confidenceInterval[0].toFixed(2)}, {odds.confidenceInterval[1].toFixed(2)}]
                </div>
              </div>
              <div className="show-odds-side">
                <img
                  src={photoSrc(matchup.fighterB.photo_url, "/assets/bot-purple.png")}
                  alt=""
                  className="show-fighter-photo"
                />
                <div className="show-odds-name display side-b-text">{matchup.fighterB.name}</div>
                <div className="show-odds-pct num side-b-text">{(odds.winProbB * 100).toFixed(1)}%</div>
              </div>
            </div>
          )}
          {odds && odds.abstain && (
            <div className="plate plate-gold-solid abstain-plate show-abstain">
              <img src="/assets/icon-gold.png" alt="" className="abstain-icon" />
              <div>
                <div className="abstain-title display">Insufficient evidence</div>
                <div className="abstain-sub">no line posted</div>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "bet" && matchup && (
        <div className="show-scene show-fade">
          <div className="show-kicker">THE ROOM BETS</div>
          {!linesClosed ? (
            <>
              <div className="plate plate-gold-solid show-qr-wrap">
                <div className="show-qr-wrap"><QRCodeSVG value={betUrl || "https://ringside.arena"} size={360} className="show-qr" fgColor="#120b22" bgColor="#F5B426" /></div>
              </div>
              <div className="show-crowd-bar">
                <div className="show-crowd-a" style={{ width: `${pctA}%` }} />
                <div className="show-crowd-b" style={{ width: `${pctB}%` }} />
              </div>
              <div className="show-crowd-labels mono">
                <span className="side-a-text">{matchup.fighterA.name} {pctA}%</span>
                <span className="side-b-text">{pctB}% {matchup.fighterB.name}</span>
              </div>
              <button className="plate plate-red-solid display show-lock-btn" onClick={handleLock}>
                LOCK LINES
              </button>
              {operatorMsg && <p className="show-error mono">{operatorMsg}</p>}
            </>
          ) : (
            <div className="show-lines-closed">LINES CLOSED</div>
          )}
        </div>
      )}

      {stage === "grade" && matchup && (
        <div className="show-scene show-fade">
          <div className="show-kicker">REALITY GRADES THE MACHINE</div>
          {footageFor(matchup) && (
            <div className="show-footage">
              <iframe
                src={`https://www.youtube.com/embed/${footageFor(matchup)}`}
                title="Real fight footage"
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
              <div className="show-footage-label mono">THE REAL FOOTAGE</div>
            </div>
          )}
          {lastSettlement && (
            <div className={`show-grade-flash ${lastSettlement.correct ? "show-grade-correct" : "show-grade-wrong"}`}>
              {lastSettlement.correct ? "CORRECT" : "WRONG"}
            </div>
          )}
          <div className="show-accuracy num">
            <CountUp end={accuracy.correct} duration={1.2} /> / {accuracy.total}
          </div>
          <div className="show-accuracy-label">called correct tonight</div>
          <div className="show-ledger">
            {ledger
              .slice()
              .reverse()
              .slice(0, 6)
              .map((row, i) => {
                const delta = row.rating_after - row.rating_before;
                return (
                  <div key={row.seq} className="show-ledger-row" style={{ animationDelay: `${i * 90}ms` }}>
                    <span>{row.archetype.replace(/_/g, " ")}</span>
                    <span className="num">{Math.round(row.rating_before)}</span>
                    <span className="num">-&gt;</span>
                    <span className="num">{Math.round(row.rating_after)}</span>
                    <span className={`num ${delta >= 0 ? "delta-pos" : "delta-neg"}`}>
                      {delta >= 0 ? "+" : ""}
                      {Math.round(delta)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="show-hint mono">ARROWS TO STEP - ESC TO EXIT</div>
    </div>
  );
}
