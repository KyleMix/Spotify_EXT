/** Per-browser audio settings for live mode. */
export interface AudioSettings { fadeOutMs: number }

export const DEFAULT_SETTINGS: AudioSettings = { fadeOutMs: 4000 };
export const FADE_MIN_MS = 500;
export const FADE_MAX_MS = 10_000;

const KEY = 'walkup.settings.v1';

export const clampFade = (ms: number) =>
  Math.min(FADE_MAX_MS, Math.max(FADE_MIN_MS, Number.isFinite(ms) ? Math.round(ms) : DEFAULT_SETTINGS.fadeOutMs));

export function loadSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.fadeOutMs === 'number') return { fadeOutMs: clampFade(raw.fadeOutMs) };
  } catch { /* defaults */ }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: AudioSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
