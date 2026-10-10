import { describe, expect, it } from 'vitest';
import { clampLooksState, defaultLooks, momentsUsing, showMoment } from './looks';

const base = { done: false, phase: 'timing' as const, setLengthMin: 10, warnAtMin: 2, pulseSec: 3, redCues: true };
const min = 60_000;

describe('showMoment', () => {
  it('walk-up, between acts and end of show', () => {
    expect(showMoment({ ...base, phase: 'walkup', elapsedMs: 0 })).toBe('walkup');
    expect(showMoment({ ...base, phase: 'cued', elapsedMs: 0 })).toBe('between');
    expect(showMoment({ ...base, done: true, elapsedMs: 0 })).toBe('closing');
  });
  it('on stage, then the light warning for the flash length, then on stage, then time is up', () => {
    expect(showMoment({ ...base, elapsedMs: 8 * min - 1 })).toBe('onstage');
    expect(showMoment({ ...base, elapsedMs: 8 * min })).toBe('warning');
    expect(showMoment({ ...base, elapsedMs: 8 * min + 2999 })).toBe('warning');
    expect(showMoment({ ...base, elapsedMs: 8 * min + 3000 })).toBe('onstage');
    expect(showMoment({ ...base, elapsedMs: 10 * min })).toBe('timeup');
    expect(showMoment({ ...base, elapsedMs: 15 * min })).toBe('timeup');
  });
  it('flash length 0 holds the warning until time is up', () => {
    expect(showMoment({ ...base, pulseSec: 0, elapsedMs: 9 * min })).toBe('warning');
  });
  it('pop-out timer mode never goes red', () => {
    expect(showMoment({ ...base, redCues: false, elapsedMs: 8 * min })).toBe('onstage');
    expect(showMoment({ ...base, redCues: false, elapsedMs: 12 * min })).toBe('onstage');
  });
});

describe('looks state', () => {
  it('starts with looks for every show moment', () => {
    const s = defaultLooks();
    expect(s.cues).toEqual({ walkup: 'sound', onstage: 'stage-white', warning: 'warning-red', timeup: 'time-up', between: 'sound', closing: 'rainbow' });
    expect(s.looks.find((l) => l.id === 'warning-red')?.fadeMs).toBe(0);
  });
  it('carries the old white level into the Stage white look', () => {
    expect(defaultLooks(80).looks.find((l) => l.id === 'stage-white')?.all.intensity).toBe(0.8);
  });
  it('cleans saved state: unknown effects, out-of-range values, cues to missing looks', () => {
    const s = clampLooksState({
      looks: [{ id: 'a', name: 'A', fadeMs: 99999, all: { effect: 'bogus' as never, colors: [{ r: 300, g: -1, b: 5 }], speed: 50, intensity: 2 }, perFixture: {} }],
      cues: { walkup: 'a', onstage: 'gone', warning: '', timeup: 'a', between: 'a', closing: 'a' },
    });
    expect(s.looks[0]).toMatchObject({ fadeMs: 20000, all: { effect: 'solid', colors: [{ r: 255, g: 0, b: 5 }], speed: 10, intensity: 1 } });
    expect(s.cues.onstage).toBe('');
    expect(s.cues.warning).toBe('');
    expect(momentsUsing(s, 'a').map((m) => m.id)).toEqual(['walkup', 'timeup', 'between', 'closing']);
  });
});
