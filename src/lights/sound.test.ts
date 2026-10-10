import { describe, expect, it } from 'vitest';
import { bandLevels, hsvToRgb, idleColor, SoundColorizer, type Bands } from './sound';

const quiet: Bands = { bass: 0, mid: 0, treble: 0, level: 0 };
const kick: Bands = { bass: 0.9, mid: 0.3, treble: 0.05, level: 0.9 };
const brightness = (c: { r: number; g: number; b: number }) => Math.max(c.r, c.g, c.b);

describe('bandLevels', () => {
  it('splits the spectrum into bass, mid and treble', () => {
    // 512 bins over 0-24 kHz: ~47 Hz per bin. Fill only the bass bins (30-150 Hz).
    const data = new Uint8Array(512);
    for (let i = 1; i <= 3; i++) data[i] = 255;
    const b = bandLevels(data, 48000);
    expect(b.bass).toBeCloseTo(1);
    expect(b.mid).toBe(0);
    expect(b.treble).toBe(0);
    expect(b.level).toBeCloseTo(1);
  });
  it('is all zero for silence', () => {
    expect(bandLevels(new Uint8Array(512), 48000)).toEqual(quiet);
  });
});

describe('hsvToRgb', () => {
  it('maps the primaries and white', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToRgb(1 / 3, 1, 1)).toEqual({ r: 0, g: 255, b: 0 });
    expect(hsvToRgb(2 / 3, 1, 1)).toEqual({ r: 0, g: 0, b: 255 });
    expect(hsvToRgb(0.5, 0, 1)).toEqual({ r: 255, g: 255, b: 255 });
    expect(hsvToRgb(0.3, 1, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('SoundColorizer', () => {
  it('glows dimly in a quiet room', () => {
    const c = new SoundColorizer();
    let out = c.next(quiet, 0, 5);
    for (let t = 30; t < 2000; t += 30) out = c.next(quiet, t, 5);
    expect(brightness(out)).toBeGreaterThan(0);
    expect(brightness(out)).toBeLessThan(40);
  });
  it('jumps to a new, bright color on a bass hit', () => {
    const c = new SoundColorizer();
    for (let t = 0; t < 1000; t += 30) c.next(quiet, t, 5);
    const before = c.hue;
    const out = c.next(kick, 1000, 5);
    expect(c.hue).not.toBeCloseTo(before, 2);
    expect(brightness(out)).toBeGreaterThan(200);
  });
  it('does not count a held bass note as many beats', () => {
    const c = new SoundColorizer();
    for (let t = 0; t < 1000; t += 30) c.next(quiet, t, 5);
    c.next(kick, 1000, 5);
    const afterFirst = c.hue;
    for (let t = 1030; t < 1200; t += 30) c.next(kick, t, 5); // within 250 ms: no new beat
    expect(c.hue - afterFirst).toBeLessThan(0.05);
  });
  it('higher sensitivity reacts to quieter sound', () => {
    const soft: Bands = { bass: 0.1, mid: 0.2, treble: 0.05, level: 0.2 };
    const run = (sens: number) => {
      const c = new SoundColorizer();
      let out = c.next(soft, 0, sens);
      for (let t = 30; t < 1500; t += 30) out = c.next(soft, t, sens);
      return brightness(out);
    };
    expect(run(10)).toBeGreaterThan(run(1));
  });
});

describe('idleColor', () => {
  it('fades slowly through colors at half brightness', () => {
    expect(brightness(idleColor(0))).toBe(128);
    expect(idleColor(0)).not.toEqual(idleColor(5000));
  });
});
