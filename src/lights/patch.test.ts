import { describe, expect, it } from 'vitest';
import {
  channelOwners, clampRig, dipSwitches, displayAddress, footprint, migrateOldConfig, nextFreeAddress, rigIssues,
  type PatchedFixture, type Rig,
} from './patch';
import { BUILT_IN_PROFILES, channelLabel, findMode, pixelCount } from './profiles';

const bar = (id: string, address: number, modeId = '15ch'): PatchedFixture =>
  ({ id, name: id, profileId: 'chauvet-4bar-flex', modeId, address });
const neo = (id: string, address: number): PatchedFixture =>
  ({ id, name: id, profileId: 'irradiant-neo-slim-bar-48', modeId: '12ch', address });
const rigOf = (...fixtures: PatchedFixture[]): Rig => ({ fixtures, customProfiles: [] });

describe('built-in profiles', () => {
  const m15 = findMode(BUILT_IN_PROFILES, 'chauvet-4bar-flex', '15ch')!;
  it('4BAR Flex 15-CH: control, dimmer, strobe, then RGB for each of 4 pods', () => {
    expect(m15.channels).toHaveLength(15);
    expect(m15.channels.slice(0, 3).map((c) => [c.type, c.home])).toEqual([['control', 0], ['intensity', 255], ['strobe', 0]]);
    expect(m15.channels.slice(3).map((c) => `${c.type}${c.pixel}`)).toEqual([
      'red1', 'green1', 'blue1', 'red2', 'green2', 'blue2', 'red3', 'green3', 'blue3', 'red4', 'green4', 'blue4']);
    expect(pixelCount(m15)).toBe(4);
  });
  it('4BAR Flex 3-CH is one color for the whole bar', () => {
    expect(pixelCount(findMode(BUILT_IN_PROFILES, 'chauvet-4bar-flex', '3ch')!)).toBe(1);
  });
  it('labels channels in the light\'s own words', () => {
    expect(channelLabel(m15.channels[11], m15, 'Pod')).toBe('Pod 3 blue');
    expect(channelLabel(m15.channels[1], m15, 'Pod')).toBe('Dimmer');
  });
});

describe('rig', () => {
  it('measures footprints from the mode', () => {
    expect(footprint(rigOf(), bar('a', 1))).toBe(15);
    expect(footprint(rigOf(), neo('b', 16))).toBe(12);
  });
  it('places the next light right after the last one', () => {
    expect(nextFreeAddress(rigOf(), 15)).toBe(1);
    expect(nextFreeAddress(rigOf(bar('a', 1)), 12)).toBe(16);
    expect(nextFreeAddress(rigOf(bar('a', 500)), 15)).toBe(498);
  });
  it('finds overlapping lights and the shared channel range', () => {
    expect(rigIssues(rigOf(bar('a', 1), neo('b', 16)))).toEqual([]);
    expect(rigIssues(rigOf(bar('a', 1), neo('b', 10)))).toEqual([{ kind: 'overlap', a: 'a', b: 'b', from: 10, to: 15 }]);
  });
  it('flags lights running past channel 512 and unknown light types', () => {
    expect(rigIssues(rigOf(bar('a', 505)))).toEqual([{ kind: 'past512', id: 'a' }]);
    const r = rigOf({ ...bar('x', 1), profileId: 'gone' });
    expect(rigIssues(r)[0]).toEqual({ kind: 'missingProfile', id: 'x' });
  });
  it('maps every channel to its light', () => {
    const o = channelOwners(rigOf(bar('a', 1), neo('b', 16)));
    expect(o[1]).toBe('a'); expect(o[15]).toBe('a'); expect(o[16]).toBe('b'); expect(o[27]).toBe('b'); expect(o[28]).toBeNull();
  });
  it('cleans saved rigs: unknown modes fall back to the first mode, addresses stay in range', () => {
    const r = clampRig({ fixtures: [{ ...bar('a', 9999), modeId: 'nope' }] });
    expect(r.fixtures[0]).toMatchObject({ modeId: '15ch', address: 512 });
  });
});

describe('addresses on the light', () => {
  it('shows display addresses as d001', () => {
    expect(displayAddress(1)).toBe('d001');
    expect(displayAddress(16)).toBe('d016');
  });
  it('works out which DIP switches to turn on (switch n = 2^(n-1))', () => {
    expect(dipSwitches(1)).toEqual([1]);
    expect(dipSwitches(16)).toEqual([5]);
    expect(dipSwitches(19)).toEqual([1, 2, 5]);
    expect(dipSwitches(512)).toEqual([10]);
  });
});

describe('migrating old settings', () => {
  it('maps known lights onto built-in profiles', () => {
    const r = migrateOldConfig({ fixtures: [
      { name: 'Chauvet 4BAR Flex', role: 'stage', address: 31, red: 1, green: 2, blue: 3, dimmer: 0, heads: 1, headSpacing: 3, channels: 3 },
      { name: 'Neo-Slim Par Bar', role: 'stage', address: 1, red: 1, green: 2, blue: 3, dimmer: 0, heads: 4, headSpacing: 3, channels: 12 },
    ] });
    expect(r.fixtures.map((f) => [f.profileId, f.modeId, f.address])).toEqual([
      ['chauvet-4bar-flex', '3ch', 31], ['irradiant-neo-slim-bar-48', '12ch', 1]]);
    expect(r.customProfiles).toEqual([]);
  });
  it('keeps unusual channel layouts exactly, as a custom light type', () => {
    const r = migrateOldConfig({ fixtures: [{ name: 'Odd', address: 1, red: 5, green: 6, blue: 7, dimmer: 1, channels: 7 }] });
    const ch = r.customProfiles[0].modes[0].channels;
    expect(ch.map((c) => c.type)).toEqual(['intensity', 'other', 'other', 'other', 'red', 'green', 'blue']);
    expect(r.fixtures[0]).toMatchObject({ profileId: r.customProfiles[0].id, address: 1 });
  });
  it('reads the original single-light format', () => {
    const r = migrateOldConfig({ address: 7, red: 1, green: 2, blue: 3, dimmer: 0 });
    expect(r.fixtures[0]).toMatchObject({ profileId: 'generic-rgb', address: 7 });
  });
});
