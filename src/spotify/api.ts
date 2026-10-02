import { getAccessToken } from './auth';
import type { Track } from '../types';

/** Plain-language text for a failed Spotify request, with the next step to try. */
export function spotifyErrorMessage(status: number): string {
  if (status === 401) return 'Your Spotify login expired. Click Reconnect (top right) and try again.';
  if (status === 403) return 'Spotify refused this request. Check that your account is Premium and was added under User Management for this app. If you just added playlist access, click Reconnect.';
  if (status === 404) return 'Spotify could not find that. It may have been deleted or made private.';
  if (status === 429) return 'Spotify is busy (too many requests). Wait a few seconds and try again.';
  if (status >= 500) return 'Spotify is having trouble right now. Try again in a moment.';
  return `Spotify returned an unexpected error (${status}). Try again.`;
}

async function call(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch(`https://api.spotify.com/v1${path}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new Error("Can't reach Spotify. Check your internet connection and try again.");
  }
  if (!res.ok && res.status !== 204) throw new Error(spotifyErrorMessage(res.status));
  return res.status === 204 ? null : res.json();
}

interface RawTrack {
  uri: string; name: string; duration_ms: number;
  artists: { name: string }[]; album: { images: { url: string }[] };
}
/** Playlist entries wrap the song as `track` (or `item`). Skip episodes, local files and removed songs. */
export function parseTrackItems(items: { track?: unknown; item?: unknown }[]): Track[] {
  const out: Track[] = [];
  for (const it of items) {
    const t = (it?.track ?? it?.item) as (RawTrack & { type?: string; is_local?: boolean }) | null | undefined;
    if (!t || !t.uri || t.is_local || (t.type && t.type !== 'track') || !Array.isArray(t.artists)) continue;
    out.push(toTrack({ ...t, album: t.album ?? { images: [] } }));
  }
  return out;
}

export const toTrack = (t: RawTrack): Track => ({
  uri: t.uri, name: t.name, artist: t.artists.map((a) => a.name).join(', '),
  albumArt: t.album.images.at(-1)?.url, durationMs: t.duration_ms,
});

export const SEARCH_PAGE = 8;

/** One page of search results; pass the number of results already shown as `offset` to get the next page. */
export async function searchTracks(q: string, offset = 0): Promise<Track[]> {
  if (!q.trim()) return [];
  const j = await call(`/search?type=track&limit=${SEARCH_PAGE}&offset=${offset}&q=${encodeURIComponent(q)}`);
  return (j.tracks.items as RawTrack[]).map(toTrack);
}

export async function getMe(): Promise<{ id: string; display_name: string; product: string }> {
  return call('/me');
}

export async function transferPlayback(deviceId: string) {
  await call('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: false }) });
}

export async function playTrack(deviceId: string, uri: string, positionMs: number) {
  await call(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.floor(positionMs)) }),
  });
}

export interface PlaylistInfo { id: string; name: string; total: number; snapshotId?: string; owner?: string; image?: string }

interface RawPlaylist {
  id: string; name: string; snapshot_id?: string; owner?: { display_name?: string };
  images?: { url: string }[] | null; tracks?: { total?: number }; items?: { total?: number };
}

/** One page (up to 50) of the signed-in user's playlists. `next` is the offset to request next, or null at the end. */
export async function getPlaylistsPage(offset = 0): Promise<{ items: PlaylistInfo[]; next: number | null }> {
  const j = await call(`/me/playlists?limit=50&offset=${offset}`);
  const items = ((j.items ?? []) as (RawPlaylist | null)[]).filter((p): p is RawPlaylist => Boolean(p)).map((p) => ({
    id: p.id, name: p.name, snapshotId: p.snapshot_id, owner: p.owner?.display_name,
    total: p.tracks?.total ?? p.items?.total ?? 0, image: p.images?.at(-1)?.url,
  }));
  return { items, next: j.next ? offset + 50 : null };
}

/** One page (up to 50) of a playlist's songs. Tries the classic /tracks path, then /items if Spotify has renamed it. */
export async function getPlaylistTracksPage(id: string, offset = 0): Promise<{ tracks: Track[]; next: number | null }> {
  const q = `limit=50&offset=${offset}&additional_types=track`;
  let j;
  try { j = await call(`/playlists/${id}/tracks?${q}`); } catch (e) {
    if (!/could not find/i.test((e as Error).message)) throw e;
    j = await call(`/playlists/${id}/items?${q}`);
  }
  return { tracks: parseTrackItems(j.items ?? []), next: j.next ? offset + 50 : null };
}

/** Reads the response of GET /tracks?ids=… : a missing (null) entry or is_playable === false means the song can't be played. */
export function findUnplayable(uris: string[], tracks: ({ is_playable?: boolean } | null)[]): string[] {
  return uris.filter((_, i) => { const t = tracks[i]; return !t || t.is_playable === false; });
}

/** Returns the URIs (from `uris`) that Spotify says are unavailable for this account's country. Throws if the check itself fails. */
export async function checkTracks(uris: string[]): Promise<string[]> {
  const ids = [...new Set(uris)].map((u) => u.split(':').pop()!).filter(Boolean);
  const bad: string[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const j = await call(`/tracks?ids=${chunk.join(',')}&market=from_token`);
    bad.push(...findUnplayable(chunk.map((id) => `spotify:track:${id}`), j.tracks ?? []));
  }
  return bad;
}
