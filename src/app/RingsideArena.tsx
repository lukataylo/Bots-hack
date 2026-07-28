"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import CountUp from "react-countup";
import type { FighterProfile, Matchup, SettlementResult, TraceStep } from "@/lib/types";
import type { MarqueeScript } from "@/three/types";

const MarqueeFight = dynamic(() => import("@/three").then((m) => m.MarqueeFight), {
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

const KIND_CLASS: Record<TraceStep["kind"], string> = {
  resolve: "k-resolve",
  scrape: "k-scrape",
  crosscheck: "k-crosscheck",
  fuse: "k-fuse",
  abstain: "k-abstain",
  error: "k-error",
};

function MarqueePlaceholder({ label }: { label: string }) {
  return (
    <div
      style={{
        height: 320,
        display: "grid",
        placeItems: "center",
        color: "var(--text-dim)",
        fontSize: 12,
        letterSpacing: "0.08em",
        border: "1px dashed var(--border)",
        borderRadius: 8,
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
  );
}

function BotPreview({ profile, accent }: { profile: FighterProfile; accent: "#0ECB81" | "#F6465D" }) {
  return (
    <div style={{ height: 150, borderRadius: 6, overflow: "hidden", background: "#000" }}>
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

  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [marqueeScript, setMarqueeScript] = useState<MarqueeScript | null>(null);

  const [settleWinner, setSettleWinner] = useState<"A" | "B">("A");
  const [settleMethod, setSettleMethod] = useState<"live-scrape" | "operator-confirmed">("live-scrape");
  const [operatorMsg, setOperatorMsg] = useState<string | null>(null);
  const [lastSettlement, setLastSettlement] = useState<SettlementResult | null>(null);

  const traceLogRef = useRef<HTMLDivElement | null>(null);

  // Global stats: accuracy ticker + Elo scar ledger, independent of the current matchup.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        const data = (await res.json()) as { accuracyTally: { correct: number; total: number }; eloLedger: EloLedgerRow[] };
        if (!alive) return;
        setAccuracy(data.accuracyTally);
        setLedger(data.eloLedger);
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
    setTrace([]);
    setMarqueeScript(null);
    setLastSettlement(null);
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
  const betUrl = matchup && origin ? `${origin}/bet/${matchup.id}` : "";
  const totalVotes = crowd.A + crowd.B;
  const pctA = totalVotes ? Math.round((crowd.A / totalVotes) * 100) : 50;
  const pctB = 100 - pctA;
  const machinePick = odds && !odds.abstain ? (odds.winProbA >= odds.winProbB ? "A" : "B") : null;

  return (
    <div className="arena">
      <header className="arena-header">
        <div className="wordmark">
          <span className="dot" />
          RINGSIDE ARENA
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {isLive && <span className="badge-live">LIVE</span>}
          {matchup && <span className={`status-pill status-${matchup.status}`}>{matchup.status}</span>}
        </div>
      </header>

      <section className="panel">
        <div className="panel-title">
          <span>Scout a matchup</span>
          {matchup?.hashSha256 && (
            <span className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>
              pre-committed {matchup.hashSha256.slice(0, 10)}
              {matchup.gitCommitSha ? ` @ ${matchup.gitCommitSha.slice(0, 8)}` : " (commit pending)"}
            </span>
          )}
        </div>
        <div className="entry-row">
          <input
            className="entry-input side-a-border"
            placeholder="Fighter A (e.g. Tombstone)"
            value={fighterAName}
            onChange={(e) => setFighterAName(e.target.value)}
            disabled={busy}
          />
          <input
            className="entry-input side-b-border"
            placeholder="Fighter B (e.g. Bite Force)"
            value={fighterBName}
            onChange={(e) => setFighterBName(e.target.value)}
            disabled={busy}
          />
          <button className="btn btn-go" onClick={handleGo} disabled={busy}>
            {busy ? "SCOUTING..." : "GO"}
          </button>
        </div>
        {scoutError && (
          <p className="mono" style={{ color: "var(--rosso)", fontSize: 12, marginTop: 10 }}>
            {scoutError}
          </p>
        )}
      </section>

      <div className="grid">
        <section className="panel" style={{ gridColumn: "span 6" }}>
          <div className="panel-title">Trace: resolve / scrape / crosscheck</div>
          <div className="trace-log" ref={traceLogRef}>
            {trace.length === 0 && <span style={{ color: "var(--text-dim)" }}>Awaiting scouting run...</span>}
            {trace.map((t) => (
              <div key={t.id} className="trace-line">
                <span className={`trace-kind ${KIND_CLASS[t.kind]}`}>{t.kind}</span>
                <span>
                  {t.label}
                  {t.detail ? <span style={{ color: "var(--text-dim)" }}> : {t.detail}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ gridColumn: "span 6" }}>
          <div className="panel-title">Odds</div>
          {!odds && <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No line posted yet.</p>}
          {odds && odds.abstain && (
            <div className="abstain-banner">INSUFFICIENT EVIDENCE, no line posted</div>
          )}
          {odds && !odds.abstain && matchup && (
            <div className="odds-row">
              <div className="odds-side">
                <div className="odds-name" style={{ color: "var(--side-a)" }}>{matchup.fighterA.name}</div>
                <div className="odds-pct odds-a num">{(odds.winProbA * 100).toFixed(1)}%</div>
              </div>
              <div className="odds-vs">VS</div>
              <div className="odds-side">
                <div className="odds-name" style={{ color: "var(--side-b)" }}>{matchup.fighterB.name}</div>
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
            <p style={{ marginTop: 10, fontStyle: "italic", color: "var(--amber)", fontSize: 13 }}>
              &ldquo;{matchup.narration}&rdquo;
            </p>
          )}
        </section>

        <section className="panel" style={{ gridColumn: "span 6" }}>
          <div className="panel-title">Sim agreement, 1,000 physics runs</div>
          {!matchup?.sim && <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Running Monte Carlo sim...</p>}
          {matchup?.sim && odds && !odds.abstain && (
            <>
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

        <section className="panel" style={{ gridColumn: "span 6" }}>
          <div className="panel-title">Crowd + bet link</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {betUrl && (
              <div className="qr-wrap">
                <QRCodeSVG value={betUrl} size={96} />
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
        </section>

        <section className="panel" style={{ gridColumn: "span 6" }}>
          <div className="panel-title">Operator controls</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-rosso" onClick={handleLock} disabled={!matchup || matchup.status !== "open"}>
              LOCK LINES
            </button>
            <select
              className="entry-input"
              style={{ flex: "0 0 160px" }}
              value={settleWinner}
              onChange={(e) => setSettleWinner(e.target.value as "A" | "B")}
            >
              <option value="A">Winner: A</option>
              <option value="B">Winner: B</option>
            </select>
            <select
              className="entry-input"
              style={{ flex: "0 0 200px" }}
              value={settleMethod}
              onChange={(e) => setSettleMethod(e.target.value as "live-scrape" | "operator-confirmed")}
            >
              <option value="live-scrape">Method: live scrape</option>
              <option value="operator-confirmed">Method: operator confirmed</option>
            </select>
            <button
              className="btn"
              onClick={handleSettle}
              disabled={!matchup || matchup.status !== "locked" || !matchup.gitCommitSha}
            >
              SETTLE
            </button>
          </div>
          {operatorMsg && (
            <p className="mono" style={{ color: "var(--rosso)", fontSize: 12, marginTop: 8 }}>
              {operatorMsg}
            </p>
          )}
          {lastSettlement && (
            <p className="mono flash-settle" style={{ fontSize: 12, marginTop: 8, color: lastSettlement.correct ? "var(--side-a)" : "var(--side-b)" }}>
              settled: {lastSettlement.correct ? "CORRECT CALL" : "MISSED CALL"}
            </p>
          )}
        </section>

        <section className="panel" style={{ gridColumn: "span 3" }}>
          <div className="panel-title">Accuracy tonight</div>
          <div className="num" style={{ fontSize: 34, fontWeight: 700 }}>
            <CountUp end={accuracy.correct} duration={0.8} /> / {accuracy.total}
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>called correct tonight</p>
        </section>

        <section className="panel" style={{ gridColumn: "span 3" }}>
          <div className="panel-title">Fighter rigs</div>
          {matchup ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <BotPreview profile={matchup.fighterA} accent="#0ECB81" />
              <BotPreview profile={matchup.fighterB} accent="#F6465D" />
            </div>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: 12 }}>Scout a matchup to assemble bot rigs.</p>
          )}
        </section>

        <section className="panel" style={{ gridColumn: "span 12" }}>
          <div className="panel-title">Marquee fight</div>
          {matchup && marqueeScript ? (
            <MarqueeFight script={marqueeScript} fighterA={matchup.fighterA} fighterB={matchup.fighterB} />
          ) : (
            <MarqueePlaceholder label={matchup ? "RENDERING MARQUEE FIGHT" : "AWAITING MATCHUP"} />
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
