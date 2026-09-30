import type { AppData, Show, Slot } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newSlot(partial: Partial<Slot> = {}): Slot {
  return {
    id: uid(), type: 'act', performer: '', startOffsetMs: 0, cueLengthMs: 20000,
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
