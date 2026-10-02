import { describe, expect, it } from 'vitest';
import { addRecent, filterTracks, isFresh } from './bank';
import { findUnplayable, parseTrackItems } from '../spotify/api';
import type { Track } from '../types';

const t = (uri: string, name: string, artist: string): Track => ({ uri, name, artist, durationMs: 1000 });

describe('filterTracks', () => {
  const list = [t('1', 'Eye of the Tiger', 'Survivor'), t('2', 'Tiger Rag', 'Louis Armstrong'), t('3', 'Hello', 'Adele')];
  it('returns everything for an empty query', () => expect(filterTracks(list, '  ')).toHaveLength(3));
  it('matches song or artist, all words required, any case', () => {
    expect(filterTracks(list, 'TIGER').map((x) => x.uri)).toEqual(['1', '2']);
    expect(filterTracks(list, 'tiger survivor').map((x) => x.uri)).toEqual(['1']);
    expect(filterTracks(list, 'adele')).toHaveLength(1);
  });
});

describe('parseTrackItems', () => {
  const raw = (o: object) => ({ uri: 'spotify:track:1', name: 'A', duration_ms: 5, artists: [{ name: 'X' }], album: { images: [] }, ...o });
  it('reads track or item and skips episodes, local files and nulls', () => {
    const out = parseTrackItems([
      { track: raw({}) }, { item: raw({ uri: 'spotify:track:2' }) }, { track: null },
      { track: raw({ is_local: true }) }, { track: raw({ type: 'episode' }) },
    ]);
    expect(out.map((x) => x.uri)).toEqual(['spotify:track:1', 'spotify:track:2']);
  });
});

describe('recent + cache freshness', () => {
  it('puts newest first, de-duplicates and caps the list', () => {
    let l: Track[] = [];
    for (let i = 0; i < 20; i++) l = addRecent(l, t(String(i), 'n', 'a'));
    l = addRecent(l, t('5', 'n', 'a'));
    expect(l).toHaveLength(15);
    expect(l[0].uri).toBe('5');
    expect(l.filter((x) => x.uri === '5')).toHaveLength(1);
  });
  it('is fresh only when complete and the snapshot matches', () => {
    const p = { id: 'p', name: 'P', total: 1, snapshotId: 's1' };
    expect(isFresh({ snapshotId: 's1', tracks: [], complete: true }, p)).toBe(true);
    expect(isFresh({ snapshotId: 's0', tracks: [], complete: true }, p)).toBe(false);
    expect(isFresh({ snapshotId: 's1', tracks: [], complete: false }, p)).toBe(false);
  });
});

describe('findUnplayable', () => {
  it('flags null entries and is_playable false, keeps the rest', () => {
    expect(findUnplayable(['a', 'b', 'c', 'd'], [{ is_playable: true }, null, { is_playable: false }, {}])).toEqual(['b', 'c']);
  });
});
