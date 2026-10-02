import type { AppData, Show, Slot, SlotDefaults } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newSlot(partial: Partial<Slot> = {}): Slot {
  return {
    id: uid(), type: 'act', performer: '', startOffsetMs: 0, cueLengthMs: 25000,
    setLengthMin: 10, warnAtMin: 2, notes: '', ...partial,
  };
}

export function newShow(partial: Partial<Show> = {}): Show {
  return {
    id: uid(), name: 'Untitled Show', date: new Date().toISOString().slice(0, 10),
    venue: '', notes: '', slots: [], updatedAt: Date.now(), ...partial,
  };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function duplicateShow(show: Show): Show {
  return {
    ...show, id: uid(), name: `${show.name} (copy)`, updatedAt: Date.now(),
    slots: show.slots.map((s) => ({ ...s, id: uid() })),
  };
}

export function totalPlannedMin(show: Show): number {
  return show.slots.reduce((sum, s) => sum + (s.type === 'host' ? 0 : s.setLengthMin), 0);
}

export type TimerState = 'idle' | 'ok' | 'warn' | 'over';

/** Elapsed/remaining/state for a set of `setLengthMin` minutes with a warning at `warnAtMin` remaining. */
export function timerStatus(elapsedMs: number, setLengthMin: number, warnAtMin: number) {
  const totalMs = setLengthMin * 60_000;
  const remainingMs = totalMs - elapsedMs;
  let state: TimerState = 'ok';
  if (remainingMs <= 0) state = 'over';
  else if (remainingMs <= warnAtMin * 60_000) state = 'warn';
  return { remainingMs, overMs: Math.max(0, -remainingMs), state };
}

export function formatClock(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${sign}${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function validateImport(raw: unknown): AppData {
  const d = raw as AppData;
  if (!d || d.version !== 1 || !Array.isArray(d.shows)) throw new Error('Not a valid Walk-Up export file.');
  return d;
}

/** Merge by show id, newest updatedAt wins. */
export function mergeData(local: AppData, remote: AppData): AppData {
  const map = new Map<string, Show>();
  for (const s of [...local.shows, ...remote.shows]) {
    const cur = map.get(s.id);
    if (!cur || s.updatedAt > cur.updatedAt) map.set(s.id, s);
  }
  return { version: 1, shows: [...map.values()], activeShowId: local.activeShowId ?? remote.activeShowId };
}

/** Suggested starting points (general live-show practice, not a hard rule). */
export const DEFAULTS = {
  walkUpCueMs: 25_000,
  walkOffCueMs: 12_000,
  closingCueMs: 0,
};

export type SuggestionKind = 'walk-up' | 'walk-off' | 'end-of-show';

export type SuggestionStyle = 'seconds' | 'chorus' | 'moment';

export const SUGGESTION_STYLES: { id: SuggestionStyle; label: string }[] = [
  { id: 'seconds', label: 'Seconds' },
  { id: 'chorus', label: 'Chorus / hook' },
  { id: 'moment', label: 'Big moment' },
];

const CLIP_NOUN: Record<SuggestionKind, string> = {
  'walk-up': 'comedian walk-on',
  'walk-off': 'walk-off',
  'end-of-show': 'end-of-show closing',
};

/** The text searched on Google. Asks explicitly for a number of seconds, sized to the real clip length. */
export function suggestionQuery(
  track: { name: string; artist: string }, kind: SuggestionKind, cueMs = 0, style: SuggestionStyle = 'seconds',
): string {
  const song = `"${track.name}" by ${track.artist}`;
  const clip = `${cueMs > 0 ? `${Math.round(cueMs / 1000)} second ` : ''}${CLIP_NOUN[kind]} clip`;
  const ending = kind === 'walk-up' ? 'first big hook or riff' : 'biggest energetic moment or final chorus';
  switch (style) {
    case 'chorus':
      return `${song} at what second does the ${kind === 'walk-up' ? 'first chorus or main hook' : 'final chorus or ending'} start? Answer in seconds only, not minutes:seconds`;
    case 'moment':
      return `${song} at what second is the biggest energy moment (riff, drop or build) for a ${clip}? Answer in seconds only, not minutes:seconds`;
    default:
      return `${song} best start time in seconds for a ${clip} (${ending}). Answer with a number of seconds, for example 41 seconds, not minutes:seconds`;
  }
}

/** Google search for where in a song to start a cue. Opened in a new tab; nothing is sent from the app. */
export function suggestionUrl(
  track: { name: string; artist: string }, kind: SuggestionKind, cueMs = 0, style: SuggestionStyle = 'seconds',
): string {
  return `https://www.google.com/search?q=${encodeURIComponent(suggestionQuery(track, kind, cueMs, style))}`;
}

/**
 * Parse a typed time into seconds. Accepts `41`, `41s`, `41 sec`, `41.5`, `0:41`, `1:05`, `1:02:03`.
 * Returns null for anything else so callers can keep the previous value.
 */
export function parseTimeInput(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s*(seconds?|secs?|s)$/, '');
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':');
    if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
    return parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
  }
  return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
}

/** Move a song's start point by `deltaSec`, kept inside the song and rounded to 0.1 s. */
export function nudgeStart(startMs: number, deltaSec: number, durationMs: number): number {
  const max = Math.max(0, durationMs - 1000);
  const next = Math.min(max, Math.max(0, startMs + deltaSec * 1000));
  return Math.round(next / 100) * 100;
}

export const hasWalkOff = (s: Slot) => s.type === 'act' && Boolean(s.walkOffTrack);

/** Upper limit for the quick "number of spots" list, to keep the dropdown and list manageable. */
export const MAX_SPOTS = 40;

/** Display name for a slot: its performer, or "Spot N" while the sign-up is still blank. */
export const slotName = (s: Slot, index: number) => s.performer.trim() || `Spot ${index + 1}`;

/** True for a comedian slot nobody has filled in yet (safe to remove without asking). */
export const isBlankSlot = (s: Slot) => s.type === 'act' && !s.performer.trim() && !s.track && !s.walkOffTrack && !s.notes.trim();

export const actCount = (slots: Slot[]) => slots.filter((s) => s.type === 'act').length;

/**
 * Grow or shrink the list to `count` comedian spots. New spots are appended blank; when shrinking, comedian
 * spots are removed from the end (hosts and breaks stay). Slots before `keepFrom` are never removed, so a live
 * show can't lose the act on stage or any that already went up.
 */
export function resizeActs(slots: Slot[], count: number, keepFrom = 0, defaults?: SlotDefaults): Slot[] {
  const target = Math.max(0, Math.min(MAX_SPOTS, Math.floor(count)));
  let list = slots;
  while (actCount(list) < target) list = [...list, newSlot({ type: 'act', ...defaults })];
  for (let i = list.length - 1; i >= keepFrom && actCount(list) > target; i--) {
    if (list[i].type === 'act') list = [...list.slice(0, i), ...list.slice(i + 1)];
  }
  return list;
}

export const DEFAULT_SLOT_DEFAULTS: SlotDefaults = { cueLengthMs: 25_000, setLengthMin: 10, warnAtMin: 2 };
export const slotDefaults = (show: Show): SlotDefaults => ({ ...DEFAULT_SLOT_DEFAULTS, ...show.defaults });

/** Copy one comedian's walk-off song and timing to every comedian in the lineup. */
export function applyWalkOffToAll(slots: Slot[], from: Slot): Slot[] {
  if (!from.walkOffTrack) return slots;
  return slots.map((s) => (s.type === 'act'
    ? { ...s, walkOffTrack: from.walkOffTrack, walkOffStartMs: from.walkOffStartMs, walkOffCueMs: from.walkOffCueMs } : s));
}

/** Every distinct song URI used by a show (walk-ups, backups, walk-offs and the end-of-show song). */
export function showTrackUris(show: Show): string[] {
  const uris = new Set<string>();
  for (const s of show.slots) for (const t of [s.track, s.backupTrack, s.walkOffTrack]) if (t) uris.add(t.uri);
  if (show.closingTrack) uris.add(show.closingTrack.uri);
  return [...uris];
}
