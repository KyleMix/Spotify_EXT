/** Turns what each light should show into the 512 DMX channel values. Pure, so every rule here is unit-tested. */
import { OFF, WHITE, RED, GREEN, BLUE, type LightColor } from './color';
import { hasIntensity, isColor, pixelCount, type ProfileMode } from './profiles';
import { modeOf, profileOf, type Rig } from './patch';

/** What one light should show: a color per pixel (a single color covers every pixel) and an overall level. */
export interface FixtureLook {
  colors: LightColor[];
  /** 0-1, default 1. Drives the light's dimmer channel, or scales its colors when it has none. */
  intensity?: number;
}

/** Raw channel values for one light from the tester, by channel number within the light (1 = its start address). */
export interface RawOverride {
  fixtureId: string;
  values: Record<number, number>;
}

export interface RenderOptions {
  /** Everything dark. Control channels stay at their home values so lights stay in DMX mode. */
  blackout?: boolean;
  raw?: RawOverride | null;
  /** While testing one light, keep the others dark so only the light under test is lit. */
  soloFixtureId?: string | null;
}

const byte = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

/** Channel values for one light in its mode, starting from each channel's home value. */
export function renderFixture(mode: ProfileMode, look: FixtureLook | undefined): number[] {
  const values = mode.channels.map((c) => byte(c.home));
  const level = Math.min(1, Math.max(0, look?.intensity ?? 1));
  const scale = hasIntensity(mode) ? 1 : level; // no dimmer channel: dim by scaling the colors instead
  mode.channels.forEach((c, i) => {
    if (c.type === 'intensity') { values[i] = look ? byte(level * 255) : byte(c.home); return; }
    if (!isColor(c.type)) return;
    if (!look) { values[i] = 0; return; }
    const color = look.colors[(c.pixel ?? 1) - 1] ?? look.colors[0] ?? OFF;
    const v = c.type === 'red' ? color.r : c.type === 'green' ? color.g : c.type === 'blue' ? color.b
      : c.type === 'white' ? Math.min(color.r, color.g, color.b) : 0; // amber is left off
    values[i] = byte(v * scale);
  });
  return values;
}

/** Build the full universe: index 0 is the DMX start code (0), index N is channel N. */
export function renderUniverse(rig: Rig, looks: Record<string, FixtureLook | undefined>, opts: RenderOptions = {}): Uint8Array {
  const universe = new Uint8Array(513);
  for (const f of rig.fixtures) {
    const mode = modeOf(rig, f);
    if (!mode) continue;
    const dark = opts.blackout || (opts.soloFixtureId != null && opts.soloFixtureId !== f.id);
    const values = renderFixture(mode, dark ? { colors: [OFF], intensity: 0 } : looks[f.id]);
    if (!opts.blackout && opts.raw?.fixtureId === f.id) {
      for (const [k, v] of Object.entries(opts.raw.values)) {
        const i = Number(k) - 1;
        if (i >= 0 && i < values.length) values[i] = byte(v);
      }
    }
    values.forEach((v, i) => { if (f.address + i <= 512) universe[f.address + i] = v; });
  }
  return universe;
}

/** Highest channel any light uses (at least 24: shorter DMX frames are not standard). */
export function usedSlots(rig: Rig): number {
  return Math.min(512, Math.max(24, ...rig.fixtures.map((f) => f.address + (modeOf(rig, f)?.channels.length ?? 1) - 1)));
}

/* ---------- Rig check: steps every pixel of every light through red, green, blue and white ---------- */

export interface CheckStep { fixtureId: string; pixel: number; pixels: number; colorName: string; color: LightColor }

const CHECK_COLORS: [string, LightColor][] = [['red', RED], ['green', GREEN], ['blue', BLUE], ['white', WHITE]];

export function checkSteps(rig: Rig): CheckStep[] {
  const steps: CheckStep[] = [];
  for (const f of rig.fixtures) {
    const mode = modeOf(rig, f);
    if (!mode) continue;
    const pixels = pixelCount(mode);
    for (let p = 1; p <= pixels; p++) {
      for (const [colorName, color] of CHECK_COLORS) steps.push({ fixtureId: f.id, pixel: p, pixels, colorName, color });
    }
  }
  return steps;
}

/** The look for a rig-check step: only that pixel lit, in that color. */
export function checkLook(step: CheckStep): FixtureLook {
  return { colors: Array.from({ length: step.pixels }, (_, i) => (i + 1 === step.pixel ? step.color : OFF)) };
}

/** e.g. "Neo-Slim Par Bar · Par 3 of 4 · blue". */
export function describeStep(rig: Rig, step: CheckStep): string {
  const f = rig.fixtures.find((x) => x.id === step.fixtureId);
  const px = profileOf(rig, f!)?.pixelName ?? 'Pixel';
  const where = step.pixels > 1 ? ` · ${px} ${step.pixel} of ${step.pixels}` : '';
  return `${f?.name || 'Light'}${where} · ${step.colorName}`;
}
