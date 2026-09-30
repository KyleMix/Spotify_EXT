const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state',
].join(' ');
const KEY = 'walkup.spotify.token';
const VERIFIER = 'walkup.spotify.verifier';

interface StoredToken { access_token: string; refresh_token?: string; expires_at: number }

export const redirectUri = () => `${window.location.origin}/`;
export const isConfigured = () => Boolean(CLIENT_ID);

function b64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(len = 64) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return b64url(a.buffer).slice(0, len);
}

export async function login() {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set');
  const verifier = randomString();
  sessionStorage.setItem(VERIFIER, verifier);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const p = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(),
    scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${p}`);
}

async function tokenRequest(body: Record<string, string>): Promise<StoredToken> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }),
  });
  if (!res.ok) throw new Error(`Spotify token error ${res.status}`);
  const j = await res.json();
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1000 - 30_000 };
}

/** Call once on load: completes the redirect flow if `?code=` is present. */
export async function handleRedirect(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;
  const verifier = sessionStorage.getItem(VERIFIER);
  window.history.replaceState({}, '', window.location.pathname);
  if (!verifier) return;
  const tok = await tokenRequest({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier,
  });
  localStorage.setItem(KEY, JSON.stringify(tok));
}

function stored(): StoredToken | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}

export const isLoggedIn = () => stored() !== null;
export const logout = () => localStorage.removeItem(KEY);

export async function getAccessToken(): Promise<string> {
  const t = stored();
  if (!t) throw new Error('Not logged in');
  if (Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) { logout(); throw new Error('Session expired'); }
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  fresh.refresh_token ??= t.refresh_token;
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh.access_token;
}
