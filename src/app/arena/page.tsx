"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { FighterProfile } from "@/lib/types";
import type { MarqueeScript, MarqueeFrame, MarqueeEvent } from "@/three";

// R3F/WebGL must never run during the server render pass — dynamic-import everything
// that touches Canvas with ssr:false (see node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md).
const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), { ssr: false });
const BotAssembly = dynamic(() => import("@/three/BotAssembly"), { ssr: false });
const MarqueeFight = dynamic(() => import("@/three/MarqueeFight"), { ssr: false });

const FIGHTER_A: FighterProfile = {
  name: "Whirlwind",
  weapon_class: "horizontal_spinner",
  weight_kg: 110,
  wins: 12,
  losses: 3,
  ko_wins: 8,
  failure_pattern: null,
  source_urls: [],
};

const FIGHTER_B: FighterProfile = {
  name: "Guillotine",
  weapon_class: "flipper",
  weight_kg: 100,
  wins: 9,
  losses: 5,
  ko_wins: 4,
  failure_pattern: null,
  source_urls: [],
};

/** ~8s mock keyframe script: 3 hits (one above the 80th-percentile slow-mo threshold), 1 launch, KO finish. */
function buildMockScript(): MarqueeScript {
  const fps = 30;
  const durationSec = 8;
  const totalFrames = Math.round(durationSec * fps) + 1;

  const hitIdx = [Math.round(2 * fps), Math.round(4 * fps), Math.round(6 * fps)];
  const hitMagnitude = [3, 9, 4]; // 9 clears the 80th percentile -> slow-mo
  const launchIdx = Math.round(6.4 * fps);
  const launchAt = launchIdx / fps;

  const frames: MarqueeFrame[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    const angle = t * 0.9;

    let ax = -1.6 + Math.sin(angle) * 0.4;
    const az = Math.cos(angle * 1.2) * 1.2;
    let bx = 1.6 + Math.sin(angle + Math.PI) * 0.4;
    let bz = Math.cos(angle * 1.2 + Math.PI) * 1.2;
    let ay = 0.3;
    let by = 0.3;

    for (const hi of hitIdx) {
      const d = (i - hi) / fps;
      if (Math.abs(d) < 0.3) {
        const k = (0.3 - Math.abs(d)) / 0.3;
        bx += k * 0.8;
        ax -= k * 0.3;
      }
    }

    if (t > launchAt) {
      const p = Math.min((t - launchAt) / (durationSec - launchAt), 1);
      by = 0.3 + Math.sin(p * Math.PI) * 2.2;
      bx += p * 3.5;
      bz += p * 1.5;
    }

    const events: MarqueeEvent[] = [];
    hitIdx.forEach((hi, k) => {
      if (i === hi) events.push({ type: "hit", magnitude: hitMagnitude[k] ?? 1 });
    });
    if (i === launchIdx) events.push({ type: "launch", magnitude: 6 });
    if (i === totalFrames - 1) events.push({ type: "ko", magnitude: 10 });

    frames.push({
      t,
      a: { p: [ax, ay, az], q: [0, 0, 0, 1] },
      b: { p: [bx, by, bz], q: [0, 0, 0, 1] },
      events: events.length ? events : undefined,
    });
  }

  return { fps, frames, winner: "A", durationSec };
}

export default function ArenaDevPage() {
  const [assembling, setAssembling] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const script = useMemo(() => buildMockScript(), []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0B0E11",
        color: "#e6e8eb",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>RINGSIDE ARENA — three.js dev preview</h1>
        <button
          onClick={() => {
            setAssembling(true);
            setReplayKey((k) => k + 1);
          }}
          style={{ padding: "6px 14px", background: "#0ECB81", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          Assemble bots
        </button>
        <button
          onClick={() => setAssembling(false)}
          style={{ padding: "6px 14px", background: "#2a2f3a", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          Reset
        </button>
      </div>

      <div style={{ height: 380, border: "1px solid #1b1f27", borderRadius: 8, overflow: "hidden" }}>
        <Canvas camera={{ position: [0, 2.6, 6], fov: 45 }} dpr={[1, 1.5]} style={{ background: "#0B0E11" }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[3, 5, 3]} intensity={1.2} />
          <pointLight position={[-3, 2, 2]} color="#0ECB81" intensity={1} />
          <pointLight position={[3, 2, -2]} color="#F6465D" intensity={1} />
          <group position={[-1.3, 0, 0]}>
            <BotAssembly key={`a-${replayKey}`} profile={FIGHTER_A} accent="#0ECB81" assembling={assembling} />
          </group>
          <group position={[1.3, 0, 0]}>
            <BotAssembly key={`b-${replayKey}`} profile={FIGHTER_B} accent="#F6465D" assembling={assembling} />
          </group>
        </Canvas>
      </div>

      <div style={{ height: 480, border: "1px solid #1b1f27", borderRadius: 8, overflow: "hidden" }}>
        <MarqueeFight script={script} fighterA={FIGHTER_A} fighterB={FIGHTER_B} />
      </div>
    </div>
  );
}
