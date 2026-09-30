import { describe, expect, it } from 'vitest';
import { buildFrame, clampDmxConfig, DEFAULT_DMX_CONFIG, GREEN, lightIsRed, OFF, RED, slotOf } from './frame';

describe('buildFrame', () => {
  it('puts colors at the fixture address with a zero start code', () => {
    const f = buildFrame({ ...DEFAULT_DMX_CONFIG, address: 5 }, RED);
    expect(f[0]).toBe(0);
    expect([f[5], f[6], f[7]]).toEqual([255, 0, 0]);
    expect(f[4]).toBe(0);
    expect(f[8]).toBe(0);
  });
  it('is at least 24 slots long and grows when the fixture is high in the universe', () => {
    expect(buildFrame(DEFAULT_DMX_CONFIG, OFF).length).toBe(25);
    expect(buildFrame({ ...DEFAULT_DMX_CONFIG, address: 100 }, OFF).length).toBe(103);
  });
  it('honors custom channel positions', () => {
    const f = buildFrame({ address: 1, red: 4, green: 5, blue: 6, dimmer: 0 }, GREEN);
    expect([f[4], f[5], f[6]]).toEqual([0, 255, 0]);
    expect(f[1]).toBe(0);
  });
  it('holds the master dimmer at full only while lit', () => {
    const cfg = { address: 1, red: 1, green: 2, blue: 3, dimmer: 4 };
    expect(buildFrame(cfg, RED)[4]).toBe(255);
    expect(buildFrame(cfg, OFF)[4]).toBe(0);
  });
  it('slotOf is 1-based from the start address', () => {
    expect(slotOf({ ...DEFAULT_DMX_CONFIG, address: 10 }, 1)).toBe(10);
    expect(slotOf({ ...DEFAULT_DMX_CONFIG, address: 10 }, 3)).toBe(12);
  });
});

describe('clampDmxConfig', () => {
  it('keeps values valid', () => {
    expect(clampDmxConfig({ address: 0 }).address).toBe(1);
    expect(clampDmxConfig({ address: 9999 }).address).toBeLessThanOrEqual(510);
    expect(clampDmxConfig({ red: 0, green: -3 }).red).toBe(1);
    expect(clampDmxConfig({ dimmer: 99 }).dimmer).toBe(32);
    expect(clampDmxConfig({ address: NaN as unknown as number }).address).toBe(1);
  });
  it('never lets the fixture run past channel 512', () => {
    const c = clampDmxConfig({ address: 512, red: 1, green: 2, blue: 3, dimmer: 4 });
    expect(c.address + 4 - 1).toBeLessThanOrEqual(512);
  });
});

describe('lightIsRed', () => {
  it('is red only on the clock at warning or overtime', () => {
    expect(lightIsRed('timing', 'warn')).toBe(true);
    expect(lightIsRed('timing', 'over')).toBe(true);
    expect(lightIsRed('timing', 'ok')).toBe(false);
    expect(lightIsRed('walkup', 'warn')).toBe(false);
    expect(lightIsRed('cued', 'over')).toBe(false);
  });
});
