'use client';

// Marquee fight renderer. Replays a recorded bout from the simulator: the same
// run that produced the posted number, not a separate animation. Nothing here
// decides anything, it only draws what the physics already committed to.

import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BotFrame, BoutRecording, HitEvent } from '../core/sim';
import { Arena } from './Arena';
import { Bot } from './Bot';

export const CORNER_A = '#c8452a';
export const CORNER_B = '#2f6fa8';

const SLOWMO_SEC = 0.55; // wall-clock hold after a hit
const SLOWMO_RATE = 0.25;
const HUD_HZ = 10;

export interface Tick { t: number; hpA: number; hpB: number; hits: number }

export interface FightSceneProps {
  recording: BoutRecording;
  playing?: boolean;
  /** Replay counter. Bump it to restart the bout from zero. */
  runKey?: number;
  onTick?: (t: Tick) => void;
  onEnd?: () => void;
}

export function FightScene({ recording, playing = true, runKey = 0, onTick, onEnd }: FightSceneProps) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: [0, 12, 15], fov: 42 }}
      gl={{ antialias: true }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.background = new THREE.Color('#0d0e10');
        scene.fog = new THREE.Fog('#0d0e10', 26, 52);
      }}
    >
      <Arena />
      <Replay recording={recording} playing={playing} runKey={runKey} onTick={onTick} onEnd={onEnd} />
    </Canvas>
  );
}

function Replay({ recording, playing, runKey, onTick, onEnd }: Required<Pick<FightSceneProps, 'recording' | 'playing' | 'runKey'>> & Pick<FightSceneProps, 'onTick' | 'onEnd'>) {
  const { frames, hits, specA, specB } = recording;
  const a = useRef<BotFrame>({ ...frames[0].a });
  const b = useRef<BotFrame>({ ...frames[0].b });
  const sparks = useRef<SparksHandle>(null);

  // The fight is the content, so it always plays. The camera shake is decoration.
  const calm = useRef(false);
  useEffect(() => {
    calm.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const clock = useRef(0);
  const cursor = useRef(0); // frame index, monotonic
  const hitCursor = useRef(0);
  const slowmo = useRef(0);
  const shake = useRef(0);
  const hudAt = useRef(0);
  const ended = useRef(false);
  const flash = useRef<THREE.PointLight>(null);
  const duration = frames[frames.length - 1].t;

  // restart on replay
  useEffect(() => {
    clock.current = 0; cursor.current = 0; hitCursor.current = 0;
    slowmo.current = 0; shake.current = 0; ended.current = false;
    Object.assign(a.current, frames[0].a);
    Object.assign(b.current, frames[0].b);
    sparks.current?.reset();
  }, [runKey, frames]);

  function onHit(h: HitEvent) {
    const punch = Math.min(1, h.energy / 55);
    if (punch < 0.12 && !h.catastrophic) return; // ignore taps, keep the big ones loud
    sparks.current?.burst(h.x, h.z, Math.round(8 + punch * 26), punch);
    shake.current = calm.current ? 0 : Math.min(0.32, 0.09 + punch * 0.3);
    slowmo.current = h.catastrophic ? SLOWMO_SEC * 1.8 : SLOWMO_SEC * punch;
    if (flash.current) {
      flash.current.position.set(h.x, 0.6, h.z);
      flash.current.intensity = 40 + punch * 130;
    }
  }

  useFrame((state, dt) => {
    const step = Math.min(dt, 0.05);
    if (playing && !ended.current) {
      slowmo.current = Math.max(0, slowmo.current - step);
      clock.current += step * (slowmo.current > 0 ? SLOWMO_RATE : 1);
    }
    const t = Math.min(clock.current, duration);

    // advance to the bracketing frames and lerp between them
    while (cursor.current < frames.length - 2 && frames[cursor.current + 1].t <= t) cursor.current++;
    const f0 = frames[cursor.current], f1 = frames[cursor.current + 1] ?? f0;
    const span = f1.t - f0.t;
    const k = span > 0 ? Math.min(1, (t - f0.t) / span) : 0;
    lerpFrame(a.current, f0.a, f1.a, k);
    lerpFrame(b.current, f0.b, f1.b, k);

    // fire every hit the sim recorded, in order
    while (hitCursor.current < hits.length && hits[hitCursor.current].t <= t) {
      const h = hits[hitCursor.current++];
      onHit(h);
    }

    if (flash.current) flash.current.intensity = Math.max(0, flash.current.intensity - step * 260);
    shake.current = Math.max(0, shake.current - step * 2.2);
    cameraWork(state.camera, a.current, b.current, slowmo.current > 0, shake.current, step);

    if (onTick && state.clock.elapsedTime - hudAt.current > 1 / HUD_HZ) {
      hudAt.current = state.clock.elapsedTime;
      onTick({ t, hpA: a.current.hpFrac, hpB: b.current.hpFrac, hits: hitCursor.current });
    }
    if (!ended.current && t >= duration) { ended.current = true; onEnd?.(); }
  });


  return (
    <>
      <Bot spec={specA} color={CORNER_A} stateRef={a} />
      <Bot spec={specB} color={CORNER_B} stateRef={b} />
      <pointLight ref={flash} color="#ffc98a" intensity={0} distance={9} />
      <Sparks ref={sparks} />
    </>
  );
}

function lerpFrame(out: BotFrame, p: BotFrame, q: BotFrame, k: number) {
  out.x = p.x + (q.x - p.x) * k;
  out.z = p.z + (q.z - p.z) * k;
  out.charge = p.charge + (q.charge - p.charge) * k;
  out.hpFrac = p.hpFrac + (q.hpFrac - p.hpFrac) * k;
  // headings wrap; take the short way round or the bot spins on its own axis
  let d = q.heading - p.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  out.heading = p.heading + d * k;
}

const camTarget = new THREE.Vector3();
const camWant = new THREE.Vector3();

/** Broadcast camera: frames both bots, pushes in for the slow-mo. */
function cameraWork(cam: THREE.Camera, a: BotFrame, b: BotFrame, slow: boolean, shake: number, dt: number) {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const spread = Math.hypot(a.x - b.x, a.z - b.z);
  const dist = slow ? 6.5 : 9.5 + spread * 0.5;
  const height = slow ? 3.6 : 6.2 + spread * 0.28;

  camWant.set(mx * 0.62, height, mz * 0.62 + dist);
  cam.position.lerp(camWant, Math.min(1, dt * (slow ? 4.5 : 1.9)));
  if (shake > 0) {
    cam.position.x += (Math.random() - 0.5) * shake;
    cam.position.y += (Math.random() - 0.5) * shake;
  }
  camTarget.set(mx * 0.7, 0.5, mz * 0.7);
  cam.lookAt(camTarget);
}

// ---------------------------------------------------------------------------
// Sparks. One instanced pool, no allocation during the fight.
// ---------------------------------------------------------------------------

interface SparksHandle { burst(x: number, z: number, n: number, punch: number): void; reset(): void }

const POOL = 260;

type Pool = ReturnType<typeof makePool>;

function makePool() {
  return {
    x: new Float32Array(POOL), y: new Float32Array(POOL), z: new Float32Array(POOL),
    vx: new Float32Array(POOL), vy: new Float32Array(POOL), vz: new Float32Array(POOL),
    life: new Float32Array(POOL), size: new Float32Array(POOL),
    dummy: new THREE.Object3D(),
    next: 0,
  };
}

function Sparks({ ref }: { ref: React.RefObject<SparksHandle | null> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  // Allocated on first use inside a callback, never touched during render, so the
  // per-frame mutation below stays legal.
  const pool = useRef<Pool>(undefined);
  const get = () => (pool.current ??= makePool());

  useEffect(() => {
    ref.current = {
      burst(x, z, n, punch) {
        const p = get();
        for (let i = 0; i < n; i++) {
          const j = p.next++ % POOL;
          const a = Math.random() * Math.PI * 2;
          const speed = 2.5 + Math.random() * 7 * (0.5 + punch);
          p.x[j] = x; p.y[j] = 0.3 + Math.random() * 0.35; p.z[j] = z;
          p.vx[j] = Math.cos(a) * speed;
          p.vz[j] = Math.sin(a) * speed;
          p.vy[j] = 2.5 + Math.random() * 5 * (0.5 + punch);
          p.life[j] = 0.35 + Math.random() * 0.5;
          p.size[j] = 0.035 + Math.random() * 0.05 * (0.5 + punch);
        }
      },
      reset() { get().life.fill(0); },
    };
  }, [ref]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const p = get(), dummy = p.dummy;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < POOL; i++) {
      if (p.life[i] <= 0) { dummy.scale.setScalar(0); dummy.position.set(0, -50, 0); }
      else {
        p.life[i] -= step;
        p.vy[i] -= 22 * step; // gravity
        p.x[i] += p.vx[i] * step; p.y[i] += p.vy[i] * step; p.z[i] += p.vz[i] * step;
        if (p.y[i] < 0.03) { p.y[i] = 0.03; p.vy[i] *= -0.35; p.vx[i] *= 0.7; p.vz[i] *= 0.7; }
        dummy.position.set(p.x[i], p.y[i], p.z[i]);
        dummy.scale.setScalar(p.size[i] * Math.max(0.2, p.life[i] * 2));
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#ffb35c" toneMapped={false} />
    </instancedMesh>
  );
}
