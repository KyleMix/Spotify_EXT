/**
 * The lighting engine: owns the rig and the looks, works out what every light shows each frame, and feeds the
 * DMX output.
 *
 * Who wins, highest first:
 *   blackout → rig check → tester (raw channels on one light) → test color (4 s)
 *   → a look fired by hand (console / hotkey) → the look the show's current moment fires → dark.
 * Changing look crossfades over the new look's fade time. The master dimmer scales everything a look shows.
 */
import { OFF, type LightColor } from './color';
import { effectColor, mix } from './effects';
import { DmxLink, type OutputThread } from './link';
import {
  allProfiles, clampFixture, clampRig, footprint, loadRig, MAX_FIXTURES, modeOf, newId, nextFreeAddress, saveRig,
  type PatchedFixture, type Rig,
} from './patch';
import { clampProfile, pixelCount, type FixtureProfile } from './profiles';
import { checkLook, checkSteps, renderUniverse, usedSlots, type CheckStep, type FixtureLook, type RawOverride } from './render';
import { clampShowSettings, loadShowSettings, saveShowSettings, type ShowLightSettings } from './show';
import { SoundInput, type AudioFeatures } from './sound';
import { samePort, serialApi, type DriverId, type PortInfo } from './drivers';
import type { OutputStatus } from './session';
import { clampLook, clampLooksState, loadLooks, momentsUsing, saveLooks, type Look, type LooksState, type ShowMoment } from './looks';

export type EngineStatus = 'unsupported' | OutputStatus;

const PORT_KEY = 'walkup.dmx.port';
const DRIVER_KEY = 'walkup.lights.driver';
const WORKER_KEY = 'walkup.lights.useWorker';
const TICK_MS = 25;
const CHECK_STEP_MS = 900;
/** Fade to dark when nothing is active. */
const RELEASE_FADE_MS = 500;

interface CheckState { steps: CheckStep[]; index: number; playing: boolean; stepStartedAt: number }
interface FadeState { targetId: string | null; from: Record<string, LightColor[]>; startedAt: number; ms: number }

export class LightEngine {
  rig: Rig = loadRig();
  show: ShowLightSettings = loadShowSettings();
  looksState: LooksState = loadLooks(this.show.stageWhite);
  readonly sound = new SoundInput();
  driver: DriverId = (() => { try { return localStorage.getItem(DRIVER_KEY) === 'enttec' ? 'enttec' : 'opendmx'; } catch { return 'opendmx'; } })();

  /** Send frames from a background worker instead of the page (opt-in; the page is the proven default). */
  useWorker: boolean = (() => { try { return localStorage.getItem(WORKER_KEY) === '1'; } catch { return false; } })();
  status: EngineStatus = serialApi() ? 'disconnected' : 'unsupported';
  message = serialApi() ? '' : 'Lighting needs Chrome or Edge on a computer (Web Serial).';
  /** Frames per second actually sent to the cable, measured where they are sent. */
  fps = 0;
  blackout = false;
  /** Master dimmer, 0-1: scales everything looks show (not the tester or rig check). */
  master = 1;
  /** The last universe rendered (index = DMX channel), for the monitor. */
  universe: Uint8Array = new Uint8Array(513);
  /** What each light's pixels showed last frame (look colors after fades and master), for previews. */
  output: Record<string, LightColor[]> = {};
  raw: RawOverride | null = null;
  /** While the tester drives a light, keep every other light dark. */
  soloTester = true;
  check: CheckState | null = null;
  /** Where the show is (set by Live mode; null when Live mode is closed). */
  moment: ShowMoment | null = null;
  /** What the music was doing last frame, for the meter. */
  audio: AudioFeatures | null = null;
  /** A look fired by hand from the console or a hotkey; it holds until released. */
  manualLookId: string | null = null;

  private testColor: LightColor | null = null;
  private testTimer?: ReturnType<typeof setTimeout>;
  private fade: FadeState = { targetId: null, from: {}, startedAt: 0, ms: 0 };
  private timer?: ReturnType<typeof setInterval>;
  private link?: DmxLink;
  /** The connect in progress, so a second request (e.g. auto-connect running twice) waits instead of racing it. */
  private connecting?: Promise<void>;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((f) => f()); }

  get thread(): OutputThread | null { return this.link && this.status === 'connected' ? this.link.thread : null; }
  get profiles() { return allProfiles(this.rig); }
  get looks(): Look[] { return this.looksState.looks; }

  /** The look in charge right now: one fired by hand, else the one the show's moment fires. */
  get activeLookId(): string | null {
    if (this.manualLookId) return this.manualLookId;
    if (!this.moment) return null;
    return this.looksState.cues[this.moment] || null;
  }

  /* ---------- frame loop ---------- */

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() { clearInterval(this.timer); this.timer = undefined; }

  /** Every light's pixel colors under the active look right now, before fades. */
  private lookColors(look: Look | undefined, nowMs: number, audio: AudioFeatures): Record<string, LightColor[]> {
    const out: Record<string, LightColor[]> = {};
    const counts = this.rig.fixtures.map((f) => { const m = modeOf(this.rig, f); return m ? pixelCount(m) : 0; });
    const globalCount = counts.reduce((a, b) => a + b, 0);
    let globalIndex = 0;
    this.rig.fixtures.forEach((f, fi) => {
      const layer = look ? look.perFixture[f.id] ?? look.all : null;
      out[f.id] = Array.from({ length: counts[fi] }, (_, pixel) => {
        const c = layer ? effectColor(layer, { tMs: nowMs, pixel, globalIndex: globalIndex + pixel, globalCount, audio }) : OFF;
        return c;
      });
      globalIndex += counts[fi];
    });
    return out;
  }

  /** Work out every light's look for this instant. */
  frameLooks(nowMs: number): { looks: Record<string, FixtureLook>; solo: string | null } {
    const looks: Record<string, FixtureLook> = {};
    const step = this.check?.steps[this.check.index];
    if (step) { looks[step.fixtureId] = checkLook(step); return { looks, solo: step.fixtureId }; }

    // The audio analyser advances once per frame, whichever lights use it.
    const audio = this.sound.features(nowMs, { sensitivity: this.show.soundSensitivity, autoGain: this.show.autoGain });
    this.audio = audio;
    const activeId = this.activeLookId;
    const look = activeId ? this.looksState.looks.find((l) => l.id === activeId) : undefined;
    if (activeId !== this.fade.targetId) {
      this.fade = { targetId: activeId, from: this.output, startedAt: nowMs, ms: look ? look.fadeMs : RELEASE_FADE_MS };
    }
    const target = this.lookColors(look, nowMs, audio);
    const k = this.fade.ms <= 0 ? 1 : (nowMs - this.fade.startedAt) / this.fade.ms;
    const output: Record<string, LightColor[]> = {};
    for (const f of this.rig.fixtures) {
      const to = target[f.id] ?? [];
      const from = this.fade.from[f.id] ?? [];
      output[f.id] = k >= 1 ? to : to.map((c, i) => mix(from[i] ?? OFF, c, k));
      looks[f.id] = { colors: this.testColor ? [this.testColor] : output[f.id], intensity: this.testColor ? 1 : this.master };
    }
    this.output = output;
    return { looks, solo: this.raw && this.soloTester ? this.raw.fixtureId : null };
  }

  tick(nowMs = Date.now()) {
    this.advanceCheck(nowMs);
    const { looks, solo } = this.frameLooks(nowMs);
    this.universe = renderUniverse(this.rig, looks, {
      blackout: this.blackout,
      raw: this.check ? null : this.raw,
      soloFixtureId: solo,
    });
    this.link?.send(this.universe, usedSlots(this.rig));
  }

  /* ---------- show and console ---------- */

  /** Live mode reports where the show is; null when Live mode closes. */
  setShowMoment(m: ShowMoment | null) {
    if (m === this.moment) return;
    this.moment = m;
    this.emit();
  }

  /** Fire a look by hand; it holds until released or another look is fired. */
  fireLook(id: string) {
    if (!this.looksState.looks.some((l) => l.id === id)) return;
    this.manualLookId = id;
    this.emit();
  }

  /** Hand the lights back to the show (or dark when Live mode is closed). */
  releaseLook() {
    if (!this.manualLookId) return;
    this.manualLookId = null;
    this.emit();
  }

  setMaster(v: number) { this.master = Math.min(1, Math.max(0, v)); this.emit(); }

  /** Every light shows `c` for a few seconds, then hands back to the looks. OFF cancels. */
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

  /* ---------- looks ---------- */

  private setLooksState(s: LooksState) {
    this.looksState = clampLooksState(s);
    saveLooks(this.looksState);
    if (this.manualLookId && !this.looksState.looks.some((l) => l.id === this.manualLookId)) this.manualLookId = null;
    this.emit();
  }

  /** Save a look (new or edited); returns its id. Keys stay unique: a key moves to the look it was last given to. */
  saveLook(l: Partial<Look>): string {
    const look = clampLook(l);
    const looks = this.looksState.looks.map((x) => (x.key && x.key === look.key && x.id !== look.id ? { ...x, key: undefined } : x));
    const i = looks.findIndex((x) => x.id === look.id);
    if (i >= 0) looks[i] = look; else looks.push(look);
    const releaseKey = this.looksState.releaseKey === look.key ? undefined : this.looksState.releaseKey;
    const blackoutKey = this.looksState.blackoutKey === look.key ? undefined : this.looksState.blackoutKey;
    this.setLooksState({ ...this.looksState, looks, releaseKey, blackoutKey });
    return look.id;
  }

  /** Looks wired to a show moment can't be deleted until the moment uses another look. */
  deleteLook(id: string): boolean {
    if (momentsUsing(this.looksState, id).length) return false;
    this.setLooksState({ ...this.looksState, looks: this.looksState.looks.filter((l) => l.id !== id) });
    return true;
  }

  moveLook(id: string, dir: -1 | 1) {
    const looks = [...this.looksState.looks];
    const i = looks.findIndex((l) => l.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= looks.length) return;
    [looks[i], looks[j]] = [looks[j], looks[i]];
    this.setLooksState({ ...this.looksState, looks });
  }

  setCue(moment: ShowMoment, lookId: string) {
    this.setLooksState({ ...this.looksState, cues: { ...this.looksState.cues, [moment]: lookId } });
  }

  /** Bind a key to "back to show"; it is taken off any look that had it. */
  setReleaseKey(code: string | undefined) {
    const looks = this.looksState.looks.map((l) => (code && l.key === code ? { ...l, key: undefined } : l));
    const blackoutKey = code && this.looksState.blackoutKey === code ? undefined : this.looksState.blackoutKey;
    this.setLooksState({ ...this.looksState, looks, releaseKey: code, blackoutKey });
  }

  /** Bind a key to toggle blackout; it is taken off any look or the release key that had it. */
  setBlackoutKey(code: string | undefined) {
    const looks = this.looksState.looks.map((l) => (code && l.key === code ? { ...l, key: undefined } : l));
    const releaseKey = code && this.looksState.releaseKey === code ? undefined : this.looksState.releaseKey;
    this.setLooksState({ ...this.looksState, looks, releaseKey, blackoutKey: code });
  }

  /** A key press from anywhere in the app: fires the look bound to it, releases, or toggles blackout. Returns whether it was used. */
  handleKey(code: string): boolean {
    if (!code) return false;
    if (code === this.looksState.blackoutKey) { this.setBlackout(!this.blackout); return true; }
    if (code === this.looksState.releaseKey) { this.releaseLook(); return true; }
    const look = this.looksState.looks.find((l) => l.key === code);
    if (!look) return false;
    this.fireLook(look.id);
    return true;
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

  setUseWorker(on: boolean) {
    this.useWorker = on;
    try { localStorage.setItem(WORKER_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
    this.emit();
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
      await this.ensureLink().open(port, this.driver, this.useWorker);
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotFoundError') return; // the user closed the port picker
      this.status = 'error'; this.message = err.message; this.emit();
    }
  }

  /** Reconnect silently to a cable the browser already has permission for. */
  autoConnect(): Promise<void> {
    this.connecting ??= this.tryAutoConnect().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  private listening = false;
  private async tryAutoConnect() {
    const s = serialApi();
    if (!s || this.status === 'connected' || this.status === 'connecting') return;
    if (!this.listening) {
      this.listening = true;
      s.addEventListener('disconnect', () => {
        if (this.status === 'connected') void this.link?.close('Cable unplugged');
      });
    }
    try {
      const ports = await s.getPorts();
      let saved: PortInfo | null = null;
      try { saved = JSON.parse(localStorage.getItem(PORT_KEY) ?? 'null'); } catch { /* ignore */ }
      const match = ports.find((p) => samePort(p.getInfo(), saved)) ?? (ports.length === 1 ? ports[0] : undefined);
      if (match) await this.ensureLink().open(match, this.driver, this.useWorker);
    } catch { /* stay disconnected; the user can click Connect */ }
  }

  /** Lights go dark, then the cable is released. */
  async disconnect() { await this.link?.close(); }
}
