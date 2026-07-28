'use client';

// Parametric fighting robot. There are no models in this project: the scraped
// spec IS the body. Weapon archetype picks the rig, weight class scales the
// chassis, the fight record has already been folded into the spec by specFor().
//
// ponytail: primitives only, no GLTF pipeline. A boxed chassis with the right
// weapon silhouette reads correctly at stage distance and costs zero asset
// budget. Swap in real models per bot only if the room is close enough to care.

import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BotSpec, BotFrame } from './sim';

const CHARRED = new THREE.Color('#2b2422');
const MAX_SPIN = 42; // rad/s at full charge

export interface BotProps {
  spec: BotSpec;
  color: string;
  /** Live playback state, written by the scene each frame. Never triggers React. */
  stateRef: RefObject<BotFrame>;
}

export function Bot({ spec, color, stateRef }: BotProps) {
  const group = useRef<THREE.Group>(null);
  const weapon = useRef<THREE.Group>(null);
  const shell = useRef<THREE.MeshStandardMaterial>(null);
  const base = useRef(new THREE.Color(color));
  const tmp = useRef(new THREE.Color());
  const spun = useRef(0);

  const s = spec.radius / 0.55; // 1.0 at heavyweight
  const spins = spec.archetype === 'horizontal_spinner'
    || spec.archetype === 'vertical_spinner'
    || spec.archetype === 'drum';

  useFrame((_, dt) => {
    const f = stateRef.current;
    const g = group.current;
    if (!g || !f) return;

    g.position.set(f.x, 0, f.z);
    g.rotation.y = f.heading;

    // Below a third health the drive is limping and the chassis is smoking.
    const hurt = 1 - Math.min(1, f.hpFrac / 0.35);
    if (hurt > 0) {
      g.position.y = Math.sin(spun.current * 9) * 0.012 * hurt;
      g.rotation.z = Math.sin(spun.current * 7.3) * 0.05 * hurt;
    }
    spun.current += dt;

    if (weapon.current) {
      if (spins) weapon.current.rotation.y += f.charge * MAX_SPIN * dt;
      // Wind-up weapons store the same charge as an angle, so the snap forward
      // after a hit falls out of the sim for free.
      else weapon.current.rotation.x = -f.charge * 1.15;
    }
    if (shell.current) {
      shell.current.color.copy(tmp.current.copy(base.current).lerp(CHARRED, 1 - f.hpFrac));
    }
  });

  return (
    <group ref={group}>
      {/* chassis */}
      <mesh position={[0, 0.2 * s, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.05 * s, 0.3 * s, 1.3 * s]} />
        <meshStandardMaterial ref={shell} color={color} metalness={0.75} roughness={0.42} />
      </mesh>

      {/* wedge / ground game plate — the bots that win the floor look like it */}
      {spec.control >= 0.7 && (
        <mesh position={[0, 0.11 * s, 0.78 * s]} rotation={[-0.42, 0, 0]} castShadow>
          <boxGeometry args={[1.25 * s, 0.045 * s, 0.72 * s]} />
          <meshStandardMaterial color="#9aa2a8" metalness={0.9} roughness={0.28} />
        </mesh>
      )}

      {/* wheels */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh
          key={`${sx}${sz}`}
          position={[sx * 0.56 * s, 0.17 * s, sz * 0.42 * s]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.17 * s, 0.17 * s, 0.14 * s, 14]} />
          <meshStandardMaterial color="#1b1b1e" metalness={0.2} roughness={0.85} />
        </mesh>
      )))}

      <group ref={weapon} position={weaponAnchor(spec, s)}>
        <Weapon spec={spec} s={s} />
      </group>
    </group>
  );
}

function weaponAnchor(spec: BotSpec, s: number): [number, number, number] {
  switch (spec.archetype) {
    case 'horizontal_spinner': return [0, 0.46 * s, 0];
    case 'vertical_spinner': return [0, 0.34 * s, 0.62 * s];
    case 'drum': return [0, 0.26 * s, 0.7 * s];
    case 'flipper':
    case 'lifter': return [0, 0.16 * s, 0.6 * s];
    case 'hammer': return [0, 0.42 * s, -0.35 * s];
    case 'crusher': return [0, 0.38 * s, 0.2 * s];
    default: return [0, 0.32 * s, 0.55 * s];
  }
}

const STEEL = { color: '#c9ced3', metalness: 0.95, roughness: 0.22 } as const;

function Weapon({ spec, s }: { spec: BotSpec; s: number }) {
  switch (spec.archetype) {
    // The undercutter bar. Long, blunt, and wider than the bot it is bolted to.
    case 'horizontal_spinner':
      return (
        <>
          <mesh castShadow>
            <boxGeometry args={[2.3 * s, 0.13 * s, 0.24 * s]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
          {[-1, 1].map((d) => (
            <mesh key={d} position={[d * 1.12 * s, 0, 0]} castShadow>
              <boxGeometry args={[0.2 * s, 0.2 * s, 0.3 * s]} />
              <meshStandardMaterial {...STEEL} roughness={0.35} />
            </mesh>
          ))}
        </>
      );

    case 'vertical_spinner':
      return (
        <>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.44 * s, 0.44 * s, 0.17 * s, 22]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2;
            return (
              <mesh key={i} position={[0, Math.sin(a) * 0.44 * s, Math.cos(a) * 0.44 * s]} rotation={[-a, 0, 0]} castShadow>
                <boxGeometry args={[0.19 * s, 0.16 * s, 0.16 * s]} />
                <meshStandardMaterial {...STEEL} roughness={0.3} />
              </mesh>
            );
          })}
        </>
      );

    case 'drum':
      return (
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.27 * s, 0.27 * s, 0.92 * s, 8]} />
          <meshStandardMaterial {...STEEL} roughness={0.33} />
        </mesh>
      );

    // Flipper and lifter share a plate; the flipper just throws harder.
    case 'flipper':
    case 'lifter':
      return (
        <mesh position={[0, 0, 0.28 * s]} castShadow>
          <boxGeometry args={[0.95 * s, 0.07 * s, 0.8 * s]} />
          <meshStandardMaterial {...STEEL} roughness={0.3} />
        </mesh>
      );

    case 'hammer':
      return (
        <>
          <mesh position={[0, 0, 0.55 * s]} castShadow>
            <boxGeometry args={[0.11 * s, 0.11 * s, 1.15 * s]} />
            <meshStandardMaterial color="#8b9096" metalness={0.85} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 1.15 * s]} castShadow>
            <boxGeometry args={[0.3 * s, 0.3 * s, 0.34 * s]} />
            <meshStandardMaterial {...STEEL} roughness={0.3} />
          </mesh>
        </>
      );

    case 'crusher':
      return (
        <>
          <mesh position={[0, 0.1 * s, 0.55 * s]} rotation={[0.25, 0, 0]} castShadow>
            <boxGeometry args={[0.18 * s, 0.13 * s, 1.05 * s]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
          <mesh position={[0, -0.14 * s, 0.55 * s]} castShadow>
            <boxGeometry args={[0.5 * s, 0.1 * s, 1.0 * s]} />
            <meshStandardMaterial color="#9aa2a8" metalness={0.9} roughness={0.3} />
          </mesh>
        </>
      );

    case 'multibot':
      return (
        <mesh position={[0.85 * s, -0.1 * s, -0.4 * s]} castShadow>
          <boxGeometry args={[0.42 * s, 0.24 * s, 0.5 * s]} />
          <meshStandardMaterial color="#7d8489" metalness={0.7} roughness={0.5} />
        </mesh>
      );

    case 'wedge':
      return null; // the plate on the chassis is the whole weapon

    default:
      return (
        <mesh castShadow>
          <boxGeometry args={[0.7 * s, 0.16 * s, 0.3 * s]} />
          <meshStandardMaterial {...STEEL} roughness={0.4} />
        </mesh>
      );
  }
}
