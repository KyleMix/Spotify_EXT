import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, Show } from '../types';
import { mergeData, newShow } from '../lib';
import { getAccessToken, isLoggedIn } from '../spotify/auth';

const KEY = 'walkup.data.v1';

function load(): AppData {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (d?.version === 1) return d;
  } catch { /* fall through */ }
  const s = newShow({ name: 'My First Show' });
  return { version: 1, shows: [s], activeShowId: s.id };
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

async function remote(method: 'GET' | 'PUT', body?: AppData): Promise<AppData | null> {
  const token = await getAccessToken();
  const res = await fetch('/api/sync', {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 || res.status === 501) throw new Error('unavailable');
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return method === 'GET' ? ((await res.json()) as AppData | null) : null;
}

export function useStore() {
  const [data, setData] = useState<AppData>(load);
  const [sync, setSync] = useState<SyncStatus>('off');
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(data)); }, [data]);

  const doSync = useCallback(async () => {
    if (!isLoggedIn()) return;
    setSync('syncing');
    try {
      const theirs = await remote('GET');
      const merged = theirs ? mergeData(dataRef.current, theirs) : dataRef.current;
      setData(merged);
      await remote('PUT', merged);
      setSync('idle');
    } catch (e) {
      setSync((e as Error).message === 'unavailable' ? 'off' : 'error');
    }
  }, []);

  // Initial pull, then push (debounced) on every edit, plus pull when the tab regains focus.
  useEffect(() => { void doSync(); }, [doSync]);
  useEffect(() => {
    const t = setTimeout(() => { void doSync(); }, 1500);
    return () => clearTimeout(t);
  }, [data.shows, doSync]);
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') void doSync(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [doSync]);

  const updateShow = useCallback((id: string, fn: (s: Show) => Show) => {
    setData((d) => ({ ...d, shows: d.shows.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)) }));
  }, []);
  const addShow = useCallback((s: Show) => setData((d) => ({ ...d, shows: [...d.shows, s], activeShowId: s.id })), []);
  const deleteShow = useCallback((id: string) => setData((d) => {
    const shows = d.shows.filter((s) => s.id !== id);
    return { ...d, shows, activeShowId: shows[0]?.id };
  }), []);
  const setActive = useCallback((id: string) => setData((d) => ({ ...d, activeShowId: id })), []);
  const replaceAll = useCallback((next: AppData) => setData(mergeData(dataRef.current, next)), []);

  return { data, sync, updateShow, addShow, deleteShow, setActive, replaceAll, syncNow: doSync };
}
