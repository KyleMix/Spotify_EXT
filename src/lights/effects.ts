/**
 * Effects: what a look does to each pixel over time. Pure functions of time and position, so they are
 * deterministic and unit-tested; the engine supplies the clock, the pixel's place in the rig and the sound color.
 */
import { OFF, type LightColor } from './color';
import { hsvToRgb, type AudioFeatures } from './sound';

export type EffectId = 'off' | 'solid' | 'pulse' | 'chase' | 'rainbow' | 'strobe'
  | 'sound' | 'beat-chase' | 'ripple' | 'meter' | 'bands' | 'level';

export const EFFECTS: { id: EffectId; label: string; hint: string; usesColors: number; usesSpeed: boolean; music?: boolean }[] = [
  { id: 'solid', label: 'Solid', hint: 'Steady color. Several colors alternate across pods/pars.', usesColors: 4, usesSpeed: false },
  { id: 'pulse', label: 'Pulse', hint: 'Breathes between dim and full.', usesColors: 4, usesSpeed: true },
  { id: 'chase', label: 'Chase', hint: 'One pod/par at a time runs along the whole rig; the second color fills the rest.', usesColors: 2, usesSpeed: true },
  { id: 'rainbow', label: 'Rainbow', hint: 'Colors roll across the rig.', usesColors: 0, usesSpeed: true },
  { id: 'strobe', label: 'Strobe', hint: 'Flashes. Capped at 10 flashes a second.', usesColors: 1, usesSpeed: true },
  { id: 'sound', label: 'Beat colors', hint: 'Every pod/par changes color on each beat; louder is brighter.', usesColors: 0, usesSpeed: false, music: true },
  { id: 'beat-chase', label: 'Beat chase', hint: 'Each beat moves the lit pod/par one step along the rig; the second color fills the rest.', usesColors: 2, usesSpeed: false, music: true },
  { id: 'ripple', label: 'Ripple', hint: 'Each beat sends a wave of the beat color across the whole rig. Speed sets how fast it travels.', usesColors: 0, usesSpeed: true, music: true },
  { id: 'meter', label: 'Music meter', hint: 'Pods/pars fill up along the rig with the volume, green to red like a level meter.', usesColors: 0, usesSpeed: false, music: true },
  { id: 'bands', label: 'Bass / mid / treble', hint: 'The rig splits in three: the first part follows the bass, the middle the mids, the last the treble.', usesColors: 3, usesSpeed: false, music: true },
  { id: 'level', label: 'Color to music', hint: 'Your colors, with brightness following the volume.', usesColors: 4, usesSpeed: false, music: true },
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
  /** What the music is doing this frame (computed once per frame by the engine). */
  audio: AudioFeatures;
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
    case 'sound': {
      const a = ctx.audio;
      const v = a.live ? 0.06 + 0.6 * a.level + 0.4 * a.flash : 0.5;
      c = hsvToRgb(a.hue, 1 - 0.5 * a.treble, Math.min(1, v));
      break;
    }
    case 'beat-chase': {
      const pos = ctx.audio.beatCount % Math.max(1, ctx.globalCount);
      c = ctx.globalIndex === pos ? pick(layer.colors, 0) : layer.colors[1] ?? OFF;
      break;
    }
    case 'ripple': {
      const a = ctx.audio;
      const travelMs = 400 / speed;                                   // time for the wave to cross the rig
      const front = ((ctx.tMs - a.lastBeatMs) / travelMs) * ctx.globalCount;
      const wave = Math.max(0, 1 - Math.abs(ctx.globalIndex - front) / 1.5);
      c = hsvToRgb(a.hue, 1, Math.min(1, 0.08 + 0.92 * wave));
      break;
    }
    case 'meter': {
      const fill = ctx.audio.level * ctx.globalCount;                 // how many pixels are lit, fractional
      const on = Math.min(1, Math.max(0, fill - ctx.globalIndex));
      const pos = ctx.globalCount > 1 ? ctx.globalIndex / (ctx.globalCount - 1) : 0;
      c = scale(hsvToRgb((1 - pos) / 3, 1, 1), on);                   // pure green at the start, red at the end
      break;
    }
    case 'bands': {
      const band = Math.min(2, Math.floor((ctx.globalIndex / Math.max(1, ctx.globalCount)) * 3));
      const v = [ctx.audio.bass, ctx.audio.mid, ctx.audio.treble][band];
      c = scale(pick(layer.colors, band), v);
      break;
    }
    case 'level': c = scale(pick(layer.colors, ctx.pixel), 0.15 + 0.85 * ctx.audio.level); break;
    default: c = OFF;
  }
  return scale(c, Math.min(1, Math.max(0, layer.intensity)));
}

/** Linear blend from a to b (k = 0 → a, 1 → b). */
export function mix(a: LightColor, b: LightColor, k: number): LightColor {
  const m = Math.min(1, Math.max(0, k));
  return { r: Math.round(a.r + (b.r - a.r) * m), g: Math.round(a.g + (b.g - a.g) * m), b: Math.round(a.b + (b.b - a.b) * m) };
}
