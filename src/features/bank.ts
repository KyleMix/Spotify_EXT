import type { Track } from '../types';
import type { PlaylistInfo } from '../spotify/api';

/** Case-insensitive match on song or artist; every word typed must appear somewhere. */
export function filterTracks(tracks: Track[], query: string): Track[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return tracks;
  return tracks.filter((t) => {
    const hay = `${t.name} ${t.artist}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/* ---- Cache: memory first, sessionStorage as backup so a reload doesn't refetch everything. ---- */
const PREFIX = 'walkup.bank.';
const mem = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw) { const v = JSON.parse(raw) as T; mem.set(key, v); return v; }
  } catch { /* storage unavailable or full: fine */ }
  return undefined;
}
export function cacheSet(key: string, value: unknown) {
  mem.set(key, value);
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* too big for storage: memory only */ }
}
export function cacheClear() {
  mem.clear();
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch { /* ignore */ }
}

export interface CachedTracks { snapshotId?: string; tracks: Track[]; complete: boolean }
export const tracksKey = (p: Pick<PlaylistInfo, 'id'>) => `tracks.${p.id}`;
/** A cached playlist is still good if Spotify's snapshot id for it hasn't changed. */
export const isFresh = (c: CachedTracks | undefined, p: PlaylistInfo) =>
  Boolean(c && c.complete && c.snapshotId && c.snapshotId === p.snapshotId);

/* ---- Recently used songs (shared across shows, kept on this device). ---- */
const RECENT_KEY = 'walkup.recentSongs';
const RECENT_MAX = 15;

export function loadRecent(): Track[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function addRecent(list: Track[], t: Track): Track[] {
  return [t, ...list.filter((x) => x.uri !== t.uri)].slice(0, RECENT_MAX);
}
export function rememberTrack(t: Track) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(addRecent(loadRecent(), t))); } catch { /* ignore */ }
}
