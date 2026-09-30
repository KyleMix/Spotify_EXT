import { SUGGESTION_STYLES, type SuggestionStyle } from '../lib';
/** Per-browser audio settings for live mode. */
export interface AudioSettings {
  fadeOutMs: number;
  /** Start the comedian's timer automatically once the walk-up music has stopped. */
  autoStartTimer: boolean;
}

export const DEFAULT_SETTINGS: AudioSettings = { fadeOutMs: 4000, autoStartTimer: true };
export const FADE_MIN_MS = 500;
export const FADE_MAX_MS = 10_000;

const KEY = 'walkup.settings.v1';

export const clampFade = (ms: number) =>
  Math.min(FADE_MAX_MS, Math.max(FADE_MIN_MS, Number.isFinite(ms) ? Math.round(ms) : DEFAULT_SETTINGS.fadeOutMs));

export function loadSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.fadeOutMs === 'number') {
      return { fadeOutMs: clampFade(raw.fadeOutMs), autoStartTimer: raw.autoStartTimer !== false };
    }
  } catch { /* defaults */ }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: AudioSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

const STYLE_KEY = 'walkup.suggestStyle.v1';

export function loadSuggestStyle(): SuggestionStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    if (SUGGESTION_STYLES.some((s) => s.id === v)) return v as SuggestionStyle;
  } catch { /* default */ }
  return 'seconds';
}

export function saveSuggestStyle(s: SuggestionStyle) {
  try { localStorage.setItem(STYLE_KEY, s); } catch { /* storage unavailable */ }
}
