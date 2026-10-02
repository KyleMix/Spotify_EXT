import { describe, expect, it } from 'vitest';
import { formatClock, mergeData, moveItem, newShow, timerStatus, totalPlannedMin, newSlot, resizeActs, isBlankSlot, slotName, MAX_SPOTS, applyWalkOffToAll, slotDefaults, showTrackUris } from './lib';

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

import { nudgeStart, hasWalkOff, parseTimeInput, suggestionQuery, suggestionUrl, SUGGESTION_STYLES } from './lib';

describe('suggestionQuery / suggestionUrl', () => {
  const rush = { name: 'Tom Sawyer', artist: 'Rush' };
  it('asks for seconds and includes the clip length', () => {
    const q = suggestionQuery(rush, 'walk-up', 25_000);
    expect(q).toContain('"Tom Sawyer" by Rush');
    expect(q).toContain('25 second comedian walk-on clip');
    expect(q).toMatch(/in seconds/);
    expect(q).toMatch(/not minutes:seconds/);
  });
  it('words walk-off and end-of-show differently', () => {
    expect(suggestionQuery(rush, 'walk-off', 12_000)).toContain('12 second walk-off clip');
    expect(suggestionQuery(rush, 'end-of-show', 0)).toContain('end-of-show closing clip');
    expect(suggestionQuery(rush, 'end-of-show', 0)).not.toContain('0 second');
  });
  it('has distinct wording per style', () => {
    const qs = new Set(SUGGESTION_STYLES.map((s) => suggestionQuery(rush, 'walk-up', 25_000, s.id)));
    expect(qs.size).toBe(SUGGESTION_STYLES.length);
    expect(suggestionQuery(rush, 'walk-up', 25_000, 'chorus')).toContain('first chorus');
    expect(suggestionQuery(rush, 'walk-off', 12_000, 'chorus')).toContain('final chorus');
  });
  it('builds an encoded Google URL', () => {
    const url = new URL(suggestionUrl({ name: "Ain't That A Shame & More", artist: 'Fats Domino' }, 'walk-off', 12_000));
    expect(url.hostname).toBe('www.google.com');
    expect(url.searchParams.get('q')).toContain("Ain't That A Shame & More");
    expect(url.search).not.toContain('& More');
  });
});

describe('nudgeStart', () => {
  it('moves by seconds and rounds to 0.1s', () => {
    expect(nudgeStart(41_000, 5, 276_000)).toBe(46_000);
    expect(nudgeStart(41_000, -0.5, 276_000)).toBe(40_500);
    expect(nudgeStart(41_040, 1, 276_000)).toBe(42_000);
  });
  it('stays inside the song', () => {
    expect(nudgeStart(2_000, -5, 276_000)).toBe(0);
    expect(nudgeStart(275_000, 5, 276_000)).toBe(275_000);
    expect(nudgeStart(0, 5, 0)).toBe(0);
  });
});

describe('parseTimeInput', () => {
  it('parses seconds and m:ss forms', () => {
    expect(parseTimeInput('41')).toBe(41);
    expect(parseTimeInput(' 41s ')).toBe(41);
    expect(parseTimeInput('41 seconds')).toBe(41);
    expect(parseTimeInput('0:41')).toBe(41);
    expect(parseTimeInput('1:05')).toBe(65);
    expect(parseTimeInput('1:02:03')).toBe(3723);
    expect(parseTimeInput('41.5')).toBe(41.5);
  });
  it('rejects junk and negatives', () => {
    for (const bad of ['', 'abc', '-5', '1:2:3:4', '0:4x', ':']) expect(parseTimeInput(bad)).toBeNull();
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

describe('resizeActs', () => {
  const acts = (n: number) => Array.from({ length: n }, (_, i) => newSlot({ performer: `P${i}` }));
  it('adds blank comedian spots at the end', () => {
    const r = resizeActs(acts(2), 5);
    expect(r).toHaveLength(5);
    expect(r.slice(0, 2).map((s) => s.performer)).toEqual(['P0', 'P1']);
    expect(r.slice(2).every(isBlankSlot)).toBe(true);
  });
  it('removes from the end and keeps hosts and breaks', () => {
    const list = [...acts(3), newSlot({ type: 'break', performer: 'Break' })];
    const r = resizeActs(list, 1);
    expect(r.map((s) => s.performer)).toEqual(['P0', 'Break']);
  });
  it('never removes slots before keepFrom', () => {
    expect(resizeActs(acts(4), 0, 2).map((s) => s.performer)).toEqual(['P0', 'P1']);
  });
  it('clamps to the maximum', () => {
    expect(resizeActs([], 999)).toHaveLength(MAX_SPOTS);
  });
});

describe('slotName', () => {
  it('falls back to Spot N', () => {
    expect(slotName(newSlot(), 2)).toBe('Spot 3');
    expect(slotName(newSlot({ performer: ' Sam ' }), 0)).toBe('Sam');
  });
});

describe('show defaults and bulk walk-off', () => {
  it('new spots use the show defaults', () => {
    const r = resizeActs([], 2, 0, { cueLengthMs: 12000, setLengthMin: 5, warnAtMin: 1 });
    expect(r.every((s) => s.cueLengthMs === 12000 && s.setLengthMin === 5 && s.warnAtMin === 1)).toBe(true);
  });
  it('falls back to built-in defaults', () => {
    expect(slotDefaults(newShow()).setLengthMin).toBe(10);
  });
  it('applies a walk-off to comedians only', () => {
    const track = { uri: 'u', name: 'n', artist: 'a', durationMs: 1000 };
    const from = newSlot({ walkOffTrack: track, walkOffStartMs: 3000, walkOffCueMs: 9000 });
    const host = newSlot({ type: 'host' });
    const out = applyWalkOffToAll([from, newSlot(), host], from);
    expect(out[1].walkOffTrack).toEqual(track);
    expect(out[1].walkOffCueMs).toBe(9000);
    expect(out[2].walkOffTrack).toBeUndefined();
  });
});

describe('showTrackUris', () => {
  it('collects every distinct song in the show', () => {
    const tk = (u: string) => ({ uri: u, name: u, artist: 'a', durationMs: 1 });
    const show = newShow({ closingTrack: tk('c'), slots: [newSlot({ track: tk('a'), walkOffTrack: tk('b') }), newSlot({ track: tk('a') })] });
    expect(showTrackUris(show).sort()).toEqual(['a', 'b', 'c']);
  });
});
