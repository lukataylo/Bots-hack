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
        <p className="mono" style={{ color: "var(--rosso)" }}>No matchup found. Ask the ring for a fresh QR code.</p>
      </div>
    );
  }

  if (phase === "closed") {
    return (
      <div className="bet-wrap">
        <div className="wordmark" style={{ justifyContent: "center" }}>
          <span className="dot" />
          RINGSIDE ARENA
        </div>
        <h1 className="mono" style={{ color: "var(--rosso)", fontSize: 22, letterSpacing: "0.04em" }}>
          LINES CLOSED
        </h1>
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
        <div className="wordmark" style={{ justifyContent: "center" }}>
          <span className="dot" />
          RINGSIDE ARENA
        </div>
        <h1 style={{ color: side === "A" ? "var(--side-a)" : "var(--side-b)", fontSize: 26 }}>
          Bet placed on side {side}
        </h1>
        <p style={{ color: "var(--text-dim)" }}>{nickname}, 100 points down. Watch the big screen for the line.</p>
      </div>
    );
  }

  return (
    <div className="bet-wrap">
      <div className="wordmark" style={{ justifyContent: "center" }}>
        <span className="dot" />
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
        className="bet-side-btn btn-a"
        onClick={() => placeBet("A")}
        disabled={!nickname.trim() || phase === "submitting"}
      >
        {matchup?.fighterA.name ?? "SIDE A"}
      </button>
      <button
        className="bet-side-btn btn-b"
        onClick={() => placeBet("B")}
        disabled={!nickname.trim() || phase === "submitting"}
      >
        {matchup?.fighterB.name ?? "SIDE B"}
      </button>
      {error && (
        <p className="mono" style={{ color: "var(--rosso)", fontSize: 12 }}>
          {error}
        </p>
      )}
      <p style={{ color: "var(--text-dim)", fontSize: 11 }}>100 play-points. No auth, no real money.</p>
    </div>
  );
}
