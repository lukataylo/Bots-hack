// Marquee replay keyframe contract, produced by the sim (ENGINE agent) and
// consumed by <MarqueeFight/>. Lives in the ARENA zone since nothing else
// depends on the shape yet; import from here (or `@/three`) if you produce it.

export interface MarqueeEvent {
  type: "hit" | "launch" | "ko";
  magnitude: number;
}

export interface MarqueeFrame {
  t: number;
  a: { p: [number, number, number]; q: [number, number, number, number] };
  b: { p: [number, number, number]; q: [number, number, number, number] };
  events?: MarqueeEvent[];
}

export interface MarqueeScript {
  fps: number;
  frames: MarqueeFrame[];
  winner: "A" | "B";
  durationSec: number;
}
