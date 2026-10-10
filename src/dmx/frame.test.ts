import { describe, expect, it } from 'vitest';
import {
  buildProbeFrame, buildFrame, clampDmxConfig, clampFixture, DEFAULT_DMX_CONFIG, DEFAULT_FIXTURE, FIXTURE_PRESETS, GREEN, lightIsOn,
  MAX_FIXTURES, footprint, nextFreeAddress, OFF, overlaps, RED, slotOf, WHITE, whiteAt, type DmxFixture,
} from './frame';

const fx = (o: Partial<DmxFixture> = {}): DmxFixture => ({ ...DEFAULT_FIXTURE, ...o });
const cfgOf = (...fixtures: DmxFixture[]) => ({ ...DEFAULT_DMX_CONFIG, fixtures });

describe('buildFrame', () => {
  it('puts colors at the fixture address with a zero start code', () => {
    const f = buildFrame(cfgOf(fx({ address: 5 })), RED);
    expect(f[0]).toBe(0);
    expect([f[5], f[6], f[7]]).toEqual([255, 0, 0]);
    expect(f[4]).toBe(0);
    expect(f[8]).toBe(0);
  });
  it('is at least 24 slots long and grows when the fixture is high in the universe', () => {
    expect(buildFrame(DEFAULT_DMX_CONFIG, OFF).length).toBe(25);
    expect(buildFrame(cfgOf(fx({ address: 100 })), OFF).length).toBe(103);
  });
  it('honors custom channel positions', () => {
    const f = buildFrame(cfgOf(fx({ red: 4, green: 5, blue: 6, channels: 6 })), GREEN);
    expect([f[4], f[5], f[6]]).toEqual([0, 255, 0]);
    expect(f[1]).toBe(0);
  });
  it('holds the master dimmer at full only while lit', () => {
    const cfg = cfgOf(fx({ dimmer: 4, channels: 4 }));
    expect(buildFrame(cfg, RED)[4]).toBe(255);
    expect(buildFrame(cfg, OFF)[4]).toBe(0);
  });
  it('drives every daisy-chained light with the same color', () => {
    // A 4-channel dimmer+RGB light at d001 and a Chauvet 4BAR Flex in 3-CH mode at d005.
    const cfg = cfgOf(fx({ address: 1, dimmer: 1, red: 2, green: 3, blue: 4, channels: 4 }), fx({ address: 5 }));
    const f = buildFrame(cfg, RED);
    expect(Array.from(f.slice(1, 8))).toEqual([255, 255, 0, 0, 255, 0, 0]);
    expect(Array.from(buildFrame(cfg, OFF)).every((v) => v === 0)).toBe(true);
  });
  it('sends warning lights and stage lights their own colors', () => {
    const cfg = cfgOf(fx({ address: 1 }), fx({ address: 4, role: 'stage' }));
    const f = buildFrame(cfg, RED, whiteAt(100));
    expect(Array.from(f.slice(1, 7))).toEqual([255, 0, 0, 255, 255, 255]);
    const g = buildFrame(cfg, OFF, GREEN);
    expect(Array.from(g.slice(1, 7))).toEqual([0, 0, 0, 0, 255, 0]);
  });
  it('lights every par of a bar whose mode gives each par its own RGB', () => {
    // Neo-Slim Par Bar in 12-CH mode at d004: pars at 4-6, 7-9, 10-12, 13-15.
    const neo = FIXTURE_PRESETS.find((x) => x.id === 'neo-slim-bar-12ch')!.fixture;
    const cfg = cfgOf(fx(), { ...neo, address: 4 });
    const f = buildFrame(cfg, OFF, RED);
    expect(Array.from(f.slice(4, 16))).toEqual([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0]);
    expect(f[16]).toBe(0);
    expect([f[1], f[2], f[3]]).toEqual([0, 0, 0]);
  });
  it('whiteAt scales all three colors', () => {
    expect(whiteAt(50)).toEqual({ r: 128, g: 128, b: 128 });
    expect(whiteAt(150)).toEqual(WHITE);
  });
  it('slotOf is 1-based from the start address', () => {
    expect(slotOf(fx({ address: 10 }), 1)).toBe(10);
    expect(slotOf(fx({ address: 10 }), 3)).toBe(12);
  });
});

describe('clampDmxConfig', () => {
  it('defaults the warning flash to 3 seconds and keeps it in range', () => {
    expect(clampDmxConfig({}).warnPulseSec).toBe(3);
    expect(clampDmxConfig({ warnPulseSec: -4 }).warnPulseSec).toBe(0);
    expect(clampDmxConfig({ warnPulseSec: 500 }).warnPulseSec).toBe(30);
    expect(clampDmxConfig({ warnPulseSec: 2 }).warnPulseSec).toBe(2);
  });
  it('keeps values valid', () => {
    expect(clampFixture({ address: 0 }).address).toBe(1);
    expect(clampFixture({ address: 9999 }).address).toBeLessThanOrEqual(510);
    expect(clampFixture({ red: 0, green: -3 }).red).toBe(1);
    expect(clampFixture({ dimmer: 99 }).dimmer).toBe(32);
    expect(clampFixture({ address: NaN as unknown as number }).address).toBe(1);
  });
  it('never lets the fixture run past channel 512', () => {
    const c = clampFixture({ address: 512, red: 1, green: 2, blue: 3, dimmer: 4 });
    expect(c.address + 4 - 1).toBeLessThanOrEqual(512);
    const d = clampFixture({ address: 512, channels: 15 });
    expect(d.address).toBe(498);
  });
  it('upgrades a single light saved by older versions into a one-light chain', () => {
    const c = clampDmxConfig({ address: 7, red: 2, green: 3, blue: 4, dimmer: 1, warnPulseSec: 5 } as never);
    expect(c.fixtures).toHaveLength(1);
    expect(c.fixtures[0]).toMatchObject({ address: 7, red: 2, green: 3, blue: 4, dimmer: 1, channels: 4 });
    expect(c.warnPulseSec).toBe(5);
    expect(c.fixtures[0].role).toBe('warning');
    expect(clampDmxConfig({}).fixtures).toEqual([DEFAULT_FIXTURE]);
  });
  it('defaults and clamps the stage-light settings', () => {
    expect(clampDmxConfig({})).toMatchObject({ stageWhite: 100, soundSensitivity: 5 });
    expect(clampDmxConfig({ stageWhite: 400, soundSensitivity: 0 })).toMatchObject({ stageWhite: 100, soundSensitivity: 1 });
    expect(clampFixture({ role: 'bogus' as never }).role).toBe('warning');
  });
  it('keeps a list of lights and caps how many', () => {
    const c = clampDmxConfig({ fixtures: [fx(), fx({ address: 4, name: '4BAR' })] });
    expect(c.fixtures.map((f) => f.address)).toEqual([1, 4]);
    expect(clampDmxConfig({ fixtures: Array.from({ length: 40 }, () => fx()) }).fixtures).toHaveLength(MAX_FIXTURES);
  });
});

describe('multi-par bars', () => {
  it('counts every par in the footprint', () => {
    expect(footprint(fx({ heads: 4, headSpacing: 3 }))).toBe(12);
    expect(footprint(fx({ heads: 4, headSpacing: 4, red: 2, green: 3, blue: 4 }))).toBe(16);
  });
  it('defaults par spacing to right after the first par, and keeps old single lights as one par', () => {
    expect(clampFixture({ red: 1, green: 2, blue: 3, heads: 4 }).headSpacing).toBe(3);
    expect(clampFixture({ address: 1 })).toMatchObject({ heads: 1 });
  });
  it('places a light after a whole multi-par bar', () => {
    expect(nextFreeAddress([fx(), fx({ address: 4, heads: 4, headSpacing: 3, channels: 12 })], 3)).toBe(16);
  });
});

describe('chain addressing', () => {
  it('places a new light right after the lights already on the chain', () => {
    expect(nextFreeAddress([fx()], 3)).toBe(4);
    expect(nextFreeAddress([fx({ channels: 7 }), fx({ address: 20 })], 3)).toBe(23);
    expect(nextFreeAddress([fx({ address: 511, channels: 1, red: 1, green: 1, blue: 1 })], 3)).toBe(510);
  });
  it('reports lights whose channels overlap', () => {
    expect(overlaps([fx(), fx({ address: 4 })])).toEqual([]);
    expect(overlaps([fx({ channels: 4 }), fx({ address: 4 })])).toEqual([[0, 1]]);
    expect(overlaps([fx(), fx({ address: 9 }), fx({ address: 2 })])).toEqual([[0, 2]]);
  });
  it('allows identical lights on the same address (they just act as one)', () => {
    expect(overlaps([fx(), fx()])).toEqual([]);
  });
  it('has a 4BAR Flex preset for its 3-channel mode', () => {
    const p = FIXTURE_PRESETS.find((x) => x.id === '4bar-flex-3ch');
    expect(p?.fixture).toMatchObject({ role: 'stage', red: 1, green: 2, blue: 3, dimmer: 0, channels: 3 });
  });
});

describe('lightIsOn (10 min set, warning at 2 min left, 3 s flash)', () => {
  const min = 60_000;
  const on = (phase: string, elapsedMs: number, pulse = 3) => lightIsOn(phase, elapsedMs, 10, 2, pulse);
  it('is off before the warning', () => {
    expect(on('timing', 0)).toBe(false);
    expect(on('timing', 8 * min - 1)).toBe(false);
  });
  it('flashes red for the pulse length when the warning hits, then goes off', () => {
    expect(on('timing', 8 * min)).toBe(true);
    expect(on('timing', 8 * min + 2900)).toBe(true);
    expect(on('timing', 8 * min + 3000)).toBe(false);
    expect(on('timing', 9 * min)).toBe(false);
    expect(on('timing', 10 * min - 1)).toBe(false);
  });
  it('turns on when time is up and stays on through overtime', () => {
    expect(on('timing', 10 * min)).toBe(true);
    expect(on('timing', 10 * min + 5000)).toBe(true);
    expect(on('timing', 15 * min)).toBe(true);
  });
  it('is off whenever the act is not on the clock (until the next comedian starts)', () => {
    expect(on('cued', 12 * min)).toBe(false);
    expect(on('walkup', 12 * min)).toBe(false);
  });
  it('pulse of 0 keeps it on from the warning through overtime', () => {
    expect(on('timing', 8 * min + 1000, 0)).toBe(true);
    expect(on('timing', 9 * min, 0)).toBe(true);
    expect(on('timing', 7 * min, 0)).toBe(false);
  });
  it('handles a warning longer than the whole set (warning starts at 0)', () => {
    expect(lightIsOn('timing', 0, 1, 5, 3)).toBe(true);
    expect(lightIsOn('timing', 3500, 1, 5, 3)).toBe(false);
    expect(lightIsOn('timing', 60_000, 1, 5, 3)).toBe(true);
  });
});

describe('buildProbeFrame', () => {
  it('lights only the chosen channel, counted from the start address', () => {
    const f = buildProbeFrame(fx({ address: 1 }), { 5: 255 });
    expect(f[0]).toBe(0);
    expect(f[5]).toBe(255);
    expect(Array.from(f).filter((v) => v !== 0)).toEqual([255]);
    const g = buildProbeFrame(fx({ address: 7 }), { 5: 255 });
    expect(g[11]).toBe(255);
    expect(g[5]).toBe(0);
  });
  it('can light several channels and clamps values', () => {
    const f = buildProbeFrame(fx(), { 1: 255, 2: 999, 3: -5 });
    expect([f[1], f[2], f[3]]).toEqual([255, 255, 0]);
  });
  it('ignores channels outside the 512-channel universe and keeps frames at least 24 slots', () => {
    const f = buildProbeFrame(fx({ address: 510 }), { 1: 255, 9: 255 });
    expect(f[510]).toBe(255);
    expect(f.length).toBe(511);
    expect(buildProbeFrame(fx(), {}).length).toBe(25);
  });
});
