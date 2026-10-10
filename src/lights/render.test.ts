import { describe, expect, it } from 'vitest';
import { BLUE, GREEN, OFF, RED, WHITE } from './color';
import type { PatchedFixture, Rig } from './patch';
import { checkLook, checkSteps, describeStep, renderUniverse, usedSlots } from './render';

const bar: PatchedFixture = { id: 'bar', name: '4BAR', profileId: 'chauvet-4bar-flex', modeId: '15ch', address: 1, role: 'stage' };
const neo: PatchedFixture = { id: 'neo', name: 'Neo', profileId: 'irradiant-neo-slim-bar-48', modeId: '12ch', address: 16, role: 'stage' };
const rig: Rig = { fixtures: [bar, neo], customProfiles: [] };
const slice = (u: Uint8Array, from: number, to: number) => Array.from(u.slice(from, to + 1));

describe('renderUniverse', () => {
  it('holds the 4BAR control channels at home: mode 0, dimmer full, strobe off', () => {
    const u = renderUniverse(rig, { bar: { colors: [RED] } });
    expect(slice(u, 1, 3)).toEqual([0, 255, 0]);
    expect(slice(u, 4, 15)).toEqual([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0]);
    expect(u[0]).toBe(0);
  });
  it('gives each pod its own color', () => {
    const u = renderUniverse(rig, { bar: { colors: [RED, GREEN, BLUE, WHITE] } });
    expect(slice(u, 4, 15)).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  });
  it('drives the dimmer channel from intensity, or scales colors when a light has no dimmer', () => {
    const u = renderUniverse(rig, { bar: { colors: [RED], intensity: 0.5 }, neo: { colors: [WHITE], intensity: 0.5 } });
    expect(u[2]).toBe(128);
    expect(u[4]).toBe(255);
    expect(slice(u, 16, 18)).toEqual([128, 128, 128]);
  });
  it('a light with no look is dark but keeps its control channels', () => {
    const u = renderUniverse(rig, {});
    expect(slice(u, 1, 3)).toEqual([0, 255, 0]);
    expect(slice(u, 4, 27).every((v) => v === 0)).toBe(true);
  });
  it('blackout zeroes colors and dimmer but never touches the operating-mode channel', () => {
    const u = renderUniverse(rig, { bar: { colors: [WHITE] }, neo: { colors: [WHITE] } }, { blackout: true });
    expect(slice(u, 1, 27).every((v) => v === 0)).toBe(true);
  });
  it('raw tester values override one light; solo keeps the others dark', () => {
    const u = renderUniverse(rig, { bar: { colors: [WHITE] }, neo: { colors: [WHITE] } },
      { raw: { fixtureId: 'neo', values: { 7: 200, 99: 255 } }, soloFixtureId: 'neo' });
    expect(u[22]).toBe(200);
    expect(slice(u, 4, 15).every((v) => v === 0)).toBe(true);
    expect(u[16]).toBe(255);
  });
  it('sends only as many channels as the rig uses, but at least 24', () => {
    expect(usedSlots(rig)).toBe(27);
    expect(usedSlots({ fixtures: [], customProfiles: [] })).toBe(24);
  });
});

describe('rig check', () => {
  it('steps every pixel of every light through red, green, blue, white', () => {
    const steps = checkSteps(rig);
    expect(steps).toHaveLength(4 * 4 + 4 * 4);
    expect(describeStep(rig, steps[0])).toBe('4BAR · Pod 1 of 4 · red');
    expect(describeStep(rig, steps[16 + 9])).toBe('Neo · Par 3 of 4 · green');
  });
  it('lights only the pixel being checked', () => {
    const look = checkLook(checkSteps(rig)[9]); // pod 3, green
    expect(look.colors).toEqual([OFF, OFF, GREEN, OFF]);
  });
});
