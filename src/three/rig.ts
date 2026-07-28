import type { FighterProfile } from "@/lib/types";

export type PrimGeom =
  | { type: "box"; args: [number, number, number] }
  | { type: "cylinder"; args: [number, number, number, number] };

export type MatKind = "metal" | "accent" | "weapon";

export interface PartSpec {
  key: string;
  geom: PrimGeom;
  position: [number, number, number];
  rotation?: [number, number, number];
  material: MatKind;
  spin?: { axis: "x" | "y" | "z"; speed: number };
  idleAmp?: number;
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

export function buildParts(weaponClass: FighterProfile["weapon_class"], scale: number): PartSpec[] {
  const bw = 1.5 * scale;
  const bh = 0.5 * scale;
  const bd = 1.0 * scale;

  const parts: PartSpec[] = [
    { key: "chassis", geom: { type: "box", args: [bw, bh, bd] }, position: [0, bh / 2, 0], material: "metal" },
    {
      key: "trim-l",
      geom: { type: "box", args: [0.04 * scale, bh * 0.5, bd * 0.9] },
      position: [-bw / 2 - 0.02 * scale, bh / 2, 0],
      material: "accent",
    },
    {
      key: "trim-r",
      geom: { type: "box", args: [0.04 * scale, bh * 0.5, bd * 0.9] },
      position: [bw / 2 + 0.02 * scale, bh / 2, 0],
      material: "accent",
    },
  ];

  switch (weaponClass) {
    case "horizontal_spinner": {
      const r = 0.85 * scale;
      parts.push({
        key: "disc",
        geom: { type: "cylinder", args: [r, r, 0.08 * scale, 24] },
        position: [0, bh * 0.55, bd / 2 + r * 0.35],
        material: "weapon",
        spin: { axis: "y", speed: 26 },
      });
      parts.push({
        key: "disc-edge",
        geom: { type: "cylinder", args: [r * 1.01, r * 1.01, 0.02 * scale, 24] },
        position: [0, bh * 0.55, bd / 2 + r * 0.35],
        material: "accent",
        spin: { axis: "y", speed: 26 },
      });
      break;
    }
    case "vertical_spinner":
    case "drum": {
      const r = 0.35 * scale;
      const len = bw * 0.85;
      parts.push({
        key: "drum",
        geom: { type: "cylinder", args: [r, r, len, 20] },
        position: [0, bh * 0.6, bd / 2 + r * 0.5],
        rotation: [0, 0, Math.PI / 2],
        material: "weapon",
        spin: { axis: "x", speed: 30 },
      });
      break;
    }
    case "flipper": {
      parts.push({
        key: "flipper-plate",
        geom: { type: "box", args: [bw * 0.85, bh * 1.4, 0.1 * scale] },
        position: [0, bh * 0.6, bd / 2 + 0.05 * scale],
        rotation: [-0.18, 0, 0],
        material: "accent",
        idleAmp: 0.12,
      });
      break;
    }
    case "hammer": {
      parts.push({
        key: "hammer-arm",
        geom: { type: "box", args: [0.14 * scale, 0.14 * scale, bd * 0.9] },
        position: [0, bh * 1.5, -bd * 0.1],
        rotation: [0.5, 0, 0],
        material: "metal",
        idleAmp: 0.2,
      });
      parts.push({
        key: "hammer-head",
        geom: { type: "box", args: [bw * 0.5, 0.28 * scale, 0.3 * scale] },
        position: [0, bh * 2.1, bd * 0.42],
        rotation: [0.5, 0, 0],
        material: "accent",
        idleAmp: 0.2,
      });
      break;
    }
    case "crusher":
    case "lifter": {
      parts.push({
        key: "jaw-lower",
        geom: { type: "box", args: [bw * 0.8, 0.1 * scale, 0.5 * scale] },
        position: [0, bh * 0.25, bd / 2 + 0.2 * scale],
        material: "metal",
      });
      parts.push({
        key: "jaw-upper",
        geom: { type: "box", args: [bw * 0.8, 0.1 * scale, 0.5 * scale] },
        position: [0, bh * 1.05, bd / 2 + 0.15 * scale],
        rotation: [-0.25, 0, 0],
        material: "accent",
        idleAmp: 0.15,
      });
      break;
    }
    case "wedge": {
      parts.push({
        key: "wedge-prow",
        geom: { type: "box", args: [bw * 0.95, 0.12 * scale, 0.55 * scale] },
        position: [0, bh * 0.2, bd / 2 + 0.2 * scale],
        rotation: [-0.28, 0, 0],
        material: "metal",
      });
      parts.push({
        key: "wedge-edge",
        geom: { type: "box", args: [bw * 0.95, 0.03 * scale, 0.05 * scale] },
        position: [0, bh * 0.02, bd / 2 + 0.45 * scale],
        material: "accent",
      });
      break;
    }
    case "multibot": {
      const mw = bw * 0.55;
      parts.push({
        key: "mini-a",
        geom: { type: "box", args: [mw, bh * 0.8, bd * 0.8] },
        position: [-bw * 0.4, bh * 0.4, 0],
        material: "metal",
      });
      parts.push({
        key: "mini-b",
        geom: { type: "box", args: [mw, bh * 0.8, bd * 0.8] },
        position: [bw * 0.4, bh * 0.4, 0],
        material: "metal",
      });
      parts.push({
        key: "mini-a-trim",
        geom: { type: "box", args: [mw * 0.9, 0.04 * scale, 0.06 * scale] },
        position: [-bw * 0.4, bh * 0.82, bd * 0.4],
        material: "accent",
      });
      parts.push({
        key: "mini-b-trim",
        geom: { type: "box", args: [mw * 0.9, 0.04 * scale, 0.06 * scale] },
        position: [bw * 0.4, bh * 0.82, bd * 0.4],
        material: "accent",
      });
      break;
    }
    default: {
      parts.push({
        key: "antenna",
        geom: { type: "cylinder", args: [0.015 * scale, 0.015 * scale, 0.6 * scale, 8] },
        position: [0, bh + 0.3 * scale, -bd * 0.2],
        material: "metal",
      });
      parts.push({
        key: "antenna-tip",
        geom: { type: "cylinder", args: [0.05 * scale, 0.05 * scale, 0.06 * scale, 8] },
        position: [0, bh + 0.6 * scale, -bd * 0.2],
        material: "accent",
      });
      break;
    }
  }

  return parts;
}
