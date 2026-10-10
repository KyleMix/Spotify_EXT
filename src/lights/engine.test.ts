import { describe, expect, it } from 'vitest';
import { GREEN, RED } from './color';
import { LightEngine } from './engine';
import { clampLayer } from './looks';

function engine() {
  const e = new LightEngine();
  e.setRig({ fixtures: [], customProfiles: [] });
  e.addFixture('chauvet-4bar-flex', '15ch', 'Bar');
  e.addFixture('irradiant-neo-slim-bar-48', '12ch', 'Neo');
  return e;
}
const pod1 = (e: LightEngine) => Array.from(e.universe.slice(4, 7));
const neoPar1 = (e: LightEngine) => Array.from(e.universe.slice(16, 19));
const T = 1_000_000;

describe('LightEngine: looks and the show', () => {
  it('adds lights back to back', () => {
    expect(engine().rig.fixtures.map((f) => f.address)).toEqual([1, 16]);
  });
  it('is dark with Live mode closed and nothing fired', () => {
    const e = engine(); e.tick(T); e.tick(T + 600);
    expect(pod1(e)).toEqual([0, 0, 0]);
    expect(e.universe[2]).toBe(255); // 4BAR dimmer channel held at home
  });
  it('each show moment fires its cue: on stage = Stage white', () => {
    const e = engine();
    e.setShowMoment('onstage'); e.tick(T); e.tick(T + 1000);
    expect(pod1(e)).toEqual([255, 255, 255]);
    expect(neoPar1(e)).toEqual([255, 255, 255]);
  });
  it('the light warning snaps red with no fade', () => {
    const e = engine();
    e.setShowMoment('onstage'); e.tick(T); e.tick(T + 1000);
    e.setShowMoment('warning'); e.tick(T + 1001);
    expect(pod1(e)).toEqual([255, 0, 0]);
  });
  it('crossfades over the fade time of the new look', () => {
    const e = engine();
    e.setShowMoment('onstage'); e.tick(T); e.tick(T + 1000);          // white
    e.saveLook({ id: 'g', name: 'Green', fadeMs: 1000, all: clampLayer({ effect: 'solid', colors: [GREEN] }), perFixture: {} });
    e.fireLook('g');
    e.tick(T + 2000);
    expect(pod1(e)).toEqual([255, 255, 255]);                         // fade starts from what was showing
    e.tick(T + 2500);
    expect(pod1(e)).toEqual([128, 255, 128]);                         // halfway
    e.tick(T + 3000);
    expect(pod1(e)).toEqual([0, 255, 0]);
  });
  it('a look fired by hand holds over the show until released', () => {
    const e = engine();
    e.setShowMoment('onstage');
    e.fireLook('warning-red'); e.tick(T);
    expect(e.activeLookId).toBe('warning-red');
    e.setShowMoment('between'); e.tick(T + 10);
    expect(pod1(e)).toEqual([255, 0, 0]);
    e.releaseLook();
    expect(e.activeLookId).toBe('sound');
  });
  it('master dimmer drives dimmer channels and scales lights without one', () => {
    const e = engine();
    e.setShowMoment('onstage'); e.setMaster(0.5); e.tick(T); e.tick(T + 1000);
    expect(e.universe[2]).toBe(128);
    expect(pod1(e)).toEqual([255, 255, 255]);
    expect(neoPar1(e)).toEqual([128, 128, 128]);
  });
  it('a light can have its own layer in a look', () => {
    const e = engine();
    const neoId = e.rig.fixtures[1].id;
    e.saveLook({ id: 'split', name: 'Split', fadeMs: 0, all: clampLayer({ effect: 'solid', colors: [GREEN] }),
      perFixture: { [neoId]: clampLayer({ effect: 'solid', colors: [RED] }) } });
    e.fireLook('split'); e.tick(T);
    expect(pod1(e)).toEqual([0, 255, 0]);
    expect(neoPar1(e)).toEqual([255, 0, 0]);
  });
  it('a chase runs across every pod and par of the whole rig', () => {
    const e = engine();
    e.saveLook({ id: 'c', name: 'C', fadeMs: 0, all: clampLayer({ effect: 'chase', colors: [RED], speed: 0.5 }), perFixture: {} });
    e.fireLook('c');
    e.tick(0);
    expect(pod1(e)).toEqual([255, 0, 0]);
    e.tick(4000); // speed 0.5 → 1 step a second: step 4 = the Neo's first par
    expect(pod1(e)).toEqual([0, 0, 0]);
    expect(neoPar1(e)).toEqual([255, 0, 0]);
  });
});

describe('LightEngine: priorities', () => {
  it('test color beats looks; the tester beats a test color; blackout beats everything', () => {
    const e = engine();
    e.setShowMoment('onstage'); e.tick(T); e.tick(T + 1000);
    e.test(GREEN); e.tick(T + 1001);
    expect(pod1(e)).toEqual([0, 255, 0]);
    e.setRaw(e.rig.fixtures[0].id, { 4: 7 }); e.tick(T + 1002);
    expect(e.universe[4]).toBe(7);
    expect(neoPar1(e)).toEqual([0, 0, 0]); // solo: other lights dark while testing
    e.setSoloTester(false); e.tick(T + 1003);
    expect(neoPar1(e)).toEqual([0, 255, 0]);
    e.setBlackout(true); e.tick(T + 1004);
    expect(Array.from(e.universe.slice(1, 28)).every((v) => v === 0)).toBe(true);
    e.test({ r: 0, g: 0, b: 0 }); // cancel the timer
  });
  it('rig check walks every pixel and stops at the end', () => {
    const e = engine();
    e.startCheck();
    const start = Date.now();
    e.tick(start);
    expect(pod1(e)).toEqual([255, 0, 0]);
    e.tick(start + 950);
    expect(pod1(e)).toEqual([0, 255, 0]);
    e.stepCheck(1); e.tick(e.check!.stepStartedAt);
    expect(pod1(e)).toEqual([0, 0, 255]);
    e.stopCheck(); expect(e.check).toBeNull();
  });
});

describe('LightEngine: keys and editing', () => {
  it('a key fires its look; the release key goes back to the show', () => {
    const e = engine();
    e.saveLook({ ...e.looks.find((l) => l.id === 'rainbow')!, key: 'F13' });
    e.setReleaseKey('F14');
    expect(e.handleKey('F13')).toBe(true);
    expect(e.manualLookId).toBe('rainbow');
    expect(e.handleKey('F14')).toBe(true);
    expect(e.manualLookId).toBeNull();
    expect(e.handleKey('KeyQ')).toBe(false);
  });
  it('a key belongs to one look at a time', () => {
    const e = engine();
    e.saveLook({ ...e.looks.find((l) => l.id === 'rainbow')!, key: 'F13' });
    e.saveLook({ ...e.looks.find((l) => l.id === 'warm')!, key: 'F13' });
    expect(e.looks.filter((l) => l.key === 'F13').map((l) => l.id)).toEqual(['warm']);
  });
  it('looks used by a show cue cannot be deleted', () => {
    const e = engine();
    expect(e.deleteLook('stage-white')).toBe(false);
    expect(e.deleteLook('chase')).toBe(true);
    e.setCue('onstage', 'warm');
    expect(e.deleteLook('stage-white')).toBe(true);
  });
  it('custom light types can only be deleted once no light uses them', () => {
    const e = engine();
    const id = e.saveProfile({ name: 'Mine', modes: [{ id: 'm', name: 'M', channels: [{ type: 'red', home: 0 }] }] });
    e.addFixture(id, 'm');
    expect(e.deleteProfile(id)).toBe(false);
    e.removeFixture(e.rig.fixtures[2].id);
    expect(e.deleteProfile(id)).toBe(true);
  });
});
