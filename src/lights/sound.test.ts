import { describe, expect, it } from 'vitest';
import { AudioAnalyzer, bandLevels, hsvToRgb, NOISE_GATE, sensitivityGain, type Bands } from './sound';

const quiet: Bands = { bass: 0, mid: 0, treble: 0, level: 0 };

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

const loud = (v: number): Bands => ({ bass: v, mid: v * 0.5, treble: v * 0.2, level: v });
const S = { sensitivity: 5, autoGain: true };

/** Feed a kick-drum pattern: `bpm` hits (bass spikes) with quiet bass between, sampled every 25 ms. */
function run(an: AudioAnalyzer, opts: { bpm: number; peak: number; ms: number; start?: number; settings?: typeof S }) {
  const beatMs = 60000 / opts.bpm;
  let last = an.next(null, 0, S);
  const start = opts.start ?? 0;
  for (let t = start; t < start + opts.ms; t += 25) {
    const inHit = (t - start) % beatMs < 50;
    last = an.next(inHit ? loud(opts.peak) : loud(opts.peak * 0.25), t, opts.settings ?? S);
  }
  return last;
}

describe('AudioAnalyzer', () => {
  it('finds one beat per kick drum at 120 BPM', () => {
    const an = new AudioAnalyzer();
    const f = run(an, { bpm: 120, peak: 0.6, ms: 10_000 });
    expect(f.beatCount).toBeGreaterThanOrEqual(18);
    expect(f.beatCount).toBeLessThanOrEqual(20);
    expect(f.live).toBe(true);
  });
  it('never counts more than 4 beats a second', () => {
    const an = new AudioAnalyzer();
    const f = run(an, { bpm: 600, peak: 0.8, ms: 5000 });
    expect(f.beatCount).toBeLessThanOrEqual(20);
  });
  it('auto-gain makes a quiet room and a loud room react alike', () => {
    const quiet = run(new AudioAnalyzer(), { bpm: 120, peak: 0.2, ms: 10_000 });
    const loudRoom = run(new AudioAnalyzer(), { bpm: 120, peak: 0.8, ms: 10_000 });
    expect(Math.abs(quiet.beatCount - loudRoom.beatCount)).toBeLessThanOrEqual(1);
  });
  it('without auto-gain a quiet room barely registers at low sensitivity', () => {
    const f = run(new AudioAnalyzer(), { bpm: 120, peak: 0.12, ms: 5000, settings: { sensitivity: 1, autoGain: false } });
    expect(f.beatCount).toBe(0);
  });
  it('ignores room noise below the gate', () => {
    const an = new AudioAnalyzer();
    let f = an.next(null, 0, S);
    for (let t = 0; t < 5000; t += 25) f = an.next(loud(NOISE_GATE * 0.8), t, S);
    expect(f.level).toBe(0);
    expect(f.beatCount).toBe(0);
  });
  it('flash is 1 on a beat and fades out; the beat color moves on', () => {
    const an = new AudioAnalyzer();
    for (let t = 0; t < 1000; t += 25) an.next(loud(0.1), t, S);
    const hit = an.next(loud(0.8), 1000, S);
    expect(hit.beat).toBe(true);
    expect(hit.flash).toBeCloseTo(1);
    const later = an.next(loud(0.1), 1500, S);
    expect(later.flash).toBeLessThan(0.2);
    expect(later.hue).not.toBeCloseTo(0, 2);
  });
  it('with no microphone it runs a slow idle pattern', () => {
    const an = new AudioAnalyzer();
    const a = an.next(null, 0, S), b = an.next(null, 4100, S);
    expect(a.live).toBe(false);
    expect(b.beatCount - a.beatCount).toBe(2);
    expect(a.level).toBe(0.5);
  });
  it('sensitivity scales around x1 at 5', () => {
    expect(sensitivityGain(5)).toBe(1);
    expect(sensitivityGain(10)).toBeCloseTo(4);
    expect(sensitivityGain(1)).toBeCloseTo(0.33, 1);
  });
});
