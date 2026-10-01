/** Pure DMX helpers: settings, frame building, and when the stage light should be lit. */

export interface DmxConfig {
  /** DMX start address of the fixture (the number on its display, e.g. d001 = 1). */
  address: number;
  /** Channel numbers within the fixture's mode, counting from 1 at the start address. */
  red: number;
  green: number;
  blue: number;
  /** Master dimmer channel within the fixture, or 0 if the mode has none. Held at full while lit. */
  dimmer: number;
  /**
   * How long the red light stays on when the light-warning time hits, in seconds. After that it goes off
   * until time is up. 0 means it stays on from the warning straight through overtime.
   */
  warnPulseSec: number;
}

export interface LightColor { r: number; g: number; b: number }

export const OFF: LightColor = { r: 0, g: 0, b: 0 };
export const RED: LightColor = { r: 255, g: 0, b: 0 };
export const GREEN: LightColor = { r: 0, g: 255, b: 0 };
export const BLUE: LightColor = { r: 0, g: 0, b: 255 };
export const WHITE: LightColor = { r: 255, g: 255, b: 255 };

export const DEFAULT_DMX_CONFIG: DmxConfig = { address: 1, red: 1, green: 2, blue: 3, dimmer: 0, warnPulseSec: 3 };

const STORAGE_KEY = 'walkup.dmx.v1';
const MAX_OFFSET = 32;
/** DMX frames must carry at least this many slots; shorter is not standard. */
const MIN_SLOTS = 24;

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Force every setting into a valid range, and keep the whole fixture inside the 512-channel universe. */
export function clampDmxConfig(c: Partial<DmxConfig>): DmxConfig {
  const d = DEFAULT_DMX_CONFIG;
  const cfg: DmxConfig = {
    address: int(c.address, 1, 512, d.address),
    red: int(c.red, 1, MAX_OFFSET, d.red),
    green: int(c.green, 1, MAX_OFFSET, d.green),
    blue: int(c.blue, 1, MAX_OFFSET, d.blue),
    dimmer: int(c.dimmer, 0, MAX_OFFSET, d.dimmer),
    warnPulseSec: int(c.warnPulseSec, 0, 30, d.warnPulseSec),
  };
  const highest = Math.max(cfg.red, cfg.green, cfg.blue, cfg.dimmer);
  if (cfg.address + highest - 1 > 512) cfg.address = 512 - highest + 1;
  return cfg;
}

/** Absolute DMX slot (1-512) for a channel offset of the fixture. */
export const slotOf = (cfg: DmxConfig, offset: number) => cfg.address + offset - 1;

/** Build one DMX frame: index 0 is the start code (0), index N is DMX channel N. */
export function buildFrame(cfg: DmxConfig, color: LightColor): Uint8Array {
  const slots = [slotOf(cfg, cfg.red), slotOf(cfg, cfg.green), slotOf(cfg, cfg.blue)];
  if (cfg.dimmer > 0) slots.push(slotOf(cfg, cfg.dimmer));
  const frame = new Uint8Array(Math.max(MIN_SLOTS, ...slots) + 1);
  frame[slotOf(cfg, cfg.red)] = color.r;
  frame[slotOf(cfg, cfg.green)] = color.g;
  frame[slotOf(cfg, cfg.blue)] = color.b;
  if (cfg.dimmer > 0) frame[slotOf(cfg, cfg.dimmer)] = color.r || color.g || color.b ? 255 : 0;
  return frame;
}

/**
 * A frame with only the listed fixture channels set (1 = the start address), everything else 0.
 * Used by the channel finder to learn what each channel of the light's current mode does.
 */
export function buildProbeFrame(cfg: DmxConfig, values: Record<number, number>): Uint8Array {
  const entries = Object.entries(values)
    .map(([offset, v]) => ({ slot: slotOf(cfg, Number(offset)), v: int(v, 0, 255, 0) }))
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
