/** The rig: which lights are on the DMX chain, at which address, in which mode. Plus checks and storage. */
import { BUILT_IN_PROFILES, clampProfile, findMode, findProfile, type FixtureProfile, type ProfileMode } from './profiles';

/**
 * What a light does in the show (until Phase 2 replaces this with looks):
 * - 'warning': the comedian's time light (red at the warning, solid red when time is up);
 * - 'stage': stage wash (white during a set, sound-reactive color between acts).
 */
export type FixtureRole = 'warning' | 'stage';

export interface PatchedFixture {
  id: string;
  name: string;
  profileId: string;
  modeId: string;
  /** DMX start address, 1-512. */
  address: number;
  role: FixtureRole;
}

export interface Rig {
  fixtures: PatchedFixture[];
  /** Light types made in the browser (e.g. with the tester), alongside the built-in ones. */
  customProfiles: FixtureProfile[];
}

export const EMPTY_RIG: Rig = { fixtures: [], customProfiles: [] };
export const MAX_FIXTURES = 32;

export const allProfiles = (rig: Rig) => [...BUILT_IN_PROFILES, ...rig.customProfiles];

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 36);

export const modeOf = (rig: Rig, f: PatchedFixture): ProfileMode | undefined => findMode(allProfiles(rig), f.profileId, f.modeId);
export const profileOf = (rig: Rig, f: PatchedFixture): FixtureProfile | undefined => findProfile(allProfiles(rig), f.profileId);

/** How many channels the light uses in its mode (at least 1, so a broken patch still occupies its address). */
export const footprint = (rig: Rig, f: PatchedFixture) => Math.max(1, modeOf(rig, f)?.channels.length ?? 1);

/** Last channel the light uses. */
export const lastChannel = (rig: Rig, f: PatchedFixture) => f.address + footprint(rig, f) - 1;

/** First address after every light already in the rig. */
export function nextFreeAddress(rig: Rig, channels: number): number {
  const end = rig.fixtures.reduce((m, f) => Math.max(m, lastChannel(rig, f)), 0);
  return Math.max(1, Math.min(end + 1, 512 - Math.max(1, channels) + 1));
}

export type RigIssue =
  | { kind: 'overlap'; a: string; b: string; from: number; to: number }
  | { kind: 'past512'; id: string }
  | { kind: 'missingProfile'; id: string };

/** Everything wrong with the patch: overlapping channels, lights running past 512, unknown light types. */
export function rigIssues(rig: Rig): RigIssue[] {
  const out: RigIssue[] = [];
  const fx = rig.fixtures;
  for (const f of fx) {
    if (!modeOf(rig, f)) out.push({ kind: 'missingProfile', id: f.id });
    if (lastChannel(rig, f) > 512) out.push({ kind: 'past512', id: f.id });
  }
  for (let i = 0; i < fx.length; i++) {
    for (let j = i + 1; j < fx.length; j++) {
      const from = Math.max(fx[i].address, fx[j].address);
      const to = Math.min(lastChannel(rig, fx[i]), lastChannel(rig, fx[j]));
      if (from <= to) out.push({ kind: 'overlap', a: fx[i].id, b: fx[j].id, from, to });
    }
  }
  return out;
}

/** Which fixture owns each DMX channel (index 1-512), for the universe monitor. Later lights win on overlaps. */
export function channelOwners(rig: Rig): (string | null)[] {
  const owners: (string | null)[] = new Array(513).fill(null);
  for (const f of rig.fixtures) {
    for (let c = f.address; c <= Math.min(512, lastChannel(rig, f)); c++) owners[c] = f.id;
  }
  return owners;
}

/** DIP switches to turn ON for an address on lights that set it in binary: switch n is worth 2^(n-1). */
export function dipSwitches(address: number): number[] {
  const on: number[] = [];
  for (let bit = 0; bit < 10; bit++) if (address & (1 << bit)) on.push(bit + 1);
  return on;
}

export const displayAddress = (address: number) => `d${String(address).padStart(3, '0')}`;

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function clampFixture(f: Partial<PatchedFixture>, rig: Rig): PatchedFixture {
  const profiles = allProfiles(rig);
  const profile = findProfile(profiles, String(f.profileId)) ?? BUILT_IN_PROFILES[0];
  const mode = profile.modes.find((m) => m.id === f.modeId) ?? profile.modes[0];
  return {
    id: typeof f.id === 'string' && f.id ? f.id : newId(),
    name: typeof f.name === 'string' ? f.name.slice(0, 40) : profile.name,
    profileId: profile.id,
    modeId: mode.id,
    address: int(f.address, 1, 512, 1),
    role: f.role === 'warning' ? 'warning' : 'stage',
  };
}

export function clampRig(r: Partial<Rig>): Rig {
  const customProfiles = (Array.isArray(r.customProfiles) ? r.customProfiles : [])
    .filter((p) => p && typeof p.id === 'string' && !BUILT_IN_PROFILES.some((b) => b.id === p.id))
    .slice(0, 32)
    .map((p) => clampProfile(p));
  const base: Rig = { fixtures: [], customProfiles };
  base.fixtures = (Array.isArray(r.fixtures) ? r.fixtures : []).slice(0, MAX_FIXTURES).map((f) => clampFixture(f ?? {}, base));
  return base;
}

/* ---------- Migration from the single-color fixture model (walkup.dmx.v1) ---------- */

interface OldFixture {
  name?: string; role?: string; address?: number; red?: number; green?: number; blue?: number;
  dimmer?: number; heads?: number; headSpacing?: number; channels?: number;
}

/**
 * Turn lights saved by earlier versions into the new rig. Known layouts map onto the built-in profiles; anything
 * else becomes a custom profile with exactly the channels the old settings drove, so nothing changes on stage.
 */
export function migrateOldConfig(old: unknown): Rig {
  const o = (old ?? {}) as { fixtures?: OldFixture[] } & OldFixture;
  const list: OldFixture[] = Array.isArray(o.fixtures) ? o.fixtures : o.address !== undefined ? [o] : [];
  const rig: Rig = { fixtures: [], customProfiles: [] };
  for (const f of list.slice(0, MAX_FIXTURES)) {
    const red = int(f.red, 1, 32, 1), green = int(f.green, 1, 32, 2), blue = int(f.blue, 1, 32, 3);
    const dimmer = int(f.dimmer, 0, 32, 0), heads = int(f.heads, 1, 16, 1);
    const spacing = int(f.headSpacing, 1, 32, Math.max(red, green, blue));
    const name = typeof f.name === 'string' && f.name.trim() ? f.name.slice(0, 40) : 'Light';
    const role: FixtureRole = f.role === 'stage' ? 'stage' : 'warning';
    const address = int(f.address, 1, 512, 1);
    const plainRgb = red === 1 && green === 2 && blue === 3 && dimmer === 0;
    let profileId: string, modeId: string;
    if (plainRgb && heads === 1 && /4bar/i.test(name)) { profileId = 'chauvet-4bar-flex'; modeId = '3ch'; }
    else if (plainRgb && heads === 4 && spacing === 3 && /neo/i.test(name)) { profileId = 'irradiant-neo-slim-bar-48'; modeId = '12ch'; }
    else if (plainRgb && heads === 1) { profileId = 'generic-rgb'; modeId = '3ch'; }
    else {
      const top = Math.max(int(f.channels, 1, 128, 1), dimmer, (heads - 1) * spacing + Math.max(red, green, blue));
      const channels: FixtureProfile['modes'][number]['channels'] = Array.from({ length: top }, () => ({ type: 'other' as const, home: 0 }));
      for (let h = 0; h < heads; h++) {
        const px = heads > 1 ? h + 1 : undefined;
        channels[red - 1 + h * spacing] = { type: 'red', pixel: px, home: 0 };
        channels[green - 1 + h * spacing] = { type: 'green', pixel: px, home: 0 };
        channels[blue - 1 + h * spacing] = { type: 'blue', pixel: px, home: 0 };
      }
      if (dimmer > 0) channels[dimmer - 1] = { type: 'intensity', label: 'Dimmer', home: 255 };
      profileId = `custom-${newId()}`;
      modeId = 'mode1';
      rig.customProfiles.push({ id: profileId, name: `${name} (from old settings)`, addressing: 'display', modes: [{ id: modeId, name: `${top}-CH`, channels }] });
    }
    rig.fixtures.push({ id: newId(), name, profileId, modeId, address, role });
  }
  return rig;
}

const RIG_KEY = 'walkup.lights.rig.v1';
const OLD_KEY = 'walkup.dmx.v1';

export function loadRig(): Rig {
  try {
    const raw = localStorage.getItem(RIG_KEY);
    if (raw) return clampRig(JSON.parse(raw));
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      // Save straight away so the migrated lights keep stable ids from now on.
      const rig = clampRig(migrateOldConfig(JSON.parse(old)));
      saveRig(rig);
      return rig;
    }
  } catch { /* fall through to an empty rig */ }
  return EMPTY_RIG;
}

export function saveRig(rig: Rig) {
  try { localStorage.setItem(RIG_KEY, JSON.stringify(rig)); } catch { /* storage unavailable */ }
}
