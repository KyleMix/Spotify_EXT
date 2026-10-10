/** Looks (saved lighting states) and which look each moment of the show fires. */
import { whiteAt, type LightColor } from './color';
import type { EffectId, Layer } from './effects';
import { newId } from './patch';

export interface Look {
  id: string;
  name: string;
  /** Crossfade time into this look, in ms (0 = snap). */
  fadeMs: number;
  /** What every light does... */
  all: Layer;
  /** ...unless a light has its own layer here (keyed by fixture id). */
  perFixture: Record<string, Layer>;
  /** Keyboard key (KeyboardEvent.code) that fires this look from anywhere in the app, e.g. "F13" from a Stream Deck. */
  key?: string;
}

/** Moments in the show that fire a look automatically while Live mode is open. */
export type ShowMoment = 'walkup' | 'onstage' | 'warning' | 'timeup' | 'between' | 'closing';

export const MOMENTS: { id: ShowMoment; label: string; hint: string }[] = [
  { id: 'walkup', label: 'Walk-up', hint: 'While the walk-up song plays' },
  { id: 'onstage', label: 'On stage', hint: 'While a comedian is on the clock' },
  { id: 'warning', label: 'Light warning', hint: 'For the warning flash length at each act\'s light-warning time' },
  { id: 'timeup', label: "Time's up", hint: 'From the end of the set length until the act ends' },
  { id: 'between', label: 'Between acts', hint: 'After a set (walk-off song) until the next walk-up' },
  { id: 'closing', label: 'End of show', hint: 'After the last act' },
];

export interface LooksState {
  looks: Look[];
  /** Look id per moment ('' = lights dark). */
  cues: Record<ShowMoment, string>;
  /** Key that hands the lights back to the show (releases a look fired by hand). */
  releaseKey?: string;
}

const RED: LightColor = { r: 255, g: 0, b: 0 };
const BLUE: LightColor = { r: 0, g: 60, b: 255 };
const AMBER: LightColor = { r: 255, g: 120, b: 20 };
const layer = (effect: EffectId, colors: LightColor[] = [], speed = 1, intensity = 1): Layer => ({ effect, colors, speed, intensity });

/** Starting looks. `stageWhite` carries over the white level set in the previous version. */
export function defaultLooks(stageWhite = 100): LooksState {
  const looks: Look[] = [
    { id: 'stage-white', name: 'Stage white', fadeMs: 800, all: layer('solid', [whiteAt(100)], 1, stageWhite / 100), perFixture: {} },
    { id: 'sound', name: 'Sound reactive', fadeMs: 300, all: layer('sound'), perFixture: {} },
    { id: 'warning-red', name: 'Warning flash', fadeMs: 0, all: layer('solid', [RED]), perFixture: {} },
    { id: 'time-up', name: "Time's up", fadeMs: 0, all: layer('pulse', [RED], 1), perFixture: {} },
    { id: 'warm', name: 'Warm wash', fadeMs: 1500, all: layer('solid', [AMBER], 1, 0.8), perFixture: {} },
    { id: 'rainbow', name: 'Rainbow', fadeMs: 1000, all: layer('rainbow', [], 1), perFixture: {} },
    { id: 'chase', name: 'Blue chase', fadeMs: 300, all: layer('chase', [BLUE, { r: 0, g: 0, b: 40 }], 2), perFixture: {} },
  ];
  return {
    looks,
    cues: { walkup: 'sound', onstage: 'stage-white', warning: 'warning-red', timeup: 'time-up', between: 'sound', closing: 'rainbow' },
  };
}

const EFFECT_IDS: EffectId[] = ['off', 'solid', 'pulse', 'chase', 'rainbow', 'strobe', 'sound'];
const byte = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(255, Math.max(0, n)) : 0; };
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function clampLayer(l: Partial<Layer> | undefined): Layer {
  return {
    effect: EFFECT_IDS.includes(l?.effect as EffectId) ? (l!.effect as EffectId) : 'solid',
    colors: (Array.isArray(l?.colors) ? l!.colors : []).slice(0, 4).map((c) => ({ r: byte(c?.r), g: byte(c?.g), b: byte(c?.b) })),
    speed: num(l?.speed, 0.1, 10, 1),
    intensity: num(l?.intensity, 0, 1, 1),
  };
}

export function clampLook(l: Partial<Look>): Look {
  const perFixture: Record<string, Layer> = {};
  for (const [k, v] of Object.entries(l.perFixture ?? {})) perFixture[k] = clampLayer(v);
  return {
    id: typeof l.id === 'string' && l.id ? l.id : `look-${newId()}`,
    name: typeof l.name === 'string' && l.name.trim() ? l.name.slice(0, 40) : 'Look',
    fadeMs: Math.round(num(l.fadeMs, 0, 20000, 500)),
    all: clampLayer(l.all),
    perFixture,
    key: typeof l.key === 'string' && l.key ? l.key : undefined,
  };
}

export function clampLooksState(s: Partial<LooksState>, fallbackWhite = 100): LooksState {
  const base = defaultLooks(fallbackWhite);
  const looks = Array.isArray(s.looks) ? s.looks.slice(0, 64).map(clampLook) : base.looks;
  const ids = new Set(looks.map((l) => l.id));
  const cues = { ...base.cues };
  for (const m of Object.keys(cues) as ShowMoment[]) {
    const v = s.cues?.[m];
    if (typeof v === 'string') cues[m] = v === '' || ids.has(v) ? v : '';
    else if (!ids.has(cues[m])) cues[m] = '';
  }
  return { looks, cues, releaseKey: typeof s.releaseKey === 'string' && s.releaseKey ? s.releaseKey : undefined };
}

/** Which look a key fires, if any. */
export const lookForKey = (s: LooksState, code: string) => s.looks.find((l) => l.key === code);

/** Moments that use a look, so it can't be deleted while it's wired into the show. */
export const momentsUsing = (s: LooksState, lookId: string) => MOMENTS.filter((m) => s.cues[m.id] === lookId);

/**
 * The show moment right now, from Live mode's state.
 * In pop-out timer mode the lights never go red: the warning and time's up stay on the On stage look.
 */
export function showMoment(opts: {
  done: boolean; phase: 'cued' | 'walkup' | 'timing'; elapsedMs: number; setLengthMin: number; warnAtMin: number;
  pulseSec: number; redCues: boolean;
}): ShowMoment {
  if (opts.done) return 'closing';
  if (opts.phase === 'walkup') return 'walkup';
  if (opts.phase === 'cued') return 'between';
  if (!opts.redCues) return 'onstage';
  const totalMs = opts.setLengthMin * 60_000;
  if (opts.elapsedMs >= totalMs) return 'timeup';
  const warnStartMs = Math.max(0, totalMs - opts.warnAtMin * 60_000);
  if (opts.elapsedMs < warnStartMs) return 'onstage';
  return opts.pulseSec === 0 || opts.elapsedMs - warnStartMs < opts.pulseSec * 1000 ? 'warning' : 'onstage';
}

const KEY = 'walkup.lights.looks.v1';

export function loadLooks(stageWhite: number): LooksState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return clampLooksState(JSON.parse(raw), stageWhite);
  } catch { /* defaults */ }
  return defaultLooks(stageWhite);
}

export function saveLooks(s: LooksState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
