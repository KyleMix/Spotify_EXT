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
