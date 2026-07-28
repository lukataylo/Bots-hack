'use client';

// The BattleBox. Steel floor, lexan walls, corner posts, live killsaws and a
// wall pulverizer. Static geometry apart from the hazards, so it is built once
// and never re-renders.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_HALF } from '../core/sim';

const HALF = ARENA_HALF + 0.3; // wall line sits just outside the fighting area
const WALL_H = 2.6;

export function Arena() {
  return (
    <group>
      <Lights />

      {/* floor */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[HALF * 2, 0.2, HALF * 2]} />
        <meshStandardMaterial color="#26282b" metalness={0.55} roughness={0.62} />
      </mesh>
      <gridHelper args={[HALF * 2, 28, '#3a3d41', '#303336']} position={[0, 0.002, 0]} />

      {/* the square everyone fights inside */}
      <lineSegments position={[0, 0.004, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2).rotateX(-Math.PI / 2)]} />
        <lineBasicMaterial color="#c8952a" />
      </lineSegments>

      {[0, 1, 2, 3].map((i) => <Wall key={i} side={i} />)}
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <mesh key={`${x}${z}`} position={[x * HALF, WALL_H / 2, z * HALF]} castShadow>
          <boxGeometry args={[0.6, WALL_H, 0.6]} />
          <meshStandardMaterial color="#17181a" metalness={0.5} roughness={0.7} />
        </mesh>
      )))}

      <Killsaw x={-2.1} />
      <Killsaw x={2.1} />
      <Pulverizer />
    </group>
  );
}

function Wall({ side }: { side: number }) {
  const a = (side * Math.PI) / 2;
  const pos: [number, number, number] = [Math.sin(a) * HALF, WALL_H / 2, Math.cos(a) * HALF];
  return (
    <group position={pos} rotation={[0, a, 0]}>
      {/* lexan */}
      <mesh>
        <boxGeometry args={[HALF * 2, WALL_H, 0.12]} />
        <meshStandardMaterial color="#8fb4c8" transparent opacity={0.13} metalness={0.1} roughness={0.05} />
      </mesh>
      {/* steel kickplate, the bit that takes the hits */}
      <mesh position={[0, -WALL_H / 2 + 0.32, 0]} receiveShadow>
        <boxGeometry args={[HALF * 2, 0.64, 0.2]} />
        <meshStandardMaterial color="#1e2022" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh position={[0, WALL_H / 2, 0]}>
        <boxGeometry args={[HALF * 2, 0.14, 0.26]} />
        <meshStandardMaterial color="#c8952a" metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Killsaw({ x }: { x: number }) {
  const saw = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (saw.current) saw.current.rotation.x += 26 * dt; });
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.28, 1.5]} />
        <meshStandardMaterial color="#111214" />
      </mesh>
      <group ref={saw} position={[0, -0.32, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.62, 0.62, 0.06, 20]} />
          <meshStandardMaterial color="#b9c0c6" metalness={0.95} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

function Pulverizer() {
  const arm = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (arm.current) arm.current.rotation.x = -1.0 + Math.sin(state.clock.elapsedTime * 1.6) * 0.55;
  });
  return (
    <group position={[0, WALL_H - 0.2, -HALF + 0.35]}>
      <group ref={arm}>
        <mesh position={[0, 0, 0.55]} castShadow>
          <boxGeometry args={[0.16, 0.16, 1.3]} />
          <meshStandardMaterial color="#8b9096" metalness={0.8} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 1.25]} castShadow>
          <boxGeometry args={[0.55, 0.42, 0.42]} />
          <meshStandardMaterial color="#c9ced3" metalness={0.95} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#cdd6de', '#191a1c', 0.5]} />
      <directionalLight
        position={[6, 14, 8]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <directionalLight position={[-9, 10, -6]} intensity={0.85} color="#b9cfe0" />
      <pointLight position={[0, 6, 6]} intensity={22} distance={26} color="#ffe3c4" />
    </>
  );
}
