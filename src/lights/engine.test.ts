import { describe, expect, it } from 'vitest';
import { GREEN, RED, WHITE } from './color';
import { LightEngine } from './engine';

function engine() {
  const e = new LightEngine();
  e.setRig({ fixtures: [], customProfiles: [] });
  e.addFixture('chauvet-4bar-flex', '15ch', 'Bar');
  e.addFixture('irradiant-neo-slim-bar-48', '12ch', 'Neo');
  return e;
}
const pod1 = (e: LightEngine) => Array.from(e.universe.slice(4, 7));
const neoPar1 = (e: LightEngine) => Array.from(e.universe.slice(16, 19));

describe('LightEngine', () => {
  it('adds lights back to back', () => {
    const e = engine();
    expect(e.rig.fixtures.map((f) => f.address)).toEqual([1, 16]);
  });
  it('stage lights follow the show: white during a set, dark when the show is off', () => {
    const e = engine();
    e.setStageMode('white'); e.tick(0);
    expect(pod1(e)).toEqual([255, 255, 255]);
    e.setStageMode('off'); e.tick(0);
    expect(pod1(e)).toEqual([0, 0, 0]);
  });
  it('warning lights show the warning color', () => {
    const e = engine();
    e.updateFixture(e.rig.fixtures[1].id, { role: 'warning' });
    e.setShowColor(RED); e.tick(0);
    expect(neoPar1(e)).toEqual([255, 0, 0]);
    expect(pod1(e)).toEqual([0, 0, 0]);
  });
  it('a test color beats the show; the tester beats a test color; blackout beats everything', () => {
    const e = engine();
    e.setStageMode('white');
    e.test(GREEN); e.tick(0);
    expect(pod1(e)).toEqual([0, 255, 0]);
    e.setRaw(e.rig.fixtures[0].id, { 4: 7 }); e.tick(0);
    expect(e.universe[4]).toBe(7);
    expect(neoPar1(e)).toEqual([0, 0, 0]); // solo: other lights dark while testing
    e.setSoloTester(false); e.tick(0);
    expect(neoPar1(e)).toEqual([0, 255, 0]);
    e.setBlackout(true); e.tick(0);
    expect(Array.from(e.universe.slice(1, 28)).every((v) => v === 0)).toBe(true);
    e.test(WHITE, 1); // leaves a timer; harmless in tests
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
  it('custom light types can only be deleted once no light uses them', () => {
    const e = engine();
    const id = e.saveProfile({ name: 'Mine', modes: [{ id: 'm', name: 'M', channels: [{ type: 'red', home: 0 }] }] });
    e.addFixture(id, 'm');
    expect(e.deleteProfile(id)).toBe(false);
    e.removeFixture(e.rig.fixtures[2].id);
    expect(e.deleteProfile(id)).toBe(true);
  });
});
