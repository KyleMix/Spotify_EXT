/**
 * Vercel serverless function: per-Spotify-user JSON blob store.
 * Identity is verified by asking Spotify who owns the bearer token.
 * Storage is Upstash Redis via REST (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
 */
interface Req { method?: string; headers: Record<string, string | undefined>; body?: unknown }
interface Res { status(n: number): Res; json(v: unknown): void; end(): void }

const MAX_BYTES = 1_000_000;

async function redis(cmd: unknown[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('storage-not-configured');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('storage-error');
  return (await r.json()).result;
}

export default async function handler(req: Req, res: Res) {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  const me = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: auth } });
  if (!me.ok) return res.status(401).json({ error: 'invalid token' });
  const { id } = (await me.json()) as { id: string };
  const key = `walkup:${id}`;

  try {
    if (req.method === 'GET') {
      const v = await redis(['GET', key]);
      return res.status(200).json(v ? JSON.parse(v) : null);
    }
    if (req.method === 'PUT') {
      const body = JSON.stringify(req.body);
      if (body.length > MAX_BYTES) return res.status(413).json({ error: 'too large' });
      await redis(['SET', key, body]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    const notConfigured = (e as Error).message === 'storage-not-configured';
    return res.status(notConfigured ? 501 : 500).json({ error: (e as Error).message });
  }
}
