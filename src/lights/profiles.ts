/**
 * Fixture profiles: what each channel of a light's DMX mode does.
 * A profile is a light model; each mode is one of its DMX personalities, described channel by channel.
 */

export type ChannelType = 'red' | 'green' | 'blue' | 'white' | 'amber' | 'intensity' | 'strobe' | 'control' | 'other';

export interface ChannelDef {
  type: ChannelType;
  /** Which pixel (pod/par) a color channel belongs to, counting from 1. Leave out for "all pixels at once". */
  pixel?: number;
  /** Shown in the tester, e.g. "Operating mode (0-9 = DMX color)". Defaults to the type and pixel. */
  label?: string;
  /** Value the channel sits at when nothing asks for it. Control channels must be held here for DMX color to work. */
  home: number;
}

export interface ProfileMode {
  id: string;
  name: string;
  channels: ChannelDef[];
  /** What to set on the light itself, shown in the rig list. */
  note?: string;
}

export interface FixtureProfile {
  id: string;
  name: string;
  /** How the start address is set on the light: a display (d001) or binary DIP switches. */
  addressing: 'display' | 'dip';
  /** What the light calls its pixels, e.g. "Pod" or "Par". */
  pixelName?: string;
  modes: ProfileMode[];
  /** Built-in profiles ship with the app; custom ones are made in the browser. */
  builtIn?: boolean;
  /** The channel layout comes from inference, not a manual; confirm it with the tester before trusting it. */
  unverified?: boolean;
}

export const COLOR_TYPES: ChannelType[] = ['red', 'green', 'blue', 'white', 'amber'];
export const isColor = (t: ChannelType) => COLOR_TYPES.includes(t);

const rgb = (pixel?: number): ChannelDef[] => [
  { type: 'red', pixel, home: 0 }, { type: 'green', pixel, home: 0 }, { type: 'blue', pixel, home: 0 },
];
const pixelsRgb = (n: number) => Array.from({ length: n }, (_, i) => rgb(i + 1)).flat();

export const BUILT_IN_PROFILES: FixtureProfile[] = [
  {
    id: 'chauvet-4bar-flex',
    name: 'Chauvet 4BAR Flex',
    addressing: 'display',
    pixelName: 'Pod',
    builtIn: true,
    modes: [
      {
        id: '15ch',
        name: '15-CH (each pod its own color)',
        note: 'On the bar: DMX personality 15-CH.',
        channels: [
          { type: 'control', label: 'Operating mode (0-9 = DMX color, 250+ = sound active)', home: 0 },
          { type: 'intensity', label: 'Dimmer', home: 255 },
          { type: 'strobe', label: 'Strobe (0 = off)', home: 0 },
          ...pixelsRgb(4),
        ],
      },
      {
        id: '3ch',
        name: '3-CH (whole bar one color)',
        note: 'On the bar: DMX personality 3-CH.',
        channels: rgb(),
      },
    ],
  },
  {
    id: 'irradiant-neo-slim-bar-48',
    name: 'Irradiant Neo-Slim Par Bar 48',
    addressing: 'dip',
    pixelName: 'Par',
    builtIn: true,
    unverified: true,
    modes: [
      {
        id: '12ch',
        name: '12-CH (assumed: each par red, green, blue)',
        note: 'Model NPRO-PAR-SL-BAR-48. On the bar: 12-channel mode. Layout not confirmed: check every par with the tester.',
        channels: pixelsRgb(4),
      },
    ],
  },
  {
    id: 'generic-rgb',
    name: 'Generic RGB light',
    addressing: 'display',
    builtIn: true,
    modes: [{ id: '3ch', name: '3-CH (red, green, blue)', channels: rgb() }],
  },
  {
    id: 'generic-drgb',
    name: 'Generic dimmer + RGB light',
    addressing: 'display',
    builtIn: true,
    modes: [{
      id: '4ch', name: '4-CH (dimmer, red, green, blue)',
      channels: [{ type: 'intensity', label: 'Dimmer', home: 255 }, ...rgb()],
    }],
  },
];

/** How many independently colorable pixels a mode has (1 when its colors cover the whole light). */
export const pixelCount = (mode: ProfileMode) =>
  Math.max(1, ...mode.channels.filter((c) => isColor(c.type)).map((c) => c.pixel ?? 1));

export const hasIntensity = (mode: ProfileMode) => mode.channels.some((c) => c.type === 'intensity');

/** Human label for a channel, e.g. "Pod 3 blue". */
export function channelLabel(c: ChannelDef, mode?: ProfileMode, pixelName = 'Pixel'): string {
  if (c.label) return c.label;
  const name = c.type[0].toUpperCase() + c.type.slice(1);
  if (!isColor(c.type)) return name;
  if (c.pixel === undefined || (mode && pixelCount(mode) === 1)) return `${name} (all)`;
  return `${pixelName} ${c.pixel} ${c.type}`;
}

export function findProfile(profiles: FixtureProfile[], id: string): FixtureProfile | undefined {
  return profiles.find((p) => p.id === id);
}

export function findMode(profiles: FixtureProfile[], profileId: string, modeId: string): ProfileMode | undefined {
  return findProfile(profiles, profileId)?.modes.find((m) => m.id === modeId);
}

const TYPES: ChannelType[] = ['red', 'green', 'blue', 'white', 'amber', 'intensity', 'strobe', 'control', 'other'];
const byte = (v: unknown, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(255, Math.max(0, n)) : fallback;
};

/** Clean up a custom profile loaded from storage or edited in the browser. */
export function clampProfile(p: Partial<FixtureProfile> & { id: string }): FixtureProfile {
  const modes = (Array.isArray(p.modes) ? p.modes : []).slice(0, 8).map((m, i) => ({
    id: typeof m?.id === 'string' && m.id ? m.id : `mode${i + 1}`,
    name: typeof m?.name === 'string' && m.name.trim() ? m.name.slice(0, 60) : `Mode ${i + 1}`,
    note: typeof m?.note === 'string' ? m.note.slice(0, 200) : undefined,
    channels: (Array.isArray(m?.channels) ? m.channels : []).slice(0, 64).map((c) => {
      const type = TYPES.includes(c?.type as ChannelType) ? (c.type as ChannelType) : 'other';
      const pixel = isColor(type) && Number(c?.pixel) >= 1 ? Math.min(32, Math.round(Number(c.pixel))) : undefined;
      return { type, pixel, home: byte(c?.home), label: typeof c?.label === 'string' && c.label.trim() ? c.label.slice(0, 60) : undefined };
    }),
  })).filter((m) => m.channels.length > 0);
  return {
    id: p.id,
    name: typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, 60) : 'Custom light',
    addressing: p.addressing === 'dip' ? 'dip' : 'display',
    pixelName: typeof p.pixelName === 'string' && p.pixelName.trim() ? p.pixelName.slice(0, 20) : undefined,
    modes: modes.length ? modes : [{ id: 'mode1', name: 'Mode 1', channels: rgb() }],
  };
}
