import { describe, expect, it } from 'vitest';
import { describeAnswer, learnedProfile } from './learn';
import { BUILT_IN_PROFILES, pixelCount } from './profiles';

describe('learning a light', () => {
  const neo = BUILT_IN_PROFILES.find((p) => p.id === 'irradiant-neo-slim-bar-48')!;
  it('turns the answers into a light type, keeping the addressing and pixel name', () => {
    const p = learnedProfile({
      name: 'Neo-Slim', count: 5, base: neo,
      answers: { 1: { kind: 'mode' }, 2: { kind: 'color', color: 'red', pixel: 1 }, 3: { kind: 'color', color: 'green', pixel: 1 }, 5: { kind: 'strobe' } },
    });
    expect(p.name).toBe('Neo-Slim (learned)');
    expect(p.addressing).toBe('dip');
    expect(p.pixelName).toBe('Par');
    expect(p.modes[0].channels.map((c) => [c.type, c.pixel ?? 0, c.home])).toEqual([
      ['control', 0, 0], ['red', 1, 0], ['green', 1, 0], ['other', 0, 0], ['strobe', 0, 0]]);
    expect(pixelCount(p.modes[0])).toBe(1);
  });
  it('a color that lit the whole light covers every pixel', () => {
    const p = learnedProfile({ name: 'X', count: 1, answers: { 1: { kind: 'color', color: 'blue', pixel: 0 } } });
    expect(p.modes[0].channels[0]).toEqual({ type: 'blue', pixel: undefined, home: 0 });
  });
  it('describes answers in the light words', () => {
    expect(describeAnswer({ kind: 'color', color: 'red', pixel: 3 }, 'Par')).toBe('Par 3 red');
    expect(describeAnswer({ kind: 'color', color: 'red', pixel: 0 }, 'Par')).toBe('all red');
    expect(describeAnswer({ kind: 'nothing' })).toBe('nothing');
  });
});
