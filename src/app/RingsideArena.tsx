"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import CountUp from "react-countup";
import type { FighterProfile, Matchup, SettlementResult, TraceStep } from "@/lib/types";
import type { MarqueeScript } from "@/three/types";
import ShowMode from "./ShowMode";

const LukaFight = dynamic(() => import("./LukaFight"), {
  ssr: false,
  loading: () => <MarqueePlaceholder label="LOADING RENDERER" />,
});

const BotAssembly = dynamic(() => import("@/three").then((m) => m.BotAssembly), { ssr: false });
const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), { ssr: false });

interface EloLedgerRow {
  seq: number;
  archetype: string;
  rating_before: number;
  rating_after: number;
  matchup_id: string;
  at: string;
}

interface MatchupResponse {
  matchup: Matchup;
  crowd: { A: number; B: number };
  accuracyTally: { correct: number; total: number };
}

const photoSrc = (url: string | null | undefined, fallback: string) => url ? `/api/photo?u=${encodeURIComponent(url)}` : fallback;

const KIND_CLASS: Record<TraceStep["kind"], string> = {
  resolve: "k-resolve",
  scrape: "k-scrape",
  crosscheck: "k-crosscheck",
  fuse: "k-fuse",
  abstain: "k-abstain",
  error: "k-error",
};

/** Derived, display-only confidence heuristic from the odds engine's own sample counts.
 *  More logged fights for an archetype -> more confidence in the plate's bar. Purely a
 *  render-time formatting helper; does not touch odds arithmetic or state. */
function confidencePct(sampleCount: number): number {
  return Math.max(4, Math.min(100, Math.round((sampleCount / (sampleCount + 4)) * 100)));
}

function traceTime(at: string): string {
  try {
    return new Date(at).toLocaleTimeString([], { hour12: false });
  } catch {
    return "";
  }
}

function MarqueePlaceholder({ label }: { label: string }) {
  return (
    <div
      className="marquee-empty"
    >
      {label}
    </div>
  );
}

function BotPreview({ profile, accent }: { profile: FighterProfile; accent: string }) {
  return (
    <div className="rig-canvas">
      <Canvas camera={{ position: [0, 1.6, 3.4], fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <BotAssembly profile={profile} accent={accent} assembling />
      </Canvas>
    </div>
  );
}

export default function RingsideArena() {
  const [fighterAName, setFighterAName] = useState("");
  const [fighterBName, setFighterBName] = useState("");
  const [busy, setBusy] = useState(false);
  const [scoutError, setScoutError] = useState<string | null>(null);

  const [matchup, setMatchup] = useState<Matchup | null>(null);
  const [crowd, setCrowd] = useState<{ A: number; B: number }>({ A: 0, B: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>([]);

  const [accuracy, setAccuracy] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
  const [ledger, setLedger] = useState<EloLedgerRow[]>([]);

  const [betOrigin, setBetOrigin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [marqueeScript, setMarqueeScript] = useState<MarqueeScript | null>(null);

  const [settleWinner, setSettleWinner] = useState<"A" | "B">("A");
  const [settleMethod, setSettleMethod] = useState<"live-scrape" | "operator-confirmed">("live-scrape");
  const [operatorMsg, setOperatorMsg] = useState<string | null>(null);
  const [lastSettlement, setLastSettlement] = useState<SettlementResult | null>(null);

  const traceLogRef = useRef<HTMLDivElement | null>(null);

  // Preload the 3D renderer chunks at idle and the wiki photo cutouts the moment a
  // matchup posts, so no stage ever shows a loading gap mid-show.
  useEffect(() => {
    void import("./LukaFight");
    void import("./RevealBot");
  }, []);
  useEffect(() => {
    if (!matchup) return;
    for (const u of [matchup.fighterA.photo_url, matchup.fighterB.photo_url]) {
      if (u) {
        const img = new window.Image();
        img.src = photoSrc(u, "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchup?.id]);

  // Splash screen over the centre stage until the operator starts the show.
  const [splashAway, setSplashAway] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  const [showMode, setShowMode] = useState(() => (typeof window !== "undefined" ? window.location.hash === "#show" : false));

  useEffect(() => {
    const onHashChange = () => setShowMode(window.location.hash === "#show");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const toggleShowMode = useCallback(() => {
    setShowMode((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.location.hash = next ? "show" : "";
      }
      return next;
    });
  }, []);

  // Global stats: accuracy ticker + Elo scar ledger, independent of the current matchup.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        const data = (await res.json()) as { accuracyTally: { correct: number; total: number }; eloLedger: EloLedgerRow[]; betOrigin?: string | null };
        if (!alive) return;
        setAccuracy(data.accuracyTally);
        setLedger(data.eloLedger);
        if (data.betOrigin) setBetOrigin(data.betOrigin);
      } catch {
        /* keep last known values */
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // SSE trace replay+live for the active scouting job.
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/trace/${jobId}`);
    es.addEventListener("step", (e) => {
      try {
        const s = JSON.parse((e as MessageEvent).data) as TraceStep;
        setTrace((prev) => [...prev, s]);
      } catch {
        /* ignore malformed frame */
      }
    });
    es.addEventListener("done", () => es.close());
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);

  useEffect(() => {
    traceLogRef.current?.scrollTo({ top: traceLogRef.current.scrollHeight });
  }, [trace]);

  // Poll the matchup for sim/narration arriving async + live crowd split.
  useEffect(() => {
    if (!matchup?.id) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/matchup/${matchup.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as MatchupResponse;
        if (!alive) return;
        setMatchup(data.matchup);
        setCrowd(data.crowd);
      } catch {
        /* keep last known state */
      }
    };
    const t = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [matchup?.id]);

  // Poll for the marquee script until it exists.
  useEffect(() => {
    if (!matchup?.id || marqueeScript) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/marquee/${matchup.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as MarqueeScript;
        if (alive) setMarqueeScript(data);
      } catch {
        /* not ready yet */
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [matchup?.id, marqueeScript]);

  const handleGo = useCallback(async () => {
    if (!fighterAName.trim() || !fighterBName.trim() || busy) return;
    setBusy(true);
    setScoutError(null);
    setMatchup(null);
    setMarqueeScript(null);
    setLastSettlement(null);
    // Instant feedback: the panel reacts on click, before the first server step lands.
    setTrace([{
      id: crypto.randomUUID(),
      kind: "resolve",
      label: `Dispatching scout run: ${fighterAName.trim()} vs ${fighterBName.trim()}`,
      detail: "connecting live trace stream",
      at: new Date().toISOString(),
    }]);
    const jid = crypto.randomUUID();
    setJobId(jid);
    try {
      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighterA: fighterAName.trim(), fighterB: fighterBName.trim(), jobId: jid }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScoutError(data.reason || data.error || `Scouting failed (${res.status})`);
        return;
      }
      setMatchup(data.matchup as Matchup);
    } catch {
      setScoutError("Network error reaching /api/scout");
    } finally {
      setBusy(false);
    }
  }, [fighterAName, fighterBName, busy]);

  const handleLock = useCallback(async () => {
    if (!matchup) return;
    setOperatorMsg(null);
    try {
      const res = await fetch(`/api/lock/${matchup.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setOperatorMsg(data.error || "Lock failed");
        return;
      }
      setMatchup((m) => (m ? { ...m, status: "locked", lockedAt: data.lockedAt } : m));
    } catch {
      setOperatorMsg("Network error locking lines");
    }
  }, [matchup]);

  const handleSettle = useCallback(async () => {
    if (!matchup) return;
    setOperatorMsg(null);
    try {
      const res = await fetch(`/api/settle/${matchup.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualWinner: settleWinner, method: settleMethod }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOperatorMsg(data.error || "Settle failed");
        return;
      }
      setMatchup((m) => (m ? { ...m, status: "settled" } : m));
      setLastSettlement({
        matchupId: matchup.id,
        actualWinner: settleWinner,
        method: settleMethod,
        correct: data.correct,
        settledAt: data.settledAt,
      });
      const stats = await fetch("/api/stats", { cache: "no-store" }).then((r) => r.json());
      setAccuracy(stats.accuracyTally);
      setLedger(stats.eloLedger);
    } catch {
      setOperatorMsg("Network error settling matchup");
    }
  }, [matchup, settleWinner, settleMethod]);

  const odds = matchup?.odds ?? null;
  const isLive = !!matchup && matchup.status !== "settled";
  const betUrl = matchup && betOrigin ? `${betOrigin}/bet/${matchup.id}` : "";
  const totalVotes = crowd.A + crowd.B;
  const pctA = totalVotes ? Math.round((crowd.A / totalVotes) * 100) : 50;
  const pctB = 100 - pctA;
  const machinePick = odds && !odds.abstain ? (odds.winProbA >= odds.winProbB ? "A" : "B") : null;
  const confA = odds ? confidencePct(odds.sampleCountA) : 0;
  const confB = odds ? confidencePct(odds.sampleCountB) : 0;
  const simRunning = !!matchup && !matchup.sim;

  if (showMode) {
    return (
      <ShowMode
        onExit={toggleShowMode}
        fighterAName={fighterAName}
        fighterBName={fighterBName}
        setFighterAName={setFighterAName}
        setFighterBName={setFighterBName}
        busy={busy}
        scoutError={scoutError}
        handleGo={handleGo}
        jobId={jobId}
        trace={trace}
        matchup={matchup}
        crowd={crowd}
        marqueeScript={marqueeScript}
        betUrl={betUrl}
        handleLock={handleLock}
        operatorMsg={operatorMsg}
        lastSettlement={lastSettlement}
        accuracy={accuracy}
        ledger={ledger}
      />
    );
  }

  return (
    <div className="arena">
      <header className="arena-header">
        <div className="wordmark display">
          <img src="/assets/logo.png" alt="" className="wordmark-logo" />
          RINGSIDE ARENA
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {matchup?.hashSha256 && (
            <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>
              pre-committed {matchup.hashSha256.slice(0, 10)}
              {matchup.gitCommitSha ? ` @ ${matchup.gitCommitSha.slice(0, 8)}` : " (commit pending)"}
            </span>
          )}
          {isLive && <span className="badge-live">LIVE</span>}
          {matchup && <span className={`status-pill status-${matchup.status}`}>{matchup.status}</span>}
          <button className="btn" onClick={toggleShowMode}>
            SHOW
          </button>
        </div>
      </header>

      <section className="fighter-row">
        <div className="plate plate-blue fighter-card">
          <img
            src={photoSrc(matchup?.fighterA.photo_url, "/assets/bot-blue.png")}
            alt=""
            className="fighter-art"
          />
          <div className="fighter-info">
            <div className="fighter-name display fighter-name-a">
              {matchup?.fighterA.name || fighterAName || "FIGHTER A"}
            </div>
            {matchup && (
              <div className="fighter-meta-row">
                <div>
                  <div className="fighter-meta-label">Record</div>
                  <div className="fighter-meta-value side-a-text num">
                    {matchup.fighterA.wins}-{matchup.fighterA.losses}-{matchup.fighterA.ko_wins}
                  </div>
                </div>
                <div>
                  <div className="fighter-meta-label">Weapon</div>
                  <div className="fighter-meta-value">{matchup.fighterA.weapon_class.replace(/_/g, " ")}</div>
                </div>
              </div>
            )}
            {odds && !odds.abstain && (
              <>
                <div className="confidence-label">
                  <span>Data confidence</span>
                  <span className="num">{confA}%</span>
                </div>
                <div className="confidence-bar confidence-bar-a">
                  <div className="confidence-mask" style={{ width: `${100 - confA}%` }} />
                </div>
              </>
            )}
            <div className="fighter-meta-label" style={{ marginTop: 10 }}>
              Scout A selection
            </div>
            <input
              className="entry-input side-a-border fighter-select"
              placeholder="Fighter A (e.g. Tombstone)"
              value={fighterAName}
              onChange={(e) => setFighterAName(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="vs-col">
          <img src="/assets/vs-badge.png" alt="VS" className="vs-badge-img" />
          <div className="vs-col-kicker mono">
            Sim agreement
            <br />
            1,000 physics runs
          </div>
          <button className="plate plate-gold-solid display btn-run-matchup" onClick={handleGo} disabled={busy}>
            {busy ? "SCOUTING..." : "RUN MATCHUP"}
          </button>
        </div>

        <div className="plate plate-purple fighter-card fighter-card-b">
          <img
            src={photoSrc(matchup?.fighterB.photo_url, "/assets/bot-purple.png")}
            alt=""
            className="fighter-art"
          />
          <div className="fighter-info">
            <div className="fighter-name display fighter-name-b">
              {matchup?.fighterB.name || fighterBName || "FIGHTER B"}
            </div>
            {matchup && (
              <div className="fighter-meta-row">
                <div>
                  <div className="fighter-meta-label">Weapon</div>
                  <div className="fighter-meta-value">{matchup.fighterB.weapon_class.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <div className="fighter-meta-label">Record</div>
                  <div className="fighter-meta-value side-b-text num">
                    {matchup.fighterB.wins}-{matchup.fighterB.losses}-{matchup.fighterB.ko_wins}
                  </div>
                </div>
              </div>
            )}
            {odds && !odds.abstain && (
              <>
                <div className="confidence-label">
                  <span className="num">{confB}%</span>
                  <span>Data confidence</span>
                </div>
                <div className="confidence-bar confidence-bar-b">
                  <div className="confidence-mask" style={{ width: `${100 - confB}%` }} />
                </div>
              </>
            )}
            <div className="fighter-meta-label" style={{ marginTop: 10, textAlign: "right" }}>
              Scout B selection
            </div>
            <input
              className="entry-input side-b-border fighter-select"
              placeholder="Fighter B (e.g. Bite Force)"
              value={fighterBName}
              onChange={(e) => setFighterBName(e.target.value)}
              disabled={busy}
              style={{ textAlign: "right" }}
            />
          </div>
        </div>
      </section>
      {scoutError && (
        <p className="mono" style={{ color: "var(--alert)", fontSize: 12, padding: "0 4px" }}>
          {scoutError}
        </p>
      )}

      <div className="grid">
        <section className="panel stage-panel" style={{ gridColumn: "span 12" }}>
          <div className={`arena-stage ${matchup ? "is-running" : ""}`}>
            {matchup ? (
              <LukaFight matchup={matchup} />
            ) : (
              <MarqueePlaceholder label="AWAITING MATCHUP" />
            )}

            {!matchup && !splashGone && (
              <div
                className={`splash ${splashAway ? "splash-away" : ""}`}
                onTransitionEnd={() => splashAway && setSplashGone(true)}
              >
                <img className="splash-wordmark" src="/assets/wordmark.png" alt="RINGSIDE ARENA" />
                <button
                  type="button"
                  className="splash-start display"
                  onClick={() => {
                    setSplashAway(true);
                    setTimeout(() => (document.querySelector(".entry-input") as HTMLInputElement | null)?.focus(), 750);
                  }}
                >
                  START BATTLE
                </button>
              </div>
            )}

            <div className="stage-overlay">
              <div className="stage-line">
                <div className="stage-corner">
                  <span className="stage-name display side-a-text">
                    {matchup?.fighterA.name ?? "CORNER A"}
                  </span>
                  <span className="stage-pct num side-a-text">
                    {odds && !odds.abstain ? `${(odds.winProbA * 100).toFixed(0)}%` : "--"}
                  </span>
                </div>
                <span className="stage-clash" aria-hidden="true" />
                <div className="stage-corner stage-corner-b">
                  <span className="stage-name display side-b-text">
                    {matchup?.fighterB.name ?? "CORNER B"}
                  </span>
                  <span className="stage-pct num side-b-text">
                    {odds && !odds.abstain ? `${(odds.winProbB * 100).toFixed(0)}%` : "--"}
                  </span>
                </div>
              </div>

              <div className="stage-foot">
                {odds?.abstain ? (
                  <span className="stage-abstain display">Insufficient evidence, no line posted</span>
                ) : (
                  <>
                    <div className="crowd-bar stage-crowd">
                      <div className="crowd-a" style={{ width: `${pctA}%` }} />
                      <div className="crowd-b" style={{ width: `${pctB}%` }} />
                    </div>
                    <div className="stage-crowd-legend mono">
                      <span className="side-a-text">
                        A {crowd.A}
                        {machinePick === "A" && <span className="pick-tag">MACHINE PICK</span>}
                      </span>
                      <span className="side-b-text">
                        {machinePick === "B" && <span className="pick-tag">MACHINE PICK</span>}
                        B {crowd.B}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="panel" style={{ gridColumn: "span 4" }}>
          <div className="panel-title">
            <span>
              <span className="dot-lead"><span /><span /></span>
              Live intelligence feed
            </span>
          </div>
          <div className="trace-log" ref={traceLogRef}>
            {trace.length === 0 && <span style={{ color: "var(--text-dim)" }}>Awaiting scouting run...</span>}
            {trace.map((t) => (
              <div key={t.id} className="trace-line">
                {t.at && <span className="trace-time mono">{traceTime(t.at)}</span>}
                <span className={`trace-kind ${KIND_CLASS[t.kind]}`}>{t.kind}</span>
                <span>
                  {t.label}
                  {t.detail ? <span style={{ color: "var(--text-dim)" }}> : {t.detail}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ gridColumn: "span 4" }}>
          <div className="panel-title">
            <span>
              <span className="dot-lead"><span /><span /></span>
              Prediction
            </span>
          </div>
          {!odds && <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No line posted yet.</p>}
          {odds && odds.abstain && (
            <div className="plate plate-gold-solid abstain-plate">
              <img src="/assets/icon-gold.png" alt="" className="abstain-icon" />
              <div>
                <div className="abstain-title display">Insufficient evidence</div>
                <div className="abstain-sub">no line posted</div>
              </div>
            </div>
          )}
          {odds && !odds.abstain && matchup && (
            <div className="odds-row">
              <div className="odds-side">
                <div className="odds-name display" style={{ color: "var(--side-a)" }}>{matchup.fighterA.name}</div>
                <div className="odds-pct odds-a num">{(odds.winProbA * 100).toFixed(1)}%</div>
              </div>
              <div className="odds-vs">VS</div>
              <div className="odds-side">
                <div className="odds-name display" style={{ color: "var(--side-b)" }}>{matchup.fighterB.name}</div>
                <div className="odds-pct odds-b num">{(odds.winProbB * 100).toFixed(1)}%</div>
              </div>
            </div>
          )}
          {odds && (
            <>
              <p className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 10 }}>
                95% CI [{odds.confidenceInterval[0].toFixed(2)}, {odds.confidenceInterval[1].toFixed(2)}] · n=
                {odds.sampleCountA}/{odds.sampleCountB} · {odds.weighting}
              </p>
              <div className="arith-trace mono">
                {odds.arithmeticTrace.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </>
          )}
          {matchup?.narration && (
            <p style={{ marginTop: 10, fontStyle: "italic", color: "var(--gold)", fontSize: 13 }}>
              &ldquo;{matchup.narration}&rdquo;
            </p>
          )}
        </section>

        <section className="panel" style={{ gridColumn: "span 4" }}>
          <div className="panel-title">1,000 physics runs</div>
          {!matchup?.sim && <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Running Monte Carlo sim...</p>}
          {matchup?.sim && odds && !odds.abstain && (
            <>
              <div className="physics-stats-row">
                <div>
                  <div className="physics-stat-label">{matchup.fighterA.name} win</div>
                  <div className="physics-stat-value side-a-text num">{(matchup.sim.winShareA * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="physics-stat-label">{matchup.fighterB.name} win</div>
                  <div className="physics-stat-value side-b-text num">{(matchup.sim.winShareB * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="physics-stat-label">Draw</div>
                  <div className="physics-stat-value num">
                    {Math.max(0, 100 - matchup.sim.winShareA * 100 - matchup.sim.winShareB * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="agree-track">
                <div className="agree-fill" />
                <div className="agree-marker" style={{ left: `${odds.winProbA * 100}%` }} title="posted line" />
                <div
                  className="agree-marker"
                  style={{ left: `${matchup.sim.winShareA * 100}%`, background: "#fff" }}
                  title="sim result"
                />
              </div>
              <p className="mono" style={{ fontSize: 12, marginTop: 8 }}>
                sim {(matchup.sim.winShareA * 100).toFixed(1)}% vs line {(odds.winProbA * 100).toFixed(1)}% ·
                modal {matchup.sim.modalOutcome} · median {matchup.sim.medianDurationSec.toFixed(1)}s
              </p>
            </>
          )}
        </section>

        <section className="panel" style={{ gridColumn: "span 4" }}>
          <div className="panel-title">
            <span>Crowd pulse</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>
              {totalVotes} votes cast
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {betUrl && (
              <div style={{ background: "#F5B426", padding: 8, borderRadius: 10, display: "inline-flex", lineHeight: 0 }}>
                <QRCodeSVG value={betUrl} size={104} fgColor="#120b22" bgColor="#F5B426" />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div className="crowd-bar">
                <div className="crowd-a" style={{ width: `${pctA}%` }} />
                <div className="crowd-b" style={{ width: `${pctB}%` }} />
              </div>
              <div className="mono" style={{ fontSize: 12, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--side-a)" }}>
                  A {crowd.A} {machinePick === "A" && <span className="pick-tag">MACHINE PICK</span>}
                </span>
                <span style={{ color: "var(--side-b)" }}>
                  {machinePick === "B" && <span className="pick-tag">MACHINE PICK</span>} B {crowd.B}
                </span>
              </div>
            </div>
          </div>
          <img src="/assets/crowd.png" alt="" className="crowd-footer-art" />
        </section>

        <section className="panel" style={{ gridColumn: "span 4" }}>
          <div className="panel-title">Operator controls</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="plate plate-red-solid display btn-lock"
              style={{ flex: "1 1 180px" }}
              onClick={handleLock}
              disabled={!matchup || matchup.status !== "open"}
            >
              Lock lines
            </button>
            <div className="plate plate-dropdown" style={{ flex: "0 0 160px" }}>
              <select
                className="select-native"
                value={settleWinner}
                onChange={(e) => setSettleWinner(e.target.value as "A" | "B")}
              >
                <option value="A">Winner: A</option>
                <option value="B">Winner: B</option>
              </select>
            </div>
            <div className="plate plate-dropdown" style={{ flex: "0 0 200px" }}>
              <select
                className="select-native"
                value={settleMethod}
                onChange={(e) => setSettleMethod(e.target.value as "live-scrape" | "operator-confirmed")}
              >
                <option value="live-scrape">Method: live scrape</option>
                <option value="operator-confirmed">Method: operator confirmed</option>
              </select>
            </div>
            <button
              className="plate plate-gold-solid display btn-settle"
              onClick={handleSettle}
              disabled={!matchup || matchup.status !== "locked" || !matchup.gitCommitSha}
            >
              Settle
            </button>
          </div>
          {operatorMsg && (
            <p className="mono" style={{ color: "var(--alert)", fontSize: 12, marginTop: 8 }}>
              {operatorMsg}
            </p>
          )}
          {lastSettlement && (
            <p className="mono flash-settle" style={{ fontSize: 12, marginTop: 8, color: lastSettlement.correct ? "var(--success)" : "var(--alert)" }}>
              settled: {lastSettlement.correct ? "CORRECT CALL" : "MISSED CALL"}
            </p>
          )}
          <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 8 }}>
            Locking lines prevents further automated updates from altering the posted result.
          </p>
        </section>

        <section className="panel" style={{ gridColumn: "span 3" }}>
          <div className="panel-title">Accuracy tonight</div>
          <div className="num display" style={{ fontSize: 34 }}>
            <CountUp end={accuracy.correct} duration={0.8} /> / {accuracy.total}
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>called correct tonight</p>
        </section>

        <section className="panel" style={{ gridColumn: "span 3" }}>
          <div className="panel-title">Fighter rigs</div>
          {matchup ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="plate plate-blue rig-cell">
                <BotPreview profile={matchup.fighterA} accent="#3D7BFF" />
                <img src="/assets/bot-blue.png" alt="" className="rig-mascot-corner" />
                <div className="rig-name display side-a-text">{matchup.fighterA.name}</div>
                <div className="rig-meta">{matchup.fighterA.weapon_class.replace(/_/g, " ")}</div>
              </div>
              <div className="plate plate-purple rig-cell">
                <BotPreview profile={matchup.fighterB} accent="#9B4DFF" />
                <img src="/assets/bot-purple.png" alt="" className="rig-mascot-corner" />
                <div className="rig-name display side-b-text">{matchup.fighterB.name}</div>
                <div className="rig-meta">{matchup.fighterB.weapon_class.replace(/_/g, " ")}</div>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: 12 }}>Scout a matchup to assemble bot rigs.</p>
          )}
        </section>

        <section className="panel" style={{ gridColumn: "span 12" }}>
          <div className="panel-title">Elo scar ledger</div>
          {ledger.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 12 }}>No settlements yet.</p>
          ) : (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Archetype</th>
                  <th>Rating before</th>
                  <th>Rating after</th>
                  <th>Delta</th>
                  <th>Matchup</th>
                </tr>
              </thead>
              <tbody>
                {ledger
                  .slice()
                  .reverse()
                  .map((row) => {
                    const delta = row.rating_after - row.rating_before;
                    return (
                      <tr key={row.seq}>
                        <td>{row.archetype.replace(/_/g, " ")}</td>
                        <td className="num">{Math.round(row.rating_before)}</td>
                        <td className="num">{Math.round(row.rating_after)}</td>
                        <td className={`num ${delta >= 0 ? "delta-pos" : "delta-neg"}`}>
                          {delta >= 0 ? "+" : ""}
                          {Math.round(delta)}
                        </td>
                        <td className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>
                          {row.matchup_id.slice(0, 8)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <footer className="sponsor-strip">
        <span className="sponsor-verb">SCRAPE</span>
        <span className="sponsor-verb">SEARCH</span>
        <span>Bright Data live-fetches every fighter&apos;s record straight into the trace panel above. Nothing here is fabricated.</span>
      </footer>
    </div>
  );
}
