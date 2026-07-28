"use client";

import * as THREE from "three";
import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshReflectorMaterial, Grid } from "@react-three/drei";
import type { FighterProfile } from "@/lib/types";
import type { MarqueeScript, MarqueeFrame, MarqueeEvent } from "./types";
import { buildParts, botScale, type MatKind, type PrimGeom } from "./rig";

export interface MarqueeFightProps {
  script: MarqueeScript;
  fighterA: FighterProfile;
  fighterB: FighterProfile;
}

const ACCENT_A = "#3D7BFF";
const ACCENT_B = "#9B4DFF";
const ROSSO = "#D40000";
const BG = "#0B0E11";

const MAX_SPARKS = 60;
const SLOWMO_RATE = 0.25;
const SLOWMO_REAL_SECONDS = 0.6;

function GeomEl({ geom }: { geom: PrimGeom }) {
  if (geom.type === "box") return <boxGeometry args={geom.args} />;
  return <cylinderGeometry args={geom.args} />;
}

/** Static assembled bot body (no scatter animation) used inside the marquee replay. */
function BotBody({ profile, accent }: { profile: FighterProfile; accent: string }) {
  const scale = botScale(profile.weight_kg);
  const parts = useMemo(() => buildParts(profile.weapon_class, scale), [profile.weapon_class, scale]);

  // Real livery when scraped (profile.palette), else readable bright defaults.
  const chassisColor = profile.palette?.primary ?? "#454e60";
  const weaponColor = profile.palette?.accent ?? "#59637a";

  const metalMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: chassisColor,
      metalness: 0.7,
      roughness: 0.35,
      emissive: accent,
      emissiveIntensity: 0.12,
    }),
    [accent, chassisColor],
  );
  const accentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 1.8,
        metalness: 0.4,
        roughness: 0.3,
      }),
    [accent],
  );
  const weaponMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: weaponColor,
        metalness: 0.85,
        roughness: 0.22,
        emissive: accent,
        emissiveIntensity: 0.55,
      }),
    [accent, weaponColor],
  );
  const matFor = (kind: MatKind) => (kind === "metal" ? metalMat : kind === "accent" ? accentMat : weaponMat);

  const spinRefs = useRef<Array<THREE.Group | null>>([]);
  useFrame((_, delta) => {
    parts.forEach((p, i) => {
      if (!p.spin) return;
      const sr = spinRefs.current[i];
      if (sr) sr.rotation[p.spin.axis] += p.spin.speed * delta;
    });
  });

  return (
    <group>
      {parts.map((p, i) => (
        <group key={p.key} position={p.position} rotation={p.rotation ?? [0, 0, 0]}>
          <group ref={(el) => { spinRefs.current[i] = el; }}>
            <mesh material={matFor(p.material)}>
              <GeomEl geom={p.geom} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

function lerpFrames(fa: MarqueeFrame, fb: MarqueeFrame, alpha: number, side: "a" | "b") {
  const pa = fa[side].p;
  const pb = fb[side].p;
  const qa = fa[side].q;
  const qb = fb[side].q;
  const pos = new THREE.Vector3(pa[0], pa[1], pa[2]).lerp(new THREE.Vector3(pb[0], pb[1], pb[2]), alpha);
  const quat = new THREE.Quaternion(qa[0], qa[1], qa[2], qa[3]).slerp(
    new THREE.Quaternion(qb[0], qb[1], qb[2], qb[3]),
    alpha,
  );
  return { pos, quat };
}

interface SparkHandle {
  alive: boolean;
  age: number;
  lifetime: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

function SparkField({ triggerRef }: { triggerRef: React.MutableRefObject<THREE.Vector3 | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sparks = useRef<SparkHandle[]>(
    Array.from({ length: MAX_SPARKS }, () => ({
      alive: false,
      age: 0,
      lifetime: 0.5,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
    })),
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cursor = useRef(0);

  const spawn = (origin: THREE.Vector3, count: number) => {
    for (let n = 0; n < count; n++) {
      const s = sparks.current[cursor.current];
      if (!s) continue;
      s.alive = true;
      s.age = 0;
      s.lifetime = 0.35 + Math.random() * 0.25;
      s.pos.copy(origin);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 2 + Math.random() * 3;
      s.vel.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi)) * speed + 1,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      cursor.current = (cursor.current + 1) % MAX_SPARKS;
    }
  };

  useFrame((_, delta) => {
    if (triggerRef.current) {
      spawn(triggerRef.current, 14);
      triggerRef.current = null;
    }
    const mesh = meshRef.current;
    if (!mesh) return;
    sparks.current.forEach((s, i) => {
      if (!s.alive) {
        dummy.position.set(0, -9999, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        return;
      }
      s.age += delta;
      if (s.age >= s.lifetime) {
        s.alive = false;
        return;
      }
      s.vel.y -= 6 * delta;
      s.pos.addScaledVector(s.vel, delta);
      const life = 1 - s.age / s.lifetime;
      dummy.position.copy(s.pos);
      dummy.scale.setScalar(0.06 * life);
      dummy.rotation.set(s.age * 8, s.age * 6, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_SPARKS]} frustumCulled={false}>
      <tetrahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={3} />
    </instancedMesh>
  );
}

function KoSprite({ visible }: { visible: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 180px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = ROSSO;
      ctx.shadowColor = ROSSO;
      ctx.shadowBlur = 40;
      ctx.fillText("KO", canvas.width / 2, canvas.height / 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  if (!visible) return null;
  return (
    <sprite position={[0, 2.4, 0]} scale={[3.5, 1.75, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function Scene({ script, fighterA, fighterB }: MarqueeFightProps) {
  const { camera } = useThree();
  const aRef = useRef<THREE.Group>(null);
  const bRef = useRef<THREE.Group>(null);
  const aGlowRef = useRef<THREE.PointLight>(null);
  const bGlowRef = useRef<THREE.PointLight>(null);
  const sparkTrigger = useRef<THREE.Vector3 | null>(null);
  const [koVisible, setKoVisible] = useState(false);

  const simTime = useRef(0);
  const playbackRate = useRef(1);
  const slowmoUntil = useRef(0); // real-clock seconds
  const firedEvents = useRef<Set<number>>(new Set());
  const frozen = useRef(false);
  const orbitAngle = useRef(0);
  const punch = useRef(0);

  const hitThreshold = useMemo(() => {
    const mags: number[] = [];
    script.frames.forEach((f) => f.events?.forEach((e) => e.type === "hit" && mags.push(e.magnitude)));
    if (mags.length === 0) return Infinity;
    mags.sort((x, y) => x - y);
    const idx = Math.min(mags.length - 1, Math.floor(mags.length * 0.8));
    return mags[idx] ?? Infinity;
  }, [script]);

  useFrame((state, rawDelta) => {
    const frames = script.frames;
    if (frames.length < 2) return;

    const now = state.clock.getElapsedTime();

    // ease playback rate back toward 1 once slow-mo window has elapsed
    if (now > slowmoUntil.current) {
      playbackRate.current = THREE.MathUtils.lerp(playbackRate.current, 1, 0.08);
    }

    if (!frozen.current) {
      simTime.current += rawDelta * playbackRate.current;
    }
    if (simTime.current >= script.durationSec) {
      simTime.current = script.durationSec;
      frozen.current = true;
      setKoVisible(true);
    }

    // find bracketing frames
    let i = 0;
    while (i < frames.length - 2 && (frames[i + 1]?.t ?? Infinity) < simTime.current) i++;
    const fa = frames[i];
    const fb = frames[Math.min(i + 1, frames.length - 1)];
    if (!fa || !fb) return;
    const span = Math.max(fb.t - fa.t, 1e-6);
    const alpha = THREE.MathUtils.clamp((simTime.current - fa.t) / span, 0, 1);

    const a = lerpFrames(fa, fb, alpha, "a");
    const b = lerpFrames(fa, fb, alpha, "b");
    if (aRef.current) {
      aRef.current.position.copy(a.pos);
      aRef.current.quaternion.copy(a.quat);
    }
    if (bRef.current) {
      bRef.current.position.copy(b.pos);
      bRef.current.quaternion.copy(b.quat);
    }

    // fire events as sim time crosses them
    for (let idx = 0; idx <= i; idx++) {
      const frame = frames[idx];
      if (!frame?.events?.length || firedEvents.current.has(idx)) continue;
      if (frame.t > simTime.current) continue;
      firedEvents.current.add(idx);
      frame.events.forEach((ev: MarqueeEvent) => {
        if (ev.type === "hit") {
          sparkTrigger.current = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
          sparkTrigger.current.y += 0.4;
          if (ev.magnitude >= hitThreshold) {
            playbackRate.current = SLOWMO_RATE;
            slowmoUntil.current = now + SLOWMO_REAL_SECONDS;
            punch.current = 1;
          }
        } else if (ev.type === "launch") {
          punch.current = Math.max(punch.current, 0.6);
        } else if (ev.type === "ko") {
          frozen.current = true;
          setKoVisible(true);
        }
      });
    }

    // camera: slow auto-orbit, punch-in on big hits, slow orbit + focus winner on KO
    punch.current = THREE.MathUtils.lerp(punch.current, 0, 0.04);
    orbitAngle.current += rawDelta * (frozen.current ? 0.12 : 0.18);
    const focus = frozen.current ? (script.winner === "A" ? a.pos : b.pos) : new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
    const radius = (frozen.current ? 4.2 : 5.4) - punch.current * 1.6;
    camera.position.set(
      focus.x + Math.cos(orbitAngle.current) * radius,
      focus.y + 2.3 - punch.current * 0.8,
      focus.z + Math.sin(orbitAngle.current) * radius,
    );
    camera.lookAt(focus.x, focus.y + 0.5, focus.z);

    if (aGlowRef.current) aGlowRef.current.intensity = frozen.current && script.winner === "A" ? 6 : 1.5;
    if (bGlowRef.current) bGlowRef.current.intensity = frozen.current && script.winner === "B" ? 6 : 1.5;
  });

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 8, 28]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 8, 4]} intensity={1.8} />
      <pointLight ref={aGlowRef} position={[-3, 1.5, 2]} color={ACCENT_A} intensity={1.5} distance={6} />
      <pointLight ref={bGlowRef} position={[3, 1.5, -2]} color={ACCENT_B} intensity={1.5} distance={6} />
      <pointLight position={[-6, 0.5, 0]} color={ROSSO} intensity={2} distance={5} />
      <pointLight position={[6, 0.5, 0]} color={ROSSO} intensity={2} distance={5} />

      <group ref={aRef}>
        <BotBody profile={fighterA} accent={ACCENT_A} />
      </group>
      <group ref={bRef}>
        <BotBody profile={fighterB} accent={ACCENT_B} />
      </group>

      <SparkField triggerRef={sparkTrigger} />
      <KoSprite visible={koVisible} />

      <Grid
        position={[0, 0.002, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.4}
        cellColor="#1b2027"
        sectionSize={2.5}
        sectionThickness={0.8}
        sectionColor={ROSSO}
        fadeDistance={22}
        fadeStrength={1.2}
        infiniteGrid
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <MeshReflectorMaterial
          resolution={256}
          mixBlur={0.9}
          mixStrength={35}
          roughness={0.9}
          depthScale={0.4}
          minDepthThreshold={0.85}
          color="#05070a"
          metalness={0.6}
        />
      </mesh>
    </>
  );
}

export default function MarqueeFight({ script, fighterA, fighterB }: MarqueeFightProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      camera={{ fov: 45, near: 0.1, far: 100, position: [0, 3.2, 7.5] }}
      style={{ width: "100%", height: "100%", background: BG }}
    >
      <Scene script={script} fighterA={fighterA} fighterB={fighterB} />
    </Canvas>
  );
}
