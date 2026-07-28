import type { FighterProfile } from "@/lib/types";

export type PrimGeom =
  | { type: "box"; args: [number, number, number] }
  | { type: "cylinder"; args: [number, number, number, number] }
  | { type: "cone"; args: [number, number, number] }
  | { type: "sphere"; args: [number, number, number] }
  | { type: "torus"; args: [number, number, number, number, number] };

export type MatKind = "metal" | "accent" | "weapon";

export interface PartSpec {
  key: string;
  geom: PrimGeom;
  position: [number, number, number];
  rotation?: [number, number, number];
  material: MatKind;
  /** livery override; falls back to the team-accent material palette when absent */
  color?: string;
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

export function buildParts(
  weaponClass: FighterProfile["weapon_class"],
  scale: number,
  name?: string,
): PartSpec[] {
  const sig = name ? SIGNATURES[normalizeName(name)] : undefined;
  if (sig) return sig(scale);
  return buildGenericParts(weaponClass, scale);
}

function buildGenericParts(weaponClass: FighterProfile["weapon_class"], scale: number): PartSpec[] {
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
        spin: { axis: "y", speed: 30 },
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

// ---------------------------------------------------------------------------
// Signature builds: hand-posed primitive rigs for the real BattleBots roster.
// Keyed by normalized name; anything unknown falls through to the generic
// weapon_class rig above. ponytail: primitives only, no GLTF pipeline — add
// real meshes only if these read as too abstract on stage.
// ---------------------------------------------------------------------------

const STEEL = "#b8bec8";
const DARK_STEEL = "#767d8a";
const CARBON = "#16181d";
const TIRE = "#121316";
const RED = "#cf2020";
const BLUE = "#1c4fd6";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Four (or two) tires, axis across X. `zs` are the axle offsets. */
function wheels(
  s: number,
  { r, w, x, zs, y = r, color = TIRE }: { r: number; w: number; x: number; zs: number[]; y?: number; color?: string },
): PartSpec[] {
  const out: PartSpec[] = [];
  zs.forEach((z, i) => {
    [-1, 1].forEach((side) => {
      out.push({
        key: `wheel-${i}-${side > 0 ? "r" : "l"}`,
        geom: { type: "cylinder", args: [r * s, r * s, w * s, 16] },
        position: [side * x * s, y * s, z * s],
        rotation: [0, 0, Math.PI / 2],
        material: "metal",
        color,
      });
    });
  });
  return out;
}

/** Row of cones along X — teeth, spikes, serrations. `down` flips them. */
function spikes(
  key: string,
  s: number,
  { count, r, h, spread, y, z, color, down = false, idleAmp }:
    { count: number; r: number; h: number; spread: number; y: number; z: number; color: string; down?: boolean; idleAmp?: number },
): PartSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    return {
      key: `${key}-${i}`,
      geom: { type: "cone", args: [r * s, h * s, 8] },
      position: [t * spread * s, y * s, z * s],
      rotation: down ? [Math.PI, 0, 0] : [0, 0, 0],
      material: "weapon",
      color,
      idleAmp,
    } satisfies PartSpec;
  });
}

const SIGNATURES: Record<string, (s: number) => PartSpec[]> = {
  // CHOPPER — swinging axe, bare steel wedge, Denver CO
  chopper: (s) => [
    { key: "hull", geom: { type: "box", args: [1.5 * s, 0.38 * s, 1.2 * s] }, position: [0, 0.26 * s, -0.1 * s], material: "metal", color: STEEL },
    { key: "prow", geom: { type: "box", args: [1.5 * s, 0.06 * s, 0.9 * s] }, position: [0, 0.16 * s, 0.72 * s], rotation: [0.3, 0, 0], material: "metal", color: DARK_STEEL },
    { key: "prow-lip", geom: { type: "box", args: [1.5 * s, 0.04 * s, 0.08 * s] }, position: [0, 0.0 * s, 1.13 * s], material: "accent", color: RED },
    ...wheels(s, { r: 0.28, w: 0.18, x: 0.72, zs: [-0.45], color: RED }),
    { key: "mast", geom: { type: "box", args: [0.2 * s, 0.6 * s, 0.2 * s] }, position: [0, 0.55 * s, -0.5 * s], material: "metal", color: DARK_STEEL },
    // arm pitched up-forward (-0.5 rad); spikes + head follow that line
    { key: "axe-arm", geom: { type: "box", args: [0.16 * s, 0.16 * s, 1.5 * s] }, position: [0, 0.8 * s, -0.1 * s], rotation: [-0.5, 0, 0], material: "weapon", color: DARK_STEEL, idleAmp: 0.24 },
    ...spikes("axe-spike", s, { count: 4, r: 0.07, h: 0.18, spread: 0, y: 0, z: 0, color: STEEL, idleAmp: 0.24 }).map((p, i) => ({
      ...p,
      position: [0, (0.86 + i * 0.12) * s, (0.02 + i * 0.22) * s] as [number, number, number],
    })),
    // crescent head: torus arc reads as the hooked blade
    { key: "axe-head", geom: { type: "torus", args: [0.34 * s, 0.07 * s, 8, 24, 2.6] }, position: [0, 1.16 * s, 0.56 * s], rotation: [0, Math.PI / 2, 2.3], material: "weapon", color: STEEL, idleAmp: 0.24 },
    // pyro exhaust stack (X factor)
    { key: "exhaust", geom: { type: "cylinder", args: [0.09 * s, 0.11 * s, 0.35 * s, 10] }, position: [0.45 * s, 0.55 * s, -0.6 * s], material: "accent", color: RED },
  ],

  // DIABLO — twin vertical drums on tank treads, Wellington CO
  diablo: (s) => [
    { key: "tread-l", geom: { type: "box", args: [0.32 * s, 0.36 * s, 1.7 * s] }, position: [-0.68 * s, 0.19 * s, -0.15 * s], material: "metal", color: CARBON },
    { key: "tread-r", geom: { type: "box", args: [0.32 * s, 0.36 * s, 1.7 * s] }, position: [0.68 * s, 0.19 * s, -0.15 * s], material: "metal", color: CARBON },
    { key: "hull", geom: { type: "box", args: [1.1 * s, 0.34 * s, 1.5 * s] }, position: [0, 0.38 * s, -0.15 * s], material: "metal", color: STEEL },
    { key: "drum-l", geom: { type: "cylinder", args: [0.34 * s, 0.34 * s, 0.5 * s, 18] }, position: [-0.3 * s, 0.42 * s, 0.7 * s], rotation: [0, 0, Math.PI / 2], material: "weapon", color: DARK_STEEL, spin: { axis: "y", speed: 30 } },
    { key: "drum-r", geom: { type: "cylinder", args: [0.34 * s, 0.34 * s, 0.5 * s, 18] }, position: [0.3 * s, 0.42 * s, 0.7 * s], rotation: [0, 0, Math.PI / 2], material: "weapon", color: DARK_STEEL, spin: { axis: "y", speed: 30 } },
    { key: "fork-l", geom: { type: "box", args: [0.36 * s, 0.06 * s, 0.85 * s] }, position: [-0.42 * s, 0.09 * s, 0.98 * s], rotation: [0.22, 0, 0], material: "accent", color: RED },
    { key: "fork-r", geom: { type: "box", args: [0.36 * s, 0.06 * s, 0.85 * s] }, position: [0.42 * s, 0.09 * s, 0.98 * s], rotation: [0.22, 0, 0], material: "accent", color: RED },
    { key: "hoop-front", geom: { type: "torus", args: [0.62 * s, 0.05 * s, 8, 20, Math.PI] }, position: [0, 0.5 * s, -0.35 * s], material: "accent", color: RED },
    { key: "hoop-rear", geom: { type: "torus", args: [0.62 * s, 0.05 * s, 8, 20, Math.PI] }, position: [0, 0.5 * s, -0.85 * s], material: "accent", color: RED },
    { key: "tail", geom: { type: "box", args: [1.2 * s, 0.05 * s, 0.4 * s] }, position: [0, 0.18 * s, -1.15 * s], material: "metal", color: BLUE },
  ],

  // HYPERSHOCK — neon four-wheeler, bronze drum, Miami FL
  hypershock: (s) => [
    { key: "hull", geom: { type: "box", args: [1.3 * s, 0.26 * s, 1.6 * s] }, position: [0, 0.32 * s, -0.05 * s], material: "metal", color: "#e6ff2e" },
    { key: "hull-stripe", geom: { type: "box", args: [1.32 * s, 0.06 * s, 0.5 * s] }, position: [0, 0.46 * s, -0.5 * s], material: "accent", color: "#ff4fa3" },
    ...wheels(s, { r: 0.34, w: 0.24, x: 0.68, zs: [0.35, -0.65] }),
    { key: "drum", geom: { type: "cylinder", args: [0.3 * s, 0.3 * s, 0.85 * s, 18] }, position: [0, 0.38 * s, 0.55 * s], rotation: [0, 0, Math.PI / 2], material: "weapon", color: "#b8792e", spin: { axis: "y", speed: 34 } },
    { key: "upright-l", geom: { type: "box", args: [0.12 * s, 0.6 * s, 0.3 * s] }, position: [-0.5 * s, 0.42 * s, 0.55 * s], material: "metal", color: "#b8792e" },
    { key: "upright-r", geom: { type: "box", args: [0.12 * s, 0.6 * s, 0.3 * s] }, position: [0.5 * s, 0.42 * s, 0.55 * s], material: "metal", color: "#b8792e" },
    { key: "plow", geom: { type: "box", args: [1.45 * s, 0.05 * s, 0.75 * s] }, position: [0, 0.13 * s, 0.98 * s], rotation: [0.16, 0, 0], material: "accent", color: "#e6ff2e" },
    { key: "wing", geom: { type: "box", args: [1.2 * s, 0.04 * s, 0.28 * s] }, position: [0, 0.52 * s, -0.9 * s], material: "metal", color: "#e6ff2e" },
  ],

  // BRONCO — pneumatic launcher, silver hull with red arm, Sausalito CA
  bronco: (s) => [
    { key: "hull", geom: { type: "box", args: [1.5 * s, 0.42 * s, 1.7 * s] }, position: [0, 0.3 * s, -0.1 * s], material: "metal", color: STEEL },
    { key: "pod-l", geom: { type: "box", args: [0.2 * s, 0.3 * s, 1.0 * s] }, position: [-0.78 * s, 0.42 * s, -0.3 * s], material: "metal", color: DARK_STEEL },
    { key: "pod-r", geom: { type: "box", args: [0.2 * s, 0.3 * s, 1.0 * s] }, position: [0.78 * s, 0.42 * s, -0.3 * s], material: "metal", color: DARK_STEEL },
    ...wheels(s, { r: 0.3, w: 0.2, x: 0.86, zs: [0.5, -0.7] }),
    { key: "launcher", geom: { type: "box", args: [1.15 * s, 0.1 * s, 1.25 * s] }, position: [0, 0.55 * s, 0.5 * s], rotation: [-0.35, 0, 0], material: "accent", color: RED, idleAmp: 0.3 },
    { key: "launcher-lip", geom: { type: "box", args: [1.15 * s, 0.04 * s, 0.5 * s] }, position: [0, 0.12 * s, 1.05 * s], rotation: [0.12, 0, 0], material: "metal", color: STEEL },
    { key: "tank", geom: { type: "cylinder", args: [0.16 * s, 0.16 * s, 0.9 * s, 14] }, position: [0, 0.6 * s, -0.85 * s], rotation: [0, 0, Math.PI / 2], material: "metal", color: DARK_STEEL },
  ],

  // KRAKEN — biting crusher head with flame, Titusville FL
  kraken: (s) => [
    { key: "hull", geom: { type: "box", args: [1.15 * s, 0.3 * s, 1.7 * s] }, position: [0, 0.22 * s, -0.2 * s], material: "metal", color: "#3f9e2f" },
    ...wheels(s, { r: 0.24, w: 0.18, x: 0.66, zs: [-0.7] }),
    { key: "tongue", geom: { type: "box", args: [0.5 * s, 0.05 * s, 1.1 * s] }, position: [0, 0.12 * s, 0.95 * s], rotation: [0.1, 0, 0], material: "accent", color: RED },
    { key: "jaw-lower", geom: { type: "box", args: [1.1 * s, 0.12 * s, 1.0 * s] }, position: [0, 0.13 * s, 0.7 * s], material: "metal", color: "#2f7d24" },
    ...spikes("tooth-lower", s, { count: 5, r: 0.06, h: 0.22, spread: 0.9, y: 0.28, z: 1.05, color: "#f2f4f0" }),
    { key: "skull", geom: { type: "box", args: [1.1 * s, 0.4 * s, 1.05 * s] }, position: [0, 0.72 * s, 0.45 * s], rotation: [-0.26, 0, 0], material: "metal", color: "#4fbf3a", idleAmp: 0.16 },
    { key: "snout", geom: { type: "box", args: [0.9 * s, 0.22 * s, 0.4 * s] }, position: [0, 0.62 * s, 1.0 * s], rotation: [-0.26, 0, 0], material: "metal", color: "#63d94a", idleAmp: 0.16 },
    ...spikes("fang", s, { count: 2, r: 0.08, h: 0.42, spread: 0.44, y: 0.4, z: 1.0, color: "#f2f4f0", down: true, idleAmp: 0.16 }),
    ...spikes("tooth-upper", s, { count: 5, r: 0.05, h: 0.18, spread: 0.9, y: 0.5, z: 0.75, color: "#f2f4f0", down: true, idleAmp: 0.16 }),
    { key: "eye-l", geom: { type: "sphere", args: [0.09 * s, 10, 10] }, position: [-0.32 * s, 0.92 * s, 0.62 * s], material: "accent", color: "#ffd23f", idleAmp: 0.16 },
    { key: "eye-r", geom: { type: "sphere", args: [0.09 * s, 10, 10] }, position: [0.32 * s, 0.92 * s, 0.62 * s], material: "accent", color: "#ffd23f", idleAmp: 0.16 },
    { key: "tail-fin", geom: { type: "box", args: [0.9 * s, 0.04 * s, 0.4 * s] }, position: [0, 0.3 * s, -1.15 * s], rotation: [0.35, 0, 0], material: "accent", color: "#63d94a" },
  ],

  // MALICE — invertible horizontal ring spinner, San Jose CA
  malice: (s) => [
    { key: "chassis", geom: { type: "box", args: [1.25 * s, 0.24 * s, 1.25 * s] }, position: [0, 0.24 * s, -0.1 * s], material: "metal", color: CARBON },
    { key: "top-plate", geom: { type: "box", args: [1.0 * s, 0.06 * s, 1.0 * s] }, position: [0, 0.62 * s, -0.1 * s], material: "metal", color: CARBON },
    { key: "post-l", geom: { type: "cylinder", args: [0.05 * s, 0.05 * s, 0.4 * s, 8] }, position: [-0.45 * s, 0.42 * s, -0.45 * s], material: "metal", color: DARK_STEEL },
    { key: "post-r", geom: { type: "cylinder", args: [0.05 * s, 0.05 * s, 0.4 * s, 8] }, position: [0.45 * s, 0.42 * s, -0.45 * s], material: "metal", color: DARK_STEEL },
    { key: "ring", geom: { type: "torus", args: [0.82 * s, 0.14 * s, 10, 28, Math.PI * 2] }, position: [0, 0.42 * s, 0.15 * s], rotation: [-Math.PI / 2, 0, 0], material: "weapon", color: RED, spin: { axis: "z", speed: 24 } },
    { key: "hub", geom: { type: "cylinder", args: [0.18 * s, 0.18 * s, 0.14 * s, 12] }, position: [0, 0.5 * s, 0.15 * s], material: "weapon", color: DARK_STEEL, spin: { axis: "y", speed: 24 } },
    { key: "rail-l", geom: { type: "box", args: [0.08 * s, 0.05 * s, 1.3 * s] }, position: [-0.62 * s, 0.08 * s, 0.35 * s], material: "accent", color: RED },
    { key: "rail-r", geom: { type: "box", args: [0.08 * s, 0.05 * s, 1.3 * s] }, position: [0.62 * s, 0.08 * s, 0.35 * s], material: "accent", color: RED },
    ...spikes("rail-tooth", s, { count: 4, r: 0.05, h: 0.14, spread: 1.24, y: 0.13, z: 1.0, color: RED }),
  ],

  // MAMMOTH — the tallest bot: brown tube frame, spinning grabber, Baltimore MD
  mammoth: (s) => [
    ...wheels(s, { r: 0.5, w: 0.26, x: 0.9, zs: [-1.0] }),
    { key: "axle", geom: { type: "cylinder", args: [0.07 * s, 0.07 * s, 1.8 * s, 10] }, position: [0, 0.5 * s, -1.0 * s], rotation: [0, 0, Math.PI / 2], material: "metal", color: "#6b4226" },
    { key: "spine-l", geom: { type: "cylinder", args: [0.07 * s, 0.07 * s, 2.0 * s, 10] }, position: [-0.42 * s, 0.85 * s, -0.15 * s], rotation: [-0.7, 0, 0], material: "metal", color: "#6b4226" },
    { key: "spine-r", geom: { type: "cylinder", args: [0.07 * s, 0.07 * s, 2.0 * s, 10] }, position: [0.42 * s, 0.85 * s, -0.15 * s], rotation: [-0.7, 0, 0], material: "metal", color: "#6b4226" },
    { key: "cross", geom: { type: "cylinder", args: [0.06 * s, 0.06 * s, 0.9 * s, 8] }, position: [0, 1.2 * s, 0.15 * s], rotation: [0, 0, Math.PI / 2], material: "metal", color: "#6b4226" },
    { key: "mast", geom: { type: "box", args: [0.14 * s, 1.6 * s, 0.16 * s] }, position: [0, 0.9 * s, 0.5 * s], material: "metal", color: CARBON },
    { key: "grabber-disc", geom: { type: "cylinder", args: [0.62 * s, 0.62 * s, 0.1 * s, 24] }, position: [0, 1.5 * s, 0.55 * s], rotation: [0, 0, Math.PI / 2], material: "weapon", color: "#e8e4dc", spin: { axis: "y", speed: 14 } },
    { key: "belt", geom: { type: "torus", args: [0.66 * s, 0.03 * s, 8, 24, Math.PI * 2] }, position: [0, 1.5 * s, 0.55 * s], rotation: [0, Math.PI / 2, 0], material: "metal", color: CARBON },
    { key: "arm-l", geom: { type: "box", args: [0.1 * s, 0.45 * s, 1.8 * s] }, position: [-0.3 * s, 1.0 * s, 0.85 * s], rotation: [0.55, 0, 0], material: "weapon", color: CARBON },
    { key: "arm-r", geom: { type: "box", args: [0.1 * s, 0.45 * s, 1.8 * s] }, position: [0.3 * s, 1.0 * s, 0.85 * s], rotation: [0.55, 0, 0], material: "weapon", color: CARBON },
    ...spikes("claw", s, { count: 2, r: 0.08, h: 0.3, spread: 0.6, y: 0.28, z: 1.45, color: STEEL }),
    { key: "skirt", geom: { type: "box", args: [1.6 * s, 0.05 * s, 0.5 * s] }, position: [0, 0.06 * s, -1.35 * s], material: "accent", color: BLUE },
  ],

  // NIGHTMARE — the biggest weapon in BattleBots, Bradenton FL
  nightmare: (s) => [
    { key: "hull", geom: { type: "box", args: [1.05 * s, 0.34 * s, 1.3 * s] }, position: [0, 0.32 * s, -0.45 * s], material: "metal", color: CARBON },
    ...wheels(s, { r: 0.44, w: 0.3, x: 0.72, zs: [-0.7] }),
    { key: "strut-l", geom: { type: "box", args: [0.1 * s, 1.1 * s, 0.22 * s] }, position: [-0.4 * s, 0.75 * s, 0.05 * s], rotation: [0.3, 0, 0], material: "metal", color: DARK_STEEL },
    { key: "strut-r", geom: { type: "box", args: [0.1 * s, 1.1 * s, 0.22 * s] }, position: [0.4 * s, 0.75 * s, 0.05 * s], rotation: [0.3, 0, 0], material: "metal", color: DARK_STEEL },
    { key: "disc", geom: { type: "cylinder", args: [1.15 * s, 1.15 * s, 0.07 * s, 32] }, position: [0, 1.15 * s, 0.45 * s], rotation: [0, 0, Math.PI / 2], material: "weapon", color: STEEL, spin: { axis: "y", speed: 22 } },
    { key: "disc-hub", geom: { type: "cylinder", args: [0.2 * s, 0.2 * s, 0.16 * s, 14] }, position: [0, 1.15 * s, 0.45 * s], rotation: [0, 0, Math.PI / 2], material: "accent", color: RED, spin: { axis: "y", speed: 22 } },
    { key: "guard", geom: { type: "torus", args: [1.2 * s, 0.05 * s, 8, 24, Math.PI * 0.8] }, position: [0, 1.15 * s, 0.45 * s], rotation: [0, Math.PI / 2, -0.4], material: "metal", color: DARK_STEEL },
    { key: "wedge", geom: { type: "box", args: [1.0 * s, 0.05 * s, 0.5 * s] }, position: [0, 0.08 * s, -1.25 * s], rotation: [0.25, 0, 0], material: "accent", color: RED },
  ],

  // OVERKILL — indestructible black wedge with a big swinging blade, Santa Monica CA
  overkill: (s) => [
    { key: "hull", geom: { type: "box", args: [1.35 * s, 0.36 * s, 1.5 * s] }, position: [0, 0.26 * s, -0.15 * s], material: "metal", color: CARBON },
    { key: "wedge", geom: { type: "box", args: [1.5 * s, 0.06 * s, 0.9 * s] }, position: [0, 0.16 * s, 0.75 * s], rotation: [0.3, 0, 0], material: "metal", color: CARBON },
    { key: "wedge-lip", geom: { type: "box", args: [1.5 * s, 0.03 * s, 0.06 * s] }, position: [0, 0.02 * s, 1.15 * s], material: "accent", color: BLUE },
    ...wheels(s, { r: 0.24, w: 0.18, x: 0.74, zs: [0.2, -0.65] }),
    { key: "mast", geom: { type: "box", args: [0.18 * s, 0.55 * s, 0.18 * s] }, position: [0, 0.52 * s, -0.55 * s], material: "metal", color: DARK_STEEL },
    { key: "blade", geom: { type: "box", args: [0.07 * s, 0.7 * s, 2.2 * s] }, position: [0, 0.95 * s, 0.45 * s], rotation: [0.12, 0, 0], material: "weapon", color: STEEL, idleAmp: 0.22 },
    { key: "blade-tip", geom: { type: "cone", args: [0.24 * s, 0.8 * s, 4] }, position: [0, 1.1 * s, 1.72 * s], rotation: [1.5, 0, 0], material: "weapon", color: STEEL, idleAmp: 0.22 },
    ...spikes("serration", s, { count: 4, r: 0.08, h: 0.2, spread: 0, y: 0.68, z: 0, color: STEEL, down: true, idleAmp: 0.22 }).map((p, i) => ({
      ...p,
      position: [0, 0.66 * s, (-0.35 + i * 0.3) * s] as [number, number, number],
    })),
  ],

  // TAZBOT — six-wheel walking armory with a turret arm, San Diego CA
  tazbot: (s) => [
    { key: "hull", geom: { type: "box", args: [1.25 * s, 0.3 * s, 1.6 * s] }, position: [0, 0.34 * s, -0.1 * s], material: "metal", color: RED },
    ...wheels(s, { r: 0.27, w: 0.2, x: 0.74, zs: [0.6, 0, -0.6], color: "#8f1c1c" }),
    { key: "turret", geom: { type: "cylinder", args: [0.42 * s, 0.46 * s, 0.3 * s, 14] }, position: [0, 0.64 * s, -0.15 * s], material: "metal", color: DARK_STEEL },
    { key: "turret-body", geom: { type: "box", args: [0.85 * s, 0.34 * s, 1.0 * s] }, position: [0, 0.88 * s, -0.2 * s], rotation: [-0.12, 0, 0], material: "metal", color: RED, idleAmp: 0.1 },
    { key: "lift-arm", geom: { type: "box", args: [0.16 * s, 0.14 * s, 1.3 * s] }, position: [0, 1.15 * s, 0.15 * s], rotation: [-0.55, 0, 0], material: "weapon", color: STEEL, idleAmp: 0.18 },
    { key: "arm-blade", geom: { type: "box", args: [0.4 * s, 0.05 * s, 0.55 * s] }, position: [0, 1.55 * s, 0.55 * s], rotation: [-0.55, 0, 0], material: "weapon", color: STEEL, idleAmp: 0.18 },
    { key: "jaw-l", geom: { type: "box", args: [0.14 * s, 0.1 * s, 0.9 * s] }, position: [-0.34 * s, 0.18 * s, 0.95 * s], rotation: [0.18, 0.12, 0], material: "accent", color: RED, idleAmp: 0.12 },
    { key: "jaw-r", geom: { type: "box", args: [0.14 * s, 0.1 * s, 0.9 * s] }, position: [0.34 * s, 0.18 * s, 0.95 * s], rotation: [0.18, -0.12, 0], material: "accent", color: RED, idleAmp: 0.12 },
    ...spikes("jaw-tip", s, { count: 2, r: 0.07, h: 0.28, spread: 0.68, y: 0.16, z: 1.4, color: STEEL, idleAmp: 0.12 }).map((p) => ({
      ...p,
      rotation: [1.3, 0, 0] as [number, number, number],
    })),
  ],
};

/** Bots with a hand-built rig (everything else falls back to weapon_class). */
export const SIGNATURE_NAMES = Object.keys(SIGNATURES);

export function hasSignature(name: string): boolean {
  return normalizeName(name) in SIGNATURES;
}
