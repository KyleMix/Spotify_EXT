/** Pure DMX helpers: settings for every light on the chain, frame building, and when the stage lights should be lit. */

/**
 * What a light does in the show:
 * - 'warning': the comedian's time light (red flash at the warning, solid red when time is up, otherwise off);
 * - 'stage': stage wash (white while an act is on the clock, sound-reactive color the rest of the show).
 */
export type FixtureRole = 'warning' | 'stage';

/** One light on the DMX chain. */
export interface DmxFixture {
  /** Label shown in the panel, e.g. "Chauvet 4BAR Flex". */
  name: string;
  role: FixtureRole;
  /** DMX start address of the fixture (the number on its display, e.g. d001 = 1). */
  address: number;
  /** Channel numbers within the fixture's mode, counting from 1 at the start address. */
  red: number;
  green: number;
  blue: number;
  /** Master dimmer channel within the fixture, or 0 if the mode has none. Held at full while lit. */
  dimmer: number;
  /** How many channels the light's mode uses (its footprint), so lights on the chain don't overlap. */
  channels: number;
}

export interface DmxConfig {
  /** Every light daisy-chained on the cable (DMX OUT of one into DMX IN of the next). */
  fixtures: DmxFixture[];
  /**
   * How long the red light stays on when the light-warning time hits, in seconds. After that it goes off
   * until time is up. 0 means it stays on from the warning straight through overtime.
   */
  warnPulseSec: number;
  /** Stage lights' white level while an act is performing, in percent. */
  stageWhite: number;
  /** How strongly stage lights react to the microphone, 1 (only loud music) to 10 (reacts to quiet sound). */
  soundSensitivity: number;
}

export interface LightColor { r: number; g: number; b: number }

export const OFF: LightColor = { r: 0, g: 0, b: 0 };
export const RED: LightColor = { r: 255, g: 0, b: 0 };
export const GREEN: LightColor = { r: 0, g: 255, b: 0 };
export const BLUE: LightColor = { r: 0, g: 0, b: 255 };
export const WHITE: LightColor = { r: 255, g: 255, b: 255 };

export const DEFAULT_FIXTURE: DmxFixture = { name: 'Warning light', role: 'warning', address: 1, red: 1, green: 2, blue: 3, dimmer: 0, channels: 3 };

export interface FixturePreset { id: string; label: string; fixture: Omit<DmxFixture, 'address'>; hint: string }

/** Lights we know the channel layout of. Pick the mode on the light itself to match. */
export const FIXTURE_PRESETS: FixturePreset[] = [
  {
    id: '4bar-flex-3ch',
    label: 'Chauvet 4BAR Flex (3-CH mode)',
    fixture: { name: 'Chauvet 4BAR Flex', role: 'stage', red: 1, green: 2, blue: 3, dimmer: 0, channels: 3 },
    hint: 'On the 4BAR Flex, set the DMX personality to 3-CH (all four pars together: 1 red, 2 green, 3 blue) and set its address to the one shown here.',
  },
  {
    id: 'rgb-3ch',
    label: 'Generic RGB light (3 channels)',
    fixture: { name: 'RGB light', role: 'stage', red: 1, green: 2, blue: 3, dimmer: 0, channels: 3 },
    hint: 'Most simple RGB pars: 1 red, 2 green, 3 blue. Use Find channels if the colors are wrong.',
  },
  {
    id: 'rgb-dim-4ch',
    label: 'Generic dimmer + RGB light (4 channels)',
    fixture: { name: 'Dimmer + RGB light', role: 'stage', red: 2, green: 3, blue: 4, dimmer: 1, channels: 4 },
    hint: 'Common 4-channel layout: 1 dimmer, 2 red, 3 green, 4 blue. Use Find channels if the colors are wrong.',
  },
];

export const DEFAULT_DMX_CONFIG: DmxConfig = { fixtures: [DEFAULT_FIXTURE], warnPulseSec: 3, stageWhite: 100, soundSensitivity: 5 };

const STORAGE_KEY = 'walkup.dmx.v1';
const MAX_OFFSET = 32;
export const MAX_FIXTURES = 16;
/** DMX frames must carry at least this many slots; shorter is not standard. */
const MIN_SLOTS = 24;

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Highest channel the fixture uses: its mode's footprint or the highest mapped channel, whichever is larger. */
export const footprint = (f: DmxFixture) => Math.max(f.channels, f.red, f.green, f.blue, f.dimmer);

/** Force one light's settings into range, and keep the whole fixture inside the 512-channel universe. */
export function clampFixture(c: Partial<DmxFixture>): DmxFixture {
  const d = DEFAULT_FIXTURE;
  const f: DmxFixture = {
    name: typeof c.name === 'string' ? c.name.slice(0, 40) : d.name,
    role: c.role === 'stage' ? 'stage' : 'warning', // lights saved before roles existed were the warning light
    address: int(c.address, 1, 512, d.address),
    red: int(c.red, 1, MAX_OFFSET, d.red),
    green: int(c.green, 1, MAX_OFFSET, d.green),
    blue: int(c.blue, 1, MAX_OFFSET, d.blue),
    dimmer: int(c.dimmer, 0, MAX_OFFSET, d.dimmer),
    channels: 0,
  };
  const mapped = footprint({ ...f, channels: 1 });
  f.channels = Math.max(mapped, int(c.channels, 1, MAX_OFFSET, mapped));
  const highest = footprint(f);
  if (f.address + highest - 1 > 512) f.address = 512 - highest + 1;
  return f;
}

/**
 * Force every setting into a valid range. Also upgrades settings saved before multiple lights were
 * supported (a single light's address and channels at the top level) into a one-light chain.
 */
export function clampDmxConfig(c: Partial<DmxConfig> & Partial<DmxFixture>): DmxConfig {
  const list = Array.isArray(c.fixtures)
    ? c.fixtures
    : [{ ...DEFAULT_FIXTURE, ...pickLegacy(c) }];
  return {
    fixtures: list.slice(0, MAX_FIXTURES).map((f) => clampFixture(f ?? {})),
    warnPulseSec: int(c.warnPulseSec, 0, 30, DEFAULT_DMX_CONFIG.warnPulseSec),
    stageWhite: int(c.stageWhite, 0, 100, DEFAULT_DMX_CONFIG.stageWhite),
    soundSensitivity: int(c.soundSensitivity, 1, 10, DEFAULT_DMX_CONFIG.soundSensitivity),
  };
}

function pickLegacy(c: Partial<DmxFixture>): Partial<DmxFixture> {
  const out: Partial<DmxFixture> = {};
  for (const k of ['address', 'red', 'green', 'blue', 'dimmer'] as const) if (c[k] !== undefined) out[k] = c[k];
  return out;
}

/** White at a percentage, for stage lights during a set. */
export const whiteAt = (percent: number): LightColor => {
  const v = Math.round((Math.min(100, Math.max(0, percent)) / 100) * 255);
  return { r: v, g: v, b: v };
};

/** Absolute DMX slot (1-512) for a channel offset of the fixture. */
export const slotOf = (f: DmxFixture, offset: number) => f.address + offset - 1;

/** First address after every light already on the chain: where a newly added light should go. */
export function nextFreeAddress(fixtures: DmxFixture[], channels: number): number {
  const end = fixtures.reduce((m, f) => Math.max(m, f.address + footprint(f) - 1), 0);
  return Math.min(end + 1, 512 - Math.max(1, channels) + 1);
}

/** Pairs of lights (by index) whose channel ranges overlap, so one would override the other. */
export function overlaps(fixtures: DmxFixture[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < fixtures.length; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const a = fixtures[i], b = fixtures[j];
      const sharesAddress = a.address === b.address && a.role === b.role && footprint(a) === footprint(b)
        && a.red === b.red && a.green === b.green && a.blue === b.blue && a.dimmer === b.dimmer;
      if (sharesAddress) continue; // identical lights on one address is a valid way to run them as one
      if (a.address <= b.address + footprint(b) - 1 && b.address <= a.address + footprint(a) - 1) out.push([i, j]);
    }
  }
  return out;
}

/**
 * Build one DMX frame: index 0 is the start code (0), index N is DMX channel N.
 * Warning lights get `warning`, stage lights get `stage` (the same color for both when omitted).
 */
export function buildFrame(cfg: DmxConfig, warning: LightColor, stage: LightColor = warning): Uint8Array {
  const top = cfg.fixtures.reduce((m, f) => Math.max(m, slotOf(f, footprint(f))), 0);
  const frame = new Uint8Array(Math.max(MIN_SLOTS, Math.min(512, top)) + 1);
  for (const f of cfg.fixtures) {
    const color = f.role === 'stage' ? stage : warning;
    frame[slotOf(f, f.red)] = color.r;
    frame[slotOf(f, f.green)] = color.g;
    frame[slotOf(f, f.blue)] = color.b;
    if (f.dimmer > 0) frame[slotOf(f, f.dimmer)] = color.r || color.g || color.b ? 255 : 0;
  }
  return frame;
}

/**
 * A frame with only the listed channels of one light set (1 = that light's start address), everything else 0.
 * Used by the channel finder to learn what each channel of the light's current mode does.
 */
export function buildProbeFrame(fixture: DmxFixture, values: Record<number, number>): Uint8Array {
  const entries = Object.entries(values)
    .map(([offset, v]) => ({ slot: slotOf(fixture, Number(offset)), v: int(v, 0, 255, 0) }))
    .filter((e) => e.slot >= 1 && e.slot <= 512);
  const frame = new Uint8Array(Math.max(MIN_SLOTS, ...entries.map((e) => e.slot)) + 1);
  for (const e of entries) frame[e.slot] = e.v;
  return frame;
}

/**
 * Whether the stage light should be red right now.
 * - Light-warning time reached: red for `pulseSec` seconds, then off (0 = stay red).
 * - Time is up: red, and it stays red until the act ends (the phase leaves "timing").
 * - Anything else: off.
 */
export function lightIsOn(
  phase: string, elapsedMs: number, setLengthMin: number, warnAtMin: number, pulseSec: number,
): boolean {
  if (phase !== 'timing') return false;
  const totalMs = setLengthMin * 60_000;
  if (elapsedMs >= totalMs) return true;                       // time is up: solid red
  const warnStartMs = Math.max(0, totalMs - warnAtMin * 60_000);
  if (elapsedMs < warnStartMs) return false;                   // before the warning
  return pulseSec === 0 || elapsedMs - warnStartMs < pulseSec * 1000;
}

export function loadDmxConfig(): DmxConfig {
  try {
    return clampDmxConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? {});
  } catch { return DEFAULT_DMX_CONFIG; }
}

export function saveDmxConfig(c: DmxConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
}
