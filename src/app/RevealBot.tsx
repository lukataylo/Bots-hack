"use client";

// Pre-fight reveal: the SAME parametric body the fight engine uses, on a turntable
// with the weapon spinning up. What you see here is exactly what enters the box.
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FighterProfile } from "@/lib/types";
import { specFor, type BotFrame } from "@/luka/sim";
import { Bot } from "@/luka/Bot";

function Turntable({ profile, color, glow }: { profile: FighterProfile; color: string; glow: string }) {
  const spec = useMemo(() => specFor(profile), [profile]);
  const frame = useRef<BotFrame>({ x: 0, z: 0, heading: 0, charge: 0, hpFrac: 1 });

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    frame.current.heading = t * 0.55;
    frame.current.charge = Math.min(0.45, t / 6); // slow menacing spin-up, keeps the weapon shape readable
  });

  return <Bot spec={spec} color={color} glow={glow} stateRef={frame} />;
}

export default function RevealBot({ profile, accent }: { profile: FighterProfile; accent: string }) {
  const color = profile.palette?.primary ?? accent;
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [1.9, 1.5, 2.6], fov: 38 }}
      gl={{ antialias: true }}
      onCreated={({ gl, scene, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        scene.background = new THREE.Color("#0d0716");
        camera.lookAt(0, 0.25, 0);
      }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow />
      <pointLight position={[-2.5, 1.2, -1.5]} color={accent} intensity={0.7} distance={8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[2.2, 48]} />
        <meshStandardMaterial color="#181028" metalness={0.4} roughness={0.7} />
      </mesh>
      <Turntable profile={profile} color={color} glow={accent} />
    </Canvas>
  );
}
