"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { FighterProfile } from "@/lib/types";
import { buildParts, botScale, clamp, seeded, type MatKind, type PrimGeom } from "./rig";

export interface BotAssemblyProps {
  profile: FighterProfile;
  accent: "#0ECB81" | "#F6465D";
  assembling?: boolean;
}

const ASSEMBLE_DURATION = 1.5;

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function GeomEl({ geom }: { geom: PrimGeom }) {
  if (geom.type === "box") return <boxGeometry args={geom.args} />;
  return <cylinderGeometry args={geom.args} />;
}

export default function BotAssembly({ profile, accent, assembling = false }: BotAssemblyProps) {
  const scale = botScale(profile.weight_kg);
  const parts = useMemo(() => buildParts(profile.weapon_class, scale), [profile.weapon_class, scale]);

  const metalMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: "#454e60",
      metalness: 0.7,
      roughness: 0.35,
      emissive: accent,
      emissiveIntensity: 0.12,
    }),
    [accent],
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
        color: "#59637a",
        metalness: 0.85,
        roughness: 0.22,
        emissive: accent,
        emissiveIntensity: 0.8,
      }),
    [accent],
  );
  const matFor = (kind: MatKind) => (kind === "metal" ? metalMat : kind === "accent" ? accentMat : weaponMat);

  // per-part scatter offsets (stable for the lifetime of this part list)
  const scatter = useMemo(
    () =>
      parts.map((p, i) => {
        const ang = seeded(i, 1) * Math.PI * 2;
        const dist = 1.8 + seeded(i, 2) * 2.2;
        const height = seeded(i, 3) * 3 + 1;
        return {
          offset: new THREE.Vector3(Math.cos(ang) * dist, height, Math.sin(ang) * dist),
          rot: new THREE.Euler(seeded(i, 4) * Math.PI * 2, seeded(i, 5) * Math.PI * 2, seeded(i, 6) * Math.PI * 2),
        };
      }),
    [parts],
  );

  const groupRefs = useRef<Array<THREE.Group | null>>([]);
  const spinRefs = useRef<Array<THREE.Group | null>>([]);
  const assembleStart = useRef<number | null>(null);
  const wasAssembling = useRef(false);

  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();

    if (assembling && !wasAssembling.current) {
      assembleStart.current = elapsed;
    }
    wasAssembling.current = assembling;

    let t = 1;
    if (assembling) {
      const start = assembleStart.current ?? elapsed;
      t = clamp((elapsed - start) / ASSEMBLE_DURATION, 0, 1);
    }
    const eased = assembling ? easeOutBack(t) : 1;
    const settled = t >= 1;

    parts.forEach((p, i) => {
      const g = groupRefs.current[i];
      if (!g) return;
      const s = scatter[i];
      if (!s) return;
      const fx = p.position[0];
      const fy = p.position[1];
      const fz = p.position[2];
      if (assembling && !settled) {
        g.position.set(
          THREE.MathUtils.lerp(fx + s.offset.x, fx, eased),
          THREE.MathUtils.lerp(fy + s.offset.y, fy, eased),
          THREE.MathUtils.lerp(fz + s.offset.z, fz, eased),
        );
        const rx = p.rotation?.[0] ?? 0;
        const ry = p.rotation?.[1] ?? 0;
        const rz = p.rotation?.[2] ?? 0;
        g.rotation.set(
          THREE.MathUtils.lerp(rx + s.rot.x, rx, eased),
          THREE.MathUtils.lerp(ry + s.rot.y, ry, eased),
          THREE.MathUtils.lerp(rz + s.rot.z, rz, eased),
        );
      } else {
        g.position.set(fx, fy, fz);
        let rx = p.rotation?.[0] ?? 0;
        const ry = p.rotation?.[1] ?? 0;
        const rz = p.rotation?.[2] ?? 0;
        if (p.idleAmp) rx += Math.sin(elapsed * 1.4 + i) * p.idleAmp;
        g.rotation.set(rx, ry, rz);
      }

      if (p.spin) {
        const sr = spinRefs.current[i];
        if (sr) {
          sr.rotation[p.spin.axis] += p.spin.speed * delta * (settled || !assembling ? 1 : eased);
        }
      }
    });
  });

  return (
    <group>
      {parts.map((p, i) => (
        <group key={p.key} ref={(el) => { groupRefs.current[i] = el; }}>
          <group ref={(el) => { spinRefs.current[i] = el; }}>
            <mesh material={matFor(p.material)} castShadow receiveShadow>
              <GeomEl geom={p.geom} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
