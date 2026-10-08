import { describe, expect, it } from 'vitest';
import { parseMessage, timerView, type TimerSnapshot } from './timerSync';

const snap = (over: Partial<TimerSnapshot> = {}): TimerSnapshot => ({
  phase: 'timing', name: 'Sam', startedAt: 1_000_000, setLengthMin: 5, warnAtMin: 1, position: '1 of 3', next: 'Alex', ...over,
});

describe('timerView', () => {
  it('counts up from 0:00', () => {
    expect(timerView(snap(), 1_000_000).text).toBe('0:00');
    expect(timerView(snap(), 1_000_000 + 61_500).text).toBe('1:01');
  });
  it('turns yellow inside the warning window and red when over, still counting up', () => {
    expect(timerView(snap(), 1_000_000 + 239_000).state).toBe('ok');
    expect(timerView(snap(), 1_000_000 + 241_000).state).toBe('warn');
    const over = timerView(snap(), 1_000_000 + 330_000);
    expect(over.state).toBe('over');
    expect(over.text).toBe('5:30');
  });
  it('goes blank when the show is over', () => {
    expect(timerView(snap({ phase: 'done' }), 5).text).toBe('');
  });
  it('reads 0:00 before the timer starts', () => {
    const v = timerView(snap({ phase: 'cued' }), 5);
    expect(v.text).toBe('0:00');
    expect(v.state).toBe('idle');
  });
});

describe('parseMessage', () => {
  it('accepts a state message and rejects junk', () => {
    expect(parseMessage({ type: 'state', snap: snap() })?.type).toBe('state');
    expect(parseMessage({ type: 'hello' })).toEqual({ type: 'hello' });
    expect(parseMessage({ type: 'state', snap: { ...snap(), phase: 'nope' } })).toBeNull();
    expect(parseMessage({ type: 'state', snap: { ...snap(), startedAt: 'x' } })).toBeNull();
    expect(parseMessage(null)).toBeNull();
  });
});
