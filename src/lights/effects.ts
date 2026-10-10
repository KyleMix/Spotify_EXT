/**
 * Effects: what a look does to each pixel over time. Pure functions of time and position, so they are
 * deterministic and unit-tested; the engine supplies the clock, the pixel's place in the rig and the sound color.
 */
import { OFF, type LightColor } from './color';
import { hsvToRgb } from './sound';

export type EffectId = 'off' | 'solid' | 'pulse' | 'chase' | 'rainbow' | 'strobe' | 'sound';

export const EFFECTS: { id: EffectId; label: string; hint: string; usesColors: number; usesSpeed: boolean }[] = [
  { id: 'solid', label: 'Solid', hint: 'Steady color. Several colors alternate across pods/pars.', usesColors: 4, usesSpeed: false },
  { id: 'pulse', label: 'Pulse', hint: 'Breathes between dim and full.', usesColors: 4, usesSpeed: true },
  { id: 'chase', label: 'Chase', hint: 'One pod/par at a time runs along the whole rig; the second color fills the rest.', usesColors: 2, usesSpeed: true },
  { id: 'rainbow', label: 'Rainbow', hint: 'Colors roll across the rig.', usesColors: 0, usesSpeed: true },
  { id: 'strobe', label: 'Strobe', hint: 'Flashes. Capped at 10 flashes a second.', usesColors: 1, usesSpeed: true },
  { id: 'sound', label: 'Sound reactive', hint: 'Follows the microphone: each beat jumps to a new color, louder is brighter.', usesColors: 0, usesSpeed: false },
  { id: 'off', label: 'Off', hint: 'Dark.', usesColors: 0, usesSpeed: false },
];

/** What one light (or every light) does within a look. */
export interface Layer {
  effect: EffectId;
  /** Up to 4 colors; how they are used depends on the effect. */
  colors: LightColor[];
  /** Effect speed, 0.1 (slow) to 10 (fast). */
  speed: number;
  /** 0-1. */
  intensity: number;
}

export interface EffectContext {
  tMs: number;
  /** Pixel within this light, from 0. */
  pixel: number;
  /** This pixel's position among every pixel in the rig, in rig order, and how many there are. */
  globalIndex: number;
  globalCount: number;
  /** The sound-reactive color for this frame (computed once per frame by the engine). */
  sound: LightColor;
}

/**
 * Fastest strobe allowed, in flashes per second. Flashing at roughly 3-30 per second can trigger photosensitive
 * seizures, so the cap limits extremes but is not "safe": the look editor warns whenever strobe is chosen.
 */
export const MAX_STROBE_HZ = 10;

const scale = (c: LightColor, k: number): LightColor => ({
  r: Math.round(c.r * k), g: Math.round(c.g * k), b: Math.round(c.b * k),
});

const pick = (colors: LightColor[], i: number) => (colors.length ? colors[((i % colors.length) + colors.length) % colors.length] : OFF);

/** The color one pixel shows right now under `layer`, with the layer's intensity applied. */
export function effectColor(layer: Layer, ctx: EffectContext): LightColor {
  const t = ctx.tMs / 1000;
  const speed = Math.min(10, Math.max(0.1, layer.speed));
  let c: LightColor;
  switch (layer.effect) {
    case 'off': c = OFF; break;
    case 'solid': c = pick(layer.colors, ctx.pixel); break;
    case 'pulse': {
      const k = 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t * speed * 0.5)); // never fully dark
      c = scale(pick(layer.colors, ctx.pixel), k);
      break;
    }
    case 'chase': {
      const pos = Math.floor(t * speed * 2) % Math.max(1, ctx.globalCount);
      c = ctx.globalIndex === pos ? pick(layer.colors, 0) : layer.colors[1] ?? OFF;
      break;
    }
    case 'rainbow': c = hsvToRgb(t * speed * 0.1 + ctx.globalIndex / Math.max(1, ctx.globalCount), 1, 1); break;
    case 'strobe': {
      const hz = Math.min(MAX_STROBE_HZ, speed);
      c = (t * hz) % 1 < 0.3 ? pick(layer.colors, 0) : OFF;
      break;
    }
    case 'sound': c = ctx.sound; break;
    default: c = OFF;
  }
  return scale(c, Math.min(1, Math.max(0, layer.intensity)));
}

/** Linear blend from a to b (k = 0 → a, 1 → b). */
export function mix(a: LightColor, b: LightColor, k: number): LightColor {
  const m = Math.min(1, Math.max(0, k));
  return { r: Math.round(a.r + (b.r - a.r) * m), g: Math.round(a.g + (b.g - a.g) * m), b: Math.round(a.b + (b.b - a.b) * m) };
}
