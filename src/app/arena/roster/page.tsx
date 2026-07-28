"use client";

// Dev-only contact sheet for the signature rigs in src/three/rig.ts.
import dynamic from "next/dynamic";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { FighterProfile, WeaponArchetype } from "@/lib/types";

const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), { ssr: false });
const BotAssembly = dynamic(() => import("@/three/BotAssembly"), { ssr: false });

const ROSTER: Array<[string, WeaponArchetype, number]> = [
  ["Chopper", "hammer", 110],
  ["Diablo", "vertical_spinner", 110],
  ["Hypershock", "vertical_spinner", 110],
  ["Bronco", "flipper", 110],
  ["Kraken", "crusher", 110],
  ["Malice", "horizontal_spinner", 110],
  ["Mammoth", "other", 110],
  ["Nightmare", "vertical_spinner", 110],
  ["Overkill", "hammer", 110],
  ["Tazbot", "other", 110],
];

function profileFor(name: string, weapon: WeaponArchetype, kg: number): FighterProfile {
  return { name, weapon_class: weapon, weight_kg: kg, wins: 0, losses: 0, ko_wins: 0, failure_pattern: null, source_urls: [] };
}

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.45;
  });
  return <group ref={ref}>{children}</group>;
}

export default function RosterPage() {
  return (
    <main style={{ background: "#0B0E11", color: "#E8EAED", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Signature rigs</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {ROSTER.map(([name, weapon, kg], i) => (
          <figure key={name} style={{ margin: 0, background: "#12161c", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ height: 240 }}>
              <Canvas dpr={[1, 1.5]} camera={{ fov: 40, position: [3.4, 2.4, 4.2] }}>
                <ambientLight intensity={1.1} />
                <directionalLight position={[4, 8, 5]} intensity={2.2} />
                <directionalLight position={[-5, 3, -4]} intensity={0.9} color="#7fb3ff" />
                <Turntable>
                  <BotAssembly profile={profileFor(name, weapon, kg)} accent={i % 2 ? "#F6465D" : "#0ECB81"} />
                </Turntable>
              </Canvas>
            </div>
            <figcaption style={{ padding: "8px 12px", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>
              {name} <span style={{ opacity: 0.5 }}>{weapon.replace(/_/g, " ")}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
