"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { FighterProfile } from "@/lib/types";
import { buildParts, botScale, clamp, seeded, type PartSpec, type PrimGeom } from "./rig";

export interface BotAssemblyProps {
  profile: FighterProfile;
  accent: string;
  assembling?: boolean;
}

const ASSEMBLE_DURATION = 1.5;

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function GeomEl({ geom }: { geom: PrimGeom }) {
  switch (geom.type) {
    case "box":
      return <boxGeometry args={geom.args} />;
    case "cone":
      return <coneGeometry args={geom.args} />;
    case "sphere":
      return <sphereGeometry args={geom.args} />;
    case "torus":
      return <torusGeometry args={geom.args} />;
    default:
      return <cylinderGeometry args={geom.args} />;
  }
}

export default function BotAssembly({ profile, accent, assembling = false }: BotAssemblyProps) {
  const scale = botScale(profile.weight_kg);
  const parts = useMemo(
    () => buildParts(profile.weapon_class, scale, profile.name),
    [profile.weapon_class, scale, profile.name],
  );

  // Real livery when the scrape found one: chassis wears the bot's actual dominant color,
  // weapon its secondary. Team accent stays on trim/glow so sides remain readable.
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
        emissiveIntensity: 0.8,
      }),
    [accent, weaponColor],
  );
  // Signature rigs paint their own parts; scraped-palette materials stay the fallback.
  const liveryMats = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), [accent]);
  const matFor = (p: PartSpec) => {
    if (!p.color) return p.material === "metal" ? metalMat : p.material === "accent" ? accentMat : weaponMat;
    const key = `${p.color}|${p.material}`;
    let m = liveryMats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: p.color,
        metalness: p.material === "weapon" ? 0.9 : 0.5,
        roughness: p.material === "weapon" ? 0.2 : 0.45,
        emissive: accent,
        emissiveIntensity: p.material === "accent" ? 0.22 : 0,
      });
      liveryMats.set(key, m);
    }
    return m;
  };

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
        // shared phase so multi-part assemblies (jaws, axe arms) swing as one
        if (p.idleAmp) rx += Math.sin(elapsed * 1.4) * p.idleAmp;
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
            <mesh material={matFor(p)} castShadow receiveShadow>
              <GeomEl geom={p.geom} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
