import { describe, expect, it } from 'vitest';
import { BLUE, GREEN, OFF, RED } from './color';
import { effectColor, MAX_STROBE_HZ, mix, type Layer } from './effects';
import type { AudioFeatures } from './sound';

const A = (p: Partial<AudioFeatures> = {}): AudioFeatures => ({
  level: 0.5, bass: 0.5, mid: 0.5, treble: 0, beat: false, beatCount: 0, lastBeatMs: 0, flash: 0, hue: 0, live: true, ...p,
});

const L = (p: Partial<Layer>): Layer => ({ effect: 'solid', colors: [RED], speed: 1, intensity: 1, ...p });
const at = (layer: Layer, tMs: number, pixel = 0, globalIndex = pixel, globalCount = 8, audio = A()) =>
  effectColor(layer, { tMs, pixel, globalIndex, globalCount, audio });

describe('effects', () => {
  it('solid alternates its colors across pixels and applies the level', () => {
    const l = L({ colors: [RED, GREEN] });
    expect([at(l, 0, 0), at(l, 0, 1), at(l, 0, 2)]).toEqual([RED, GREEN, RED]);
    expect(at(L({ intensity: 0.5 }), 0)).toEqual({ r: 128, g: 0, b: 0 });
  });
  it('pulse breathes between 30% and full, never dark', () => {
    const l = L({ effect: 'pulse', speed: 1 }); // one breath every 2 s
    expect(at(l, 0).r).toBe(77);
    expect(at(l, 1000).r).toBe(255);
  });
  it('chase lights one pixel of the whole rig at a time, background elsewhere', () => {
    const l = L({ effect: 'chase', colors: [RED, BLUE], speed: 0.5 }); // one step a second
    expect(at(l, 0, 0, 0)).toEqual(RED);
    expect(at(l, 0, 1, 1)).toEqual(BLUE);
    expect(at(l, 3000, 3, 3)).toEqual(RED);
    expect(at(l, 9000, 1, 1)).toEqual(RED); // wraps after 8 pixels
  });
  it('rainbow spreads hues across the rig', () => {
    const l = L({ effect: 'rainbow' });
    expect(at(l, 0, 0, 0)).toEqual(RED);
    expect(at(l, 0, 0, 4)).not.toEqual(at(l, 0, 0, 0));
  });
  it('strobe flashes, capped at the maximum rate', () => {
    const l = L({ effect: 'strobe', speed: 10 });
    expect(at(l, 0)).toEqual(RED);
    expect(at(l, 50)).toEqual(OFF);
    expect(MAX_STROBE_HZ).toBe(10);
  });
  it('off is dark', () => {
    expect(at(L({ effect: 'off' }), 0)).toEqual(OFF);
  });
  it('mix blends linearly and clamps', () => {
    expect(mix(RED, GREEN, 0.5)).toEqual({ r: 128, g: 128, b: 0 });
    expect(mix(RED, GREEN, 2)).toEqual(GREEN);
  });
});

describe('music effects', () => {
  it('beat colors: the beat color, brighter on a beat and when louder', () => {
    const quiet = at(L({ effect: 'sound' }), 0, 0, 0, 8, A({ level: 0.1 }));
    const hit = at(L({ effect: 'sound' }), 0, 0, 0, 8, A({ level: 0.8, flash: 1 }));
    expect(hit.r).toBeGreaterThan(quiet.r);
    expect(at(L({ effect: 'sound' }), 0, 0, 0, 8, A({ hue: 1 / 3, level: 1, flash: 1 }))).toEqual(GREEN);
  });
  it('beat colors with no microphone glow steadily at half brightness', () => {
    expect(at(L({ effect: 'sound' }), 0, 0, 0, 8, A({ live: false }))).toEqual({ r: 128, g: 0, b: 0 });
  });
  it('beat chase moves one pixel along the rig per beat', () => {
    const l = L({ effect: 'beat-chase', colors: [RED, BLUE] });
    expect(at(l, 0, 0, 3, 8, A({ beatCount: 3 }))).toEqual(RED);
    expect(at(l, 0, 0, 2, 8, A({ beatCount: 3 }))).toEqual(BLUE);
    expect(at(l, 0, 0, 1, 8, A({ beatCount: 9 }))).toEqual(RED); // wraps
  });
  it('ripple: a wave crosses the rig after each beat', () => {
    const l = L({ effect: 'ripple', speed: 1 }); // 400 ms to cross 8 pixels: 50 ms per pixel
    const audio = A({ lastBeatMs: 1000 });
    expect(at(l, 1000, 0, 0, 8, audio).r).toBe(255);   // wave at the start
    expect(at(l, 1000, 0, 7, 8, audio).r).toBeLessThan(40); // far end still dim
    expect(at(l, 1350, 0, 7, 8, audio).r).toBe(255);   // wave has arrived
  });
  it('music meter fills along the rig with the volume, green to red', () => {
    const l = L({ effect: 'meter' });
    const audio = A({ level: 0.5 }); // 4 of 8 pixels
    expect(at(l, 0, 0, 0, 8, audio)).toEqual(GREEN);
    expect(at(l, 0, 0, 3, 8, audio).r).toBeGreaterThan(0);
    expect(at(l, 0, 0, 4, 8, audio)).toEqual(OFF);
    expect(at(l, 0, 0, 7, 8, A({ level: 1 }))).toEqual(RED);
  });
  it('bands: thirds of the rig follow bass, mid and treble', () => {
    const l = L({ effect: 'bands', colors: [RED, GREEN, BLUE] });
    const audio = A({ bass: 1, mid: 0.5, treble: 0 });
    expect(at(l, 0, 0, 0, 9, audio)).toEqual(RED);
    expect(at(l, 0, 0, 4, 9, audio)).toEqual({ r: 0, g: 128, b: 0 });
    expect(at(l, 0, 0, 8, 9, audio)).toEqual(OFF);
  });
  it('color to music: your color, dimmer when quiet', () => {
    const l = L({ effect: 'level', colors: [RED] });
    expect(at(l, 0, 0, 0, 8, A({ level: 1 }))).toEqual(RED);
    expect(at(l, 0, 0, 0, 8, A({ level: 0 })).r).toBe(38);
  });
});
