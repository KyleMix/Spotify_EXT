/** Show-wide lighting settings: warning flash length, microphone sensitivity. */

export interface ShowLightSettings {
  /**
   * How long the Light warning look holds when the light-warning time hits, in seconds, before going back to the
   * On stage look until time is up. 0 means it holds straight through to time's up.
   */
  warnPulseSec: number;
  /** White level from the previous version; only used to seed the Stage white look. */
  stageWhite: number;
  /** How strongly sound looks react to the microphone, 1 (only loud music) to 10 (reacts to quiet sound). */
  soundSensitivity: number;
  /** Follow the recent peak level so quiet and loud rooms react alike. */
  autoGain: boolean;
}

export const DEFAULT_SHOW_SETTINGS: ShowLightSettings = { warnPulseSec: 3, stageWhite: 100, soundSensitivity: 5, autoGain: true };

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
    autoGain: s.autoGain !== false,
  };
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
