import type { FighterProfile } from "@/lib/types";

export type PrimGeom =
  | { type: "box"; args: [number, number, number] }
  | { type: "cylinder"; args: [number, number, number, number] };

export type MatKind = "metal" | "accent" | "weapon";

// Optional semantic tag so downstream renderers (MarqueeFight) can single out
// specific parts for event-driven animation (flipper fire, hammer swing)
// without changing the PartSpec/BotAssembly contract.
export type PartRole = "flipper-plate" | "hammer-arm" | "hammer-head" | "wheel";

export interface PartSpec {
  key: string;
  geom: PrimGeom;
  position: [number, number, number];
  rotation?: [number, number, number];
  material: MatKind;
  spin?: { axis: "x" | "y" | "z"; speed: number };
  idleAmp?: number;
  role?: PartRole;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export function botScale(weightKg: number | null): number {
  return clamp(Math.cbrt((weightKg ?? 110) / 110), 0.55, 1.7);
}

// deterministic pseudo-random per index so poses are stable across renders
export function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Four corner wheels + a wedge-beveled chassis nose, shared by every archetype
 * except multibot (which builds its own mini-chassis + mini-wheels instead). */
function baseChassis(bw: number, bh: number, bd: number, scale: number): PartSpec[] {
  const wheelR = bh * 0.42;
  const wheelW = 0.1 * scale;
  const wheelY = wheelR * 0.85;
  const wheelX = bw / 2 + wheelW * 0.4;
  const wheelZ = bd * 0.34;

  const wheel = (key: string, x: number, z: number): PartSpec => ({
    key,
    geom: { type: "cylinder", args: [wheelR, wheelR, wheelW, 14] },
    position: [x, wheelY, z],
    rotation: [0, 0, Math.PI / 2],
    material: "metal",
    spin: { axis: "y", speed: 9 },
    role: "wheel",
  });

  return [
    { key: "chassis", geom: { type: "box", args: [bw, bh, bd] }, position: [0, bh / 2 + wheelY - wheelR, 0], material: "metal" },
    {
      key: "chassis-nose",
      geom: { type: "box", args: [bw * 0.9, bh * 0.6, bd * 0.22] },
      position: [0, bh * 0.55 + wheelY - wheelR, bd / 2 + bd * 0.08],
      rotation: [-0.32, 0, 0],
      material: "metal",
    },
    {
      key: "trim-l",
      geom: { type: "box", args: [0.04 * scale, bh * 0.5, bd * 0.9] },
      position: [-bw / 2 - 0.02 * scale, bh / 2 + wheelY - wheelR, 0],
      material: "accent",
    },
    {
      key: "trim-r",
      geom: { type: "box", args: [0.04 * scale, bh * 0.5, bd * 0.9] },
      position: [bw / 2 + 0.02 * scale, bh / 2 + wheelY - wheelR, 0],
      material: "accent",
    },
    wheel("wheel-fl", -wheelX, wheelZ),
    wheel("wheel-fr", wheelX, wheelZ),
    wheel("wheel-rl", -wheelX, -wheelZ),
    wheel("wheel-rr", wheelX, -wheelZ),
  ];
}

export function buildParts(weaponClass: FighterProfile["weapon_class"], scale: number): PartSpec[] {
  const bw = 1.5 * scale;
  const bh = 0.5 * scale;
  const bd = 1.0 * scale;
  const wheelR = bh * 0.42;
  const baseY = wheelR * 0.85 - wheelR; // wheel-derived lift, mirrors baseChassis math

  if (weaponClass === "multibot") {
    const mw = bw * 0.5;
    const mh = bh * 0.9;
    const md = bd * 0.75;
    const wr = mh * 0.4;
    const miniWheel = (key: string, cx: number, z: number): PartSpec => ({
      key,
      geom: { type: "cylinder", args: [wr, wr, 0.08 * scale, 12] },
      position: [cx, wr * 0.9, z],
      rotation: [0, 0, Math.PI / 2],
      material: "metal",
      spin: { axis: "y", speed: 10 },
      role: "wheel",
    });
    return [
      { key: "mini-a", geom: { type: "box", args: [mw, mh, md] }, position: [-bw * 0.42, mh / 2 + wr * 0.4, 0], material: "metal" },
      { key: "mini-b", geom: { type: "box", args: [mw, mh, md] }, position: [bw * 0.42, mh / 2 + wr * 0.4, 0], material: "metal" },
      {
        key: "mini-a-trim",
        geom: { type: "box", args: [mw * 0.92, 0.04 * scale, 0.06 * scale] },
        position: [-bw * 0.42, mh * 0.86 + wr * 0.4, md * 0.4],
        material: "accent",
      },
      {
        key: "mini-b-trim",
        geom: { type: "box", args: [mw * 0.92, 0.04 * scale, 0.06 * scale] },
        position: [bw * 0.42, mh * 0.86 + wr * 0.4, md * 0.4],
        material: "accent",
      },
      {
        key: "mini-a-spike",
        geom: { type: "box", args: [mw * 0.2, mh * 0.3, mw * 0.2] },
        position: [-bw * 0.42, mh + wr * 0.4, md * 0.45],
        material: "weapon",
      },
      {
        key: "mini-b-spike",
        geom: { type: "box", args: [mw * 0.2, mh * 0.3, mw * 0.2] },
        position: [bw * 0.42, mh + wr * 0.4, md * 0.45],
        material: "weapon",
      },
      miniWheel("mini-a-wheel-f", -bw * 0.42, md * 0.32),
      miniWheel("mini-a-wheel-r", -bw * 0.42, -md * 0.32),
      miniWheel("mini-b-wheel-f", bw * 0.42, md * 0.32),
      miniWheel("mini-b-wheel-r", bw * 0.42, -md * 0.32),
    ];
  }

  const parts: PartSpec[] = baseChassis(bw, bh, bd, scale);
  const topY = bh + baseY; // top surface of the chassis box, ground-relative

  switch (weaponClass) {
    case "horizontal_spinner": {
      const r = 0.85 * scale;
      const cy = topY + r * 0.35;
      parts.push({
        key: "mast",
        geom: { type: "box", args: [0.12 * scale, 0.5 * scale, 0.12 * scale] },
        position: [0, topY + 0.25 * scale, -bd * 0.15],
        material: "metal",
      });
      parts.push({
        key: "motor-block",
        geom: { type: "box", args: [0.32 * scale, 0.24 * scale, 0.32 * scale] },
        position: [0, topY + 0.5 * scale, -bd * 0.15],
        material: "accent",
      });
      parts.push({
        key: "disc",
        geom: { type: "cylinder", args: [r, r, 0.08 * scale, 24] },
        position: [0, cy, bd / 2 + r * 0.35],
        material: "weapon",
        spin: { axis: "y", speed: 26 },
      });
      parts.push({
        key: "disc-edge",
        geom: { type: "cylinder", args: [r * 1.01, r * 1.01, 0.02 * scale, 24] },
        position: [0, cy, bd / 2 + r * 0.35],
        material: "accent",
        spin: { axis: "y", speed: 26 },
      });
      parts.push({
        key: "tooth-a",
        geom: { type: "box", args: [0.1 * scale, 0.1 * scale, 0.1 * scale] },
        position: [r * 0.9, cy, bd / 2 + r * 0.35],
        material: "accent",
        spin: { axis: "y", speed: 26 },
      });
      parts.push({
        key: "tooth-b",
        geom: { type: "box", args: [0.1 * scale, 0.1 * scale, 0.1 * scale] },
        position: [-r * 0.9, cy, bd / 2 + r * 0.35],
        material: "accent",
        spin: { axis: "y", speed: 26 },
      });
      break;
    }
    case "vertical_spinner":
    case "drum": {
      const r = 0.35 * scale;
      const len = bw * 0.82;
      const dy = topY * 0.9 + r * 0.5;
      parts.push({
        key: "drum",
        geom: { type: "cylinder", args: [r, r, len, 20] },
        position: [0, dy, bd / 2 + r * 0.5],
        rotation: [0, 0, Math.PI / 2],
        material: "weapon",
        spin: { axis: "y", speed: 30 },
      });
      parts.push({
        key: "drum-frame-l",
        geom: { type: "box", args: [0.08 * scale, r * 2.4, 0.14 * scale] },
        position: [-len / 2, dy, bd / 2 + r * 0.15],
        material: "metal",
      });
      parts.push({
        key: "drum-frame-r",
        geom: { type: "box", args: [0.08 * scale, r * 2.4, 0.14 * scale] },
        position: [len / 2, dy, bd / 2 + r * 0.15],
        material: "metal",
      });
      parts.push({
        key: "tooth-top",
        geom: { type: "box", args: [0.1 * scale, 0.1 * scale, 0.1 * scale] },
        position: [0, dy + r, bd / 2 + r * 0.5],
        material: "accent",
        spin: { axis: "y", speed: 30 },
      });
      parts.push({
        key: "tooth-mid1",
        geom: { type: "box", args: [0.09 * scale, 0.09 * scale, 0.09 * scale] },
        position: [len * 0.22, dy, bd / 2 + r * 0.5 + r * 0.6],
        material: "accent",
        spin: { axis: "y", speed: 30 },
      });
      parts.push({
        key: "tooth-mid2",
        geom: { type: "box", args: [0.09 * scale, 0.09 * scale, 0.09 * scale] },
        position: [-len * 0.22, dy, bd / 2 + r * 0.5 + r * 0.6],
        material: "accent",
        spin: { axis: "y", speed: 30 },
      });
      break;
    }
    case "flipper": {
      parts.push({
        key: "hinge-base",
        geom: { type: "box", args: [bw * 0.6, 0.16 * scale, 0.2 * scale] },
        position: [0, topY * 0.55, bd / 2 - 0.02 * scale],
        material: "metal",
      });
      parts.push({
        key: "flipper-plate",
        geom: { type: "box", args: [bw * 0.85, bh * 1.5, 0.1 * scale] },
        position: [0, topY * 0.55, bd / 2 + 0.05 * scale],
        rotation: [-0.18, 0, 0],
        material: "accent",
        idleAmp: 0.1,
        role: "flipper-plate",
      });
      parts.push({
        key: "hyd-mount",
        geom: { type: "box", args: [0.12 * scale, 0.12 * scale, 0.12 * scale] },
        position: [0, topY * 0.35, bd * 0.1],
        material: "metal",
      });
      parts.push({
        key: "hyd-arm",
        geom: { type: "cylinder", args: [0.05 * scale, 0.05 * scale, 0.55 * scale, 10] },
        position: [0, topY * 0.5, bd * 0.35],
        rotation: [1.0, 0, 0],
        material: "weapon",
        idleAmp: 0.1,
      });
      break;
    }
    case "hammer": {
      const pivotY = topY + 0.15 * scale;
      parts.push({
        key: "hammer-pivot",
        geom: { type: "cylinder", args: [0.09 * scale, 0.09 * scale, bw * 0.4, 10] },
        position: [0, pivotY, -bd * 0.05],
        rotation: [0, 0, Math.PI / 2],
        material: "metal",
      });
      parts.push({
        key: "hammer-arm",
        geom: { type: "box", args: [0.14 * scale, 0.14 * scale, bd * 0.9] },
        position: [0, pivotY + bh * 0.9, -bd * 0.1],
        rotation: [0.5, 0, 0],
        material: "metal",
        idleAmp: 0.2,
        role: "hammer-arm",
      });
      parts.push({
        key: "hammer-head",
        geom: { type: "box", args: [bw * 0.5, 0.28 * scale, 0.3 * scale] },
        position: [0, pivotY + bh * 1.5, bd * 0.42],
        rotation: [0.5, 0, 0],
        material: "accent",
        idleAmp: 0.2,
        role: "hammer-head",
      });
      parts.push({
        key: "counterweight",
        geom: { type: "box", args: [0.2 * scale, 0.2 * scale, 0.2 * scale] },
        position: [0, pivotY - bh * 0.3, -bd * 0.5],
        rotation: [0.5, 0, 0],
        material: "weapon",
        idleAmp: 0.2,
      });
      break;
    }
    case "crusher": {
      parts.push({
        key: "jaw-mount",
        geom: { type: "box", args: [0.2 * scale, 0.2 * scale, 0.3 * scale] },
        position: [0, topY * 0.6, bd / 2],
        material: "metal",
      });
      parts.push({
        key: "jaw-lower",
        geom: { type: "box", args: [bw * 0.75, 0.1 * scale, 0.55 * scale] },
        position: [0, topY * 0.35, bd / 2 + 0.22 * scale],
        rotation: [0.15, 0, 0],
        material: "metal",
      });
      parts.push({
        key: "jaw-upper",
        geom: { type: "box", args: [bw * 0.75, 0.1 * scale, 0.55 * scale] },
        position: [0, topY * 0.9, bd / 2 + 0.18 * scale],
        rotation: [-0.32, 0, 0],
        material: "accent",
        idleAmp: 0.16,
      });
      parts.push({
        key: "jaw-lower-tooth",
        geom: { type: "box", args: [bw * 0.7, 0.06 * scale, 0.08 * scale] },
        position: [0, topY * 0.35 + 0.09 * scale, bd / 2 + 0.45 * scale],
        rotation: [0.15, 0, 0],
        material: "weapon",
      });
      parts.push({
        key: "jaw-upper-tooth",
        geom: { type: "box", args: [bw * 0.7, 0.06 * scale, 0.08 * scale] },
        position: [0, topY * 0.9 - 0.08 * scale, bd / 2 + 0.42 * scale],
        rotation: [-0.32, 0, 0],
        material: "weapon",
        idleAmp: 0.16,
      });
      break;
    }
    case "lifter": {
      parts.push({
        key: "lift-mount",
        geom: { type: "box", args: [0.24 * scale, 0.22 * scale, 0.2 * scale] },
        position: [0, topY * 0.65, bd * 0.1],
        material: "metal",
      });
      parts.push({
        key: "lift-arm",
        geom: { type: "box", args: [bw * 0.5, 0.08 * scale, 0.4 * scale] },
        position: [0, topY * 0.4, bd / 2 + 0.1 * scale],
        rotation: [-0.1, 0, 0],
        material: "accent",
        idleAmp: 0.1,
      });
      parts.push({
        key: "fork-l",
        geom: { type: "box", args: [0.12 * scale, 0.05 * scale, 0.6 * scale] },
        position: [-bw * 0.22, topY * 0.16, bd / 2 + 0.35 * scale],
        material: "metal",
        idleAmp: 0.1,
      });
      parts.push({
        key: "fork-r",
        geom: { type: "box", args: [0.12 * scale, 0.05 * scale, 0.6 * scale] },
        position: [bw * 0.22, topY * 0.16, bd / 2 + 0.35 * scale],
        material: "metal",
        idleAmp: 0.1,
      });
      break;
    }
    case "wedge": {
      parts.push({
        key: "wedge-prow",
        geom: { type: "box", args: [bw * 0.95, 0.12 * scale, 0.55 * scale] },
        position: [0, topY * 0.15, bd / 2 + 0.2 * scale],
        rotation: [-0.28, 0, 0],
        material: "metal",
      });
      parts.push({
        key: "wedge-edge",
        geom: { type: "box", args: [bw * 0.95, 0.03 * scale, 0.05 * scale] },
        position: [0, topY * 0.02, bd / 2 + 0.45 * scale],
        material: "accent",
      });
      parts.push({
        key: "wedge-skirt-l",
        geom: { type: "box", args: [0.08 * scale, bh * 0.5, bd * 0.7] },
        position: [-bw * 0.46, topY * 0.3, bd * 0.05],
        rotation: [0, 0, -0.1],
        material: "metal",
      });
      parts.push({
        key: "wedge-skirt-r",
        geom: { type: "box", args: [0.08 * scale, bh * 0.5, bd * 0.7] },
        position: [bw * 0.46, topY * 0.3, bd * 0.05],
        rotation: [0, 0, 0.1],
        material: "metal",
      });
      break;
    }
    default: {
      parts.push({
        key: "antenna",
        geom: { type: "cylinder", args: [0.015 * scale, 0.015 * scale, 0.6 * scale, 8] },
        position: [0, topY + 0.3 * scale, -bd * 0.2],
        material: "metal",
      });
      parts.push({
        key: "antenna-tip",
        geom: { type: "cylinder", args: [0.05 * scale, 0.05 * scale, 0.06 * scale, 8] },
        position: [0, topY + 0.6 * scale, -bd * 0.2],
        material: "accent",
      });
      break;
    }
  }

  return parts;
}
