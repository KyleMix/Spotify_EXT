import { getAccessToken } from './auth';
import type { Track } from '../types';

async function call(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 403) throw new Error('Spotify refused (403). Is your account on the app allowlist and Premium?');
  if (!res.ok && res.status !== 204) throw new Error(`Spotify ${res.status}`);
  return res.status === 204 ? null : res.json();
}

interface RawTrack {
  uri: string; name: string; duration_ms: number;
  artists: { name: string }[]; album: { images: { url: string }[] };
}
export const toTrack = (t: RawTrack): Track => ({
  uri: t.uri, name: t.name, artist: t.artists.map((a) => a.name).join(', '),
  albumArt: t.album.images.at(-1)?.url, durationMs: t.duration_ms,
});

export async function searchTracks(q: string): Promise<Track[]> {
  if (!q.trim()) return [];
  const j = await call(`/search?type=track&limit=8&q=${encodeURIComponent(q)}`);
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
