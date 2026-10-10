/**
 * The lighting engine: owns the rig, works out what every light shows each frame, and feeds the DMX output.
 *
 * Who wins, highest first:
 *   blackout → rig check → tester (raw channels on one light) → test color (4 s) → the show → home values.
 */
import { OFF, whiteAt, type LightColor } from './color';
import { DmxLink, type OutputThread } from './link';
import {
  allProfiles, clampFixture, clampRig, footprint, loadRig, MAX_FIXTURES, newId, nextFreeAddress, saveRig,
  type PatchedFixture, type Rig,
} from './patch';
import { clampProfile, type FixtureProfile } from './profiles';
import { checkLook, checkSteps, renderUniverse, usedSlots, type CheckStep, type FixtureLook, type RawOverride } from './render';
import { clampShowSettings, loadShowSettings, saveShowSettings, type ShowLightSettings } from './show';
import { SoundInput } from './sound';
import { samePort, serialApi, type DriverId, type PortInfo } from './drivers';
import type { OutputStatus } from './session';

export type StageMode = 'off' | 'white' | 'sound';
export type EngineStatus = 'unsupported' | OutputStatus;

const PORT_KEY = 'walkup.dmx.port';
const DRIVER_KEY = 'walkup.lights.driver';
const TICK_MS = 25;
const CHECK_STEP_MS = 900;

interface CheckState { steps: CheckStep[]; index: number; playing: boolean; stepStartedAt: number }

export class LightEngine {
  rig: Rig = loadRig();
  show: ShowLightSettings = loadShowSettings();
  readonly sound = new SoundInput();
  driver: DriverId = (() => { try { return localStorage.getItem(DRIVER_KEY) === 'enttec' ? 'enttec' : 'opendmx'; } catch { return 'opendmx'; } })();

  status: EngineStatus = serialApi() ? 'disconnected' : 'unsupported';
  message = serialApi() ? '' : 'Lighting needs Chrome or Edge on a computer (Web Serial).';
  /** Frames per second actually sent to the cable, measured where they are sent. */
  fps = 0;
  blackout = false;
  /** The last universe rendered (index = DMX channel), for the monitor. */
  universe: Uint8Array = new Uint8Array(513);
  stageMode: StageMode = 'off';
  lastStageColor: LightColor = OFF;
  raw: RawOverride | null = null;
  /** While the tester drives a light, keep every other light dark. */
  soloTester = true;
  check: CheckState | null = null;

  private warningColor: LightColor = OFF;
  private testColor: LightColor | null = null;
  private testTimer?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;
  private link?: DmxLink;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((f) => f()); }

  get thread(): OutputThread | null { return this.link && this.status === 'connected' ? this.link.thread : null; }
  get profiles() { return allProfiles(this.rig); }

  /* ---------- frame loop ---------- */

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() { clearInterval(this.timer); this.timer = undefined; }

  /** Work out every light's look for this instant. */
  looks(nowMs: number): { looks: Record<string, FixtureLook>; solo: string | null } {
    const looks: Record<string, FixtureLook> = {};
    const step = this.check?.steps[this.check.index];
    if (step) { looks[step.fixtureId] = checkLook(step); return { looks, solo: step.fixtureId }; }
    const stage = this.stageColor(nowMs);
    this.lastStageColor = stage;
    for (const f of this.rig.fixtures) {
      looks[f.id] = { colors: [this.testColor ?? (f.role === 'stage' ? stage : this.warningColor)] };
    }
    return { looks, solo: this.raw && this.soloTester ? this.raw.fixtureId : null };
  }

  tick(nowMs = Date.now()) {
    this.advanceCheck(nowMs);
    const { looks, solo } = this.looks(nowMs);
    this.universe = renderUniverse(this.rig, looks, {
      blackout: this.blackout,
      raw: this.check ? null : this.raw,
      soloFixtureId: solo,
    });
    this.link?.send(this.universe, usedSlots(this.rig));
  }

  private stageColor(nowMs: number): LightColor {
    if (this.stageMode === 'white') return whiteAt(this.show.stageWhite);
    if (this.stageMode === 'sound') return this.sound.color(nowMs, this.show.soundSensitivity);
    return OFF;
  }

  /* ---------- show hooks (Live mode) ---------- */

  /** Color for the warning lights (red at the light warning, off otherwise). */
  setShowColor(c: LightColor) { this.warningColor = c; }

  setStageMode(m: StageMode) {
    if (m === this.stageMode) return;
    this.stageMode = m;
    this.emit();
  }

  /** Every light shows `c` for a few seconds, then hands back to the show. OFF cancels. */
  test(c: LightColor, ms = 4000) {
    clearTimeout(this.testTimer);
    if (c === OFF) { this.testColor = null; this.emit(); return; }
    this.testColor = c;
    this.testTimer = setTimeout(() => { this.testColor = null; this.emit(); }, ms);
    this.emit();
  }

  setShowSettings(s: Partial<ShowLightSettings>) {
    this.show = clampShowSettings({ ...this.show, ...s });
    saveShowSettings(this.show);
    this.emit();
  }

  setBlackout(on: boolean) { this.blackout = on; this.emit(); }

  /* ---------- rig ---------- */

  setRig(rig: Rig) {
    this.rig = clampRig(rig);
    saveRig(this.rig);
    if (this.raw && !this.rig.fixtures.some((f) => f.id === this.raw!.fixtureId)) this.raw = null;
    if (this.check) this.stopCheck();
    this.emit();
  }

  addFixture(profileId: string, modeId: string, name?: string) {
    if (this.rig.fixtures.length >= MAX_FIXTURES) return;
    const draft = clampFixture({ profileId, modeId }, this.rig);
    const address = nextFreeAddress(this.rig, footprint(this.rig, draft));
    const profile = this.profiles.find((p) => p.id === profileId);
    this.setRig({ ...this.rig, fixtures: [...this.rig.fixtures, { ...draft, name: name ?? profile?.name ?? 'Light', address }] });
  }

  updateFixture(id: string, patch: Partial<PatchedFixture>) {
    this.setRig({
      ...this.rig,
      fixtures: this.rig.fixtures.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        // A new light type starts on its first mode.
        if (patch.profileId && patch.profileId !== f.profileId && !patch.modeId) next.modeId = '';
        return next;
      }),
    });
  }

  removeFixture(id: string) { this.setRig({ ...this.rig, fixtures: this.rig.fixtures.filter((f) => f.id !== id) }); }

  moveFixture(id: string, dir: -1 | 1) {
    const list = [...this.rig.fixtures];
    const i = list.findIndex((f) => f.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.setRig({ ...this.rig, fixtures: list });
  }

  /** Save a custom light type (new, or replacing one with the same id). Returns its id. */
  saveProfile(p: Partial<FixtureProfile> & { id?: string }): string {
    // Editing a custom type keeps its id; anything else (a new type, or a copy of a built-in) gets a new one.
    const keep = !!p.id && this.rig.customProfiles.some((x) => x.id === p.id);
    const profile = clampProfile({ ...p, id: keep ? p.id! : `custom-${newId()}` });
    const others = this.rig.customProfiles.filter((x) => x.id !== profile.id);
    this.setRig({ ...this.rig, customProfiles: [...others, profile] });
    return profile.id;
  }

  /** Custom light types can be deleted once no light in the rig uses them. */
  deleteProfile(id: string): boolean {
    if (this.rig.fixtures.some((f) => f.profileId === id)) return false;
    this.setRig({ ...this.rig, customProfiles: this.rig.customProfiles.filter((p) => p.id !== id) });
    return true;
  }

  /* ---------- tester ---------- */

  setRaw(fixtureId: string, values: Record<number, number>) { this.raw = { fixtureId, values }; this.emit(); }
  clearRaw() { if (!this.raw) return; this.raw = null; this.emit(); }
  setSoloTester(on: boolean) { this.soloTester = on; this.emit(); }

  /* ---------- rig check ---------- */

  startCheck() {
    const steps = checkSteps(this.rig);
    if (!steps.length) return;
    this.raw = null;
    this.check = { steps, index: 0, playing: true, stepStartedAt: Date.now() };
    this.emit();
  }

  pauseCheck(playing: boolean) {
    if (!this.check) return;
    this.check = { ...this.check, playing, stepStartedAt: Date.now() };
    this.emit();
  }

  stepCheck(dir: -1 | 1) {
    if (!this.check) return;
    const index = Math.min(this.check.steps.length - 1, Math.max(0, this.check.index + dir));
    this.check = { ...this.check, index, stepStartedAt: Date.now() };
    this.emit();
  }

  stopCheck() { this.check = null; this.emit(); }

  private advanceCheck(nowMs: number) {
    const c = this.check;
    if (!c?.playing || nowMs - c.stepStartedAt < CHECK_STEP_MS) return;
    if (c.index >= c.steps.length - 1) { this.check = null; this.emit(); return; }
    this.check = { ...c, index: c.index + 1, stepStartedAt: nowMs };
    this.emit();
  }

  /* ---------- connection ---------- */

  private ensureLink(): DmxLink {
    this.link ??= new DmxLink({
      status: (status, message = '') => {
        this.status = status;
        this.message = message;
        if (status !== 'connected') this.fps = 0;
        this.emit();
      },
      stats: (fps) => { this.fps = fps; this.emit(); },
    });
    return this.link;
  }

  setDriver(d: DriverId) {
    this.driver = d;
    try { localStorage.setItem(DRIVER_KEY, d); } catch { /* storage unavailable */ }
    this.emit();
  }

  /** Must be called from a click: the browser asks which serial port to use. */
  async connect() {
    const s = serialApi();
    if (!s) return;
    try {
      const port = await s.requestPort();
      try { localStorage.setItem(PORT_KEY, JSON.stringify(port.getInfo())); } catch { /* storage unavailable */ }
      await this.ensureLink().open(port, this.driver);
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotFoundError') return; // the user closed the port picker
      this.status = 'error'; this.message = err.message; this.emit();
    }
  }

  /** Reconnect silently to a cable the browser already has permission for. */
  async autoConnect() {
    const s = serialApi();
    if (!s || this.status === 'connected' || this.status === 'connecting') return;
    s.addEventListener('disconnect', () => {
      if (this.status === 'connected') void this.link?.close('Cable unplugged');
    });
    try {
      const ports = await s.getPorts();
      let saved: PortInfo | null = null;
      try { saved = JSON.parse(localStorage.getItem(PORT_KEY) ?? 'null'); } catch { /* ignore */ }
      const match = ports.find((p) => samePort(p.getInfo(), saved)) ?? (ports.length === 1 ? ports[0] : undefined);
      if (match) await this.ensureLink().open(match, this.driver);
    } catch { /* stay disconnected; the user can click Connect */ }
  }

  /** Lights go dark, then the cable is released. */
  async disconnect() { await this.link?.close(); }
}
