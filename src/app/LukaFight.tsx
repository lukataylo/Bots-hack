"use client";

// Marquee fight driven by the planar competition simulator (src/luka). The bout is
// deterministic per matchup: the seed derives from the pre-committed prediction hash,
// so the fight the room watches is reproducible and tied to the posted line.
import { useMemo, useState, useCallback } from "react";
import type { Matchup } from "@/lib/types";
import { specFor, simulateBout } from "@/luka/sim";
import { FightScene, type Tick } from "@/luka/FightScene";

function seedFromMatchup(m: Matchup): number {
  const h = m.hashSha256 ?? m.id;
  let x = 0;
  for (let i = 0; i < 8; i += 1) x = (x * 16 + (parseInt(h[i] ?? "0", 16) || 0)) >>> 0;
  return (x >>> 0) || 1;
}

export default function LukaFight({ matchup }: { matchup: Matchup }) {
  const recording = useMemo(() => {
    const specA = specFor(matchup.fighterA);
    const specB = specFor(matchup.fighterB);
    const base = seedFromMatchup(matchup);
    // Deterministic representative bout: walk 16 hash-derived seeds and keep the most
    // watchable one (real fight arc over fluke instant-KO). Same matchup, same bout, always.
    let best = simulateBout(specA, specB, base, true);
    let bestScore = -Infinity;
    for (let i = 0; i < 16; i += 1) {
      const r = simulateBout(specA, specB, (base + i * 0x9e3779b9) >>> 0, true);
      const dur = r.durationSec;
      const durScore = dur >= 25 && dur <= 80 ? 100 : dur < 25 ? dur * 3 : 100 - (dur - 80);
      const score = durScore + r.hits.length;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }, [matchup]);
  const [tick, setTick] = useState<Tick | null>(null);
  const [ended, setEnded] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const onTick = useCallback((t: Tick) => setTick(t), []);
  const onEnd = useCallback(() => setEnded(true), []);
  const replay = useCallback(() => {
    setEnded(false);
    setTick(null);
    setRunKey((k) => k + 1);
  }, []);

  const hpA = tick ? Math.max(0, Math.min(1, tick.hpA)) : 1;
  const hpB = tick ? Math.max(0, Math.min(1, tick.hpB)) : 1;

  return (
    <div className="luka-fight">
      <FightScene recording={recording} colorA={matchup.fighterA.palette?.primary} colorB={matchup.fighterB.palette?.primary} playing runKey={runKey} onTick={onTick} onEnd={onEnd} />
      <div className="luka-hud">
        <div className="luka-hp luka-hp-a">
          <span className="luka-hp-name display">{matchup.fighterA.name}</span>
          <div className="luka-hp-track"><div className="luka-hp-fill hp-a" style={{ width: `${hpA * 100}%` }} /></div>
        </div>
        <div className="luka-hud-mid mono">
          {ended
            ? `${recording.winner === "A" ? matchup.fighterA.name : matchup.fighterB.name} wins by ${recording.method.toUpperCase()} in ${recording.durationSec.toFixed(0)}s`
            : tick
              ? `${tick.t.toFixed(1)}s · ${tick.hits} hits`
              : "simulated bout, seeded by the committed prediction"}
          {ended && (
            <button type="button" className="luka-replay mono" onClick={replay}>REPLAY</button>
          )}
        </div>
        <div className="luka-hp luka-hp-b">
          <span className="luka-hp-name display">{matchup.fighterB.name}</span>
          <div className="luka-hp-track"><div className="luka-hp-fill hp-b" style={{ width: `${hpB * 100}%` }} /></div>
        </div>
      </div>
    </div>
  );
}
