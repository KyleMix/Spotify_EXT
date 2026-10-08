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
  /** The only thing on the comic's screen: how long they have been on stage, counting up from 0:00. */
  text: string;
  state: TimerState;
}

/** What the pop-out window shows for a snapshot at wall-clock time `now`. */
export function timerView(snap: TimerSnapshot, now: number): TimerView {
  if (snap.phase === 'done') return { text: '', state: 'idle' }; // show over: a blank black screen
  if (snap.phase !== 'timing') return { text: '0:00', state: 'idle' };
  // Counts up and keeps going past the set length; the colour (yellow, then red) says when to wrap up.
  const elapsed = Math.max(0, now - snap.startedAt);
  return { text: formatClock(elapsed), state: timerStatus(elapsed, snap.setLengthMin, snap.warnAtMin).state };
}
