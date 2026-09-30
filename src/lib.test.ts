import { describe, expect, it } from 'vitest';
import { formatClock, mergeData, moveItem, newShow, timerStatus, totalPlannedMin, newSlot } from './lib';

describe('timerStatus', () => {
  it('is ok, warn, then over', () => {
    expect(timerStatus(0, 10, 2).state).toBe('ok');
    expect(timerStatus(8 * 60_000, 10, 2).state).toBe('warn');
    const over = timerStatus(11 * 60_000, 10, 2);
    expect(over.state).toBe('over');
    expect(over.overMs).toBe(60_000);
  });
});
describe('formatClock', () => {
  it('formats', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(-5000)).toBe('-0:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });
});
describe('moveItem', () => {
  it('reorders and ignores bad indexes', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, 9)).toEqual([1, 2, 3]);
  });
});
describe('mergeData', () => {
  it('keeps newest per show', () => {
    const a = newShow({ id: 'x', name: 'old', updatedAt: 1 });
    const b = newShow({ id: 'x', name: 'new', updatedAt: 2 });
    const c = newShow({ id: 'y', updatedAt: 1 });
    const m = mergeData({ version: 1, shows: [a, c] }, { version: 1, shows: [b] });
    expect(m.shows.find((s) => s.id === 'x')!.name).toBe('new');
    expect(m.shows).toHaveLength(2);
  });
});
describe('totalPlannedMin', () => {
  it('skips host slots', () => {
    const s = newShow({ slots: [newSlot({ setLengthMin: 10 }), newSlot({ type: 'host', setLengthMin: 5 })] });
    expect(totalPlannedMin(s)).toBe(10);
  });
});

import { hasWalkOff, suggestionUrl } from './lib';

describe('suggestionUrl', () => {
  it('builds an encoded Google search for the song and cue type', () => {
    const url = new URL(suggestionUrl({ name: 'Tom Sawyer', artist: 'Rush' }, 'walk-up'));
    expect(url.hostname).toBe('www.google.com');
    expect(url.searchParams.get('q')).toBe('Best walk-up time cue for Tom Sawyer by Rush');
  });
  it('encodes special characters', () => {
    const url = suggestionUrl({ name: 'Ain\'t That A Shame & More', artist: 'Fats Domino' }, 'walk-off');
    expect(url).not.toContain('&More');
    expect(new URL(url).searchParams.get('q')).toContain('& More');
  });
});

describe('hasWalkOff', () => {
  const track = { uri: 'spotify:track:x', name: 'n', artist: 'a', durationMs: 1000 };
  it('applies to comedians only, never hosts or breaks', () => {
    expect(hasWalkOff(newSlot({ type: 'act', walkOffTrack: track }))).toBe(true);
    expect(hasWalkOff(newSlot({ type: 'host', walkOffTrack: track }))).toBe(false);
    expect(hasWalkOff(newSlot({ type: 'break', walkOffTrack: track }))).toBe(false);
    expect(hasWalkOff(newSlot({ type: 'act' }))).toBe(false);
  });
});
