"use client";

import { useCallback, useEffect, useState } from "react";
import type { Matchup } from "@/lib/types";

type Phase = "loading" | "form" | "submitting" | "confirmed" | "closed" | "not-found";

export default function BetClient({ matchupId }: { matchupId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [matchup, setMatchup] = useState<Matchup | null>(null);
  const [nickname, setNickname] = useState("");
  const [side, setSide] = useState<"A" | "B" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/matchup/${matchupId}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) {
          setPhase("not-found");
          return;
        }
        const data = await res.json();
        setMatchup(data.matchup as Matchup);
        setPhase((p) => (p === "loading" ? (data.matchup.status === "open" ? "form" : "closed") : p));
      } catch {
        /* keep retrying */
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [matchupId]);

  const placeBet = useCallback(
    async (chosen: "A" | "B") => {
      if (!nickname.trim() || phase === "submitting") return;
      setSide(chosen);
      setPhase("submitting");
      setError(null);
      try {
        const res = await fetch("/api/bet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchupId, nickname: nickname.trim(), side: chosen }),
        });
        const data = await res.json();
        if (res.status === 409) {
          setPhase("closed");
          return;
        }
        if (!res.ok) {
          setError(data.error || "Bet failed");
          setPhase("form");
          return;
        }
        setPhase("confirmed");
      } catch {
        setError("Network error placing bet");
        setPhase("form");
      }
    },
    [matchupId, nickname, phase],
  );

  if (phase === "loading") {
    return (
      <div className="bet-wrap">
        <p className="mono" style={{ color: "var(--text-dim)" }}>Loading matchup...</p>
      </div>
    );
  }

  if (phase === "not-found") {
    return (
      <div className="bet-wrap">
        <p className="mono" style={{ color: "var(--alert)" }}>No matchup found. Ask the ring for a fresh QR code.</p>
      </div>
    );
  }

  if (phase === "closed") {
    return (
      <div className="bet-wrap">
        <div className="wordmark display" style={{ justifyContent: "center" }}>
          <img src="/assets/icon-gold.png" alt="" className="wordmark-logo" />
          RINGSIDE ARENA
        </div>
        <div className="plate plate-red-solid display bet-lines-closed-plate" style={{ fontSize: 22, letterSpacing: "0.04em" }}>
          LINES CLOSED
        </div>
        {matchup && (
          <p style={{ color: "var(--text-dim)" }}>
            {matchup.fighterA.name} vs {matchup.fighterB.name}
          </p>
        )}
      </div>
    );
  }

  if (phase === "confirmed") {
    return (
      <div className="bet-wrap">
        <div className="wordmark display" style={{ justifyContent: "center" }}>
          <img src="/assets/icon-gold.png" alt="" className="wordmark-logo" />
          RINGSIDE ARENA
        </div>
        <img src={side === "A" ? "/assets/bot-blue.png" : "/assets/bot-purple.png"} alt="" className="bet-fighter-art" />
        <h1 className="display" style={{ color: side === "A" ? "var(--side-a)" : "var(--side-b)", fontSize: 26 }}>
          Bet placed on side {side}
        </h1>
        <p style={{ color: "var(--text-dim)" }}>{nickname}, 100 points down. Watch the big screen for the line.</p>
      </div>
    );
  }

  return (
    <div className="bet-wrap">
      <div className="wordmark display" style={{ justifyContent: "center" }}>
        <img src="/assets/icon-gold.png" alt="" className="wordmark-logo" />
        RINGSIDE ARENA
      </div>
      {matchup && (
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>
          <span style={{ color: "var(--side-a)" }}>{matchup.fighterA.name}</span>
          {" vs "}
          <span style={{ color: "var(--side-b)" }}>{matchup.fighterB.name}</span>
        </p>
      )}
      <input
        className="entry-input"
        style={{ maxWidth: 340, textAlign: "center" }}
        placeholder="Your nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={40}
      />
      <button
        className="plate plate-blue bet-side-btn bet-plate-a display"
        onClick={() => placeBet("A")}
        disabled={!nickname.trim() || phase === "submitting"}
      >
        <img src="/assets/bot-blue.png" alt="" className="bet-fighter-art" style={{ height: 90, marginBottom: 8 }} />
        <div>{matchup?.fighterA.name ?? "SIDE A"}</div>
      </button>
      <button
        className="plate plate-purple bet-side-btn bet-plate-b display"
        onClick={() => placeBet("B")}
        disabled={!nickname.trim() || phase === "submitting"}
      >
        <img src="/assets/bot-purple.png" alt="" className="bet-fighter-art" style={{ height: 90, marginBottom: 8 }} />
        <div>{matchup?.fighterB.name ?? "SIDE B"}</div>
      </button>
      {error && (
        <p className="mono" style={{ color: "var(--alert)", fontSize: 12 }}>
          {error}
        </p>
      )}
      <p style={{ color: "var(--text-dim)", fontSize: 11 }}>100 play-points. No auth, no real money.</p>
    </div>
  );
}
