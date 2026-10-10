/** How the lights follow the show (until Phase 2 replaces this with looks): settings and the warning timing. */

export interface ShowLightSettings {
  /**
   * How long the warning light stays red when the light-warning time hits, in seconds. After that it goes off
   * until time is up. 0 means it stays on from the warning straight through overtime.
   */
  warnPulseSec: number;
  /** Stage lights' white level while an act is performing, in percent. */
  stageWhite: number;
  /** How strongly stage lights react to the microphone, 1 (only loud music) to 10 (reacts to quiet sound). */
  soundSensitivity: number;
}

export const DEFAULT_SHOW_SETTINGS: ShowLightSettings = { warnPulseSec: 3, stageWhite: 100, soundSensitivity: 5 };

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function clampShowSettings(s: Partial<ShowLightSettings>): ShowLightSettings {
  const d = DEFAULT_SHOW_SETTINGS;
  return {
    warnPulseSec: int(s.warnPulseSec, 0, 30, d.warnPulseSec),
    stageWhite: int(s.stageWhite, 0, 100, d.stageWhite),
    soundSensitivity: int(s.soundSensitivity, 1, 10, d.soundSensitivity),
  };
}

/**
 * Whether the warning light should be red right now.
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

const KEY = 'walkup.lights.show.v1';
const OLD_KEY = 'walkup.dmx.v1'; // these settings used to live alongside the single-light config

export function loadShowSettings(): ShowLightSettings {
  try {
    return clampShowSettings(JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY) ?? 'null') ?? {});
  } catch { return DEFAULT_SHOW_SETTINGS; }
}

export function saveShowSettings(s: ShowLightSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
