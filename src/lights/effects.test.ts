import { describe, expect, it } from 'vitest';
import { BLUE, GREEN, OFF, RED } from './color';
import { effectColor, MAX_STROBE_HZ, mix, type Layer } from './effects';

const L = (p: Partial<Layer>): Layer => ({ effect: 'solid', colors: [RED], speed: 1, intensity: 1, ...p });
const at = (layer: Layer, tMs: number, pixel = 0, globalIndex = pixel, globalCount = 8) =>
  effectColor(layer, { tMs, pixel, globalIndex, globalCount, sound: BLUE });

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
  it('sound uses the frame\'s sound color; off is dark', () => {
    expect(at(L({ effect: 'sound' }), 0)).toEqual(BLUE);
    expect(at(L({ effect: 'off' }), 0)).toEqual(OFF);
  });
  it('mix blends linearly and clamps', () => {
    expect(mix(RED, GREEN, 0.5)).toEqual({ r: 128, g: 128, b: 0 });
    expect(mix(RED, GREEN, 2)).toEqual(GREEN);
  });
});
