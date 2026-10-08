import { formatClock, timerStatus, type TimerState } from '../lib';

/** The pop-out timer window listens on this channel; Live mode (the same origin) sends it the current act. */
export const TIMER_CHANNEL = 'walkup.timer.v1';
export const TIMER_WINDOW_NAME = 'walkup-timer';

export type TimerPhase = 'cued' | 'walkup' | 'timing' | 'done';

export interface TimerSnapshot {
  phase: TimerPhase;
  /** Who is up (or on stage). */
  name: string;
  /** Wall-clock ms when the timer started; only meaningful while phase is 'timing'. */
  startedAt: number;
  setLengthMin: number;
  warnAtMin: number;
  /** "3 of 8". */
  position: string;
  /** Name of the following act, or ''. */
  next: string;
}

export type TimerMessage = { type: 'state'; snap: TimerSnapshot } | { type: 'hello' } | { type: 'bye' };

const PHASES: TimerPhase[] = ['cued', 'walkup', 'timing', 'done'];

/** Accept only well-formed messages: the channel is shared with anything else on this origin. */
export function parseMessage(raw: unknown): TimerMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type === 'hello' || m.type === 'bye') return { type: m.type };
  if (m.type !== 'state' || !m.snap || typeof m.snap !== 'object') return null;
  const s = m.snap as Record<string, unknown>;
  if (!PHASES.includes(s.phase as TimerPhase)) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const startedAt = num(s.startedAt), setLengthMin = num(s.setLengthMin), warnAtMin = num(s.warnAtMin);
  if (startedAt === null || setLengthMin === null || warnAtMin === null) return null;
  return {
    type: 'state',
    snap: {
      phase: s.phase as TimerPhase, startedAt, setLengthMin, warnAtMin,
      name: String(s.name ?? ''), position: String(s.position ?? ''), next: String(s.next ?? ''),
    },
  };
}

export interface TimerView {
  /** The big number: time left (counting down), or the overtime once the set is over. */
  text: string;
  state: TimerState;
  /** Small caption under the number. */
  caption: string;
  /** Header line above the name. */
  heading: string;
  /** 0-100 of the set used. */
  pct: number;
}

/** What the pop-out window shows for a snapshot at wall-clock time `now`. */
export function timerView(snap: TimerSnapshot, now: number): TimerView {
  const total = snap.setLengthMin * 60_000;
  if (snap.phase === 'timing') {
    const elapsed = Math.max(0, now - snap.startedAt);
    const st = timerStatus(elapsed, snap.setLengthMin, snap.warnAtMin);
    const over = st.state === 'over';
    return {
      // Round a countdown up so it reads 0:01 until time is genuinely up, like a kitchen timer.
      text: over ? (st.overMs < 1000 ? '0:00' : `+${formatClock(st.overMs)}`) : formatClock(Math.ceil(st.remainingMs / 1000) * 1000),
      state: st.state,
      caption: over ? 'OVER TIME. Please wrap up' : `of ${snap.setLengthMin} min`,
      heading: 'On stage',
      pct: total > 0 ? Math.min(100, (elapsed / total) * 100) : 0,
    };
  }
  if (snap.phase === 'done') return { text: '—', state: 'idle', caption: 'Show complete', heading: '', pct: 0 };
  return {
    text: formatClock(total), state: 'idle', pct: 0,
    caption: `${snap.setLengthMin} min set`,
    heading: snap.phase === 'walkup' ? 'Walk-up playing' : 'Up next',
  };
}
