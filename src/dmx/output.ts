import {
  buildFrame, buildProbeFrame, loadDmxConfig, OFF, saveDmxConfig, clampDmxConfig, nextFreeAddress, MAX_FIXTURES, whiteAt,
  type DmxConfig, type DmxFixture, type LightColor,
} from './frame';
import { SoundInput } from './sound';

/* Minimal Web Serial typings (not in TypeScript's DOM lib). */
interface SerialPortLike {
  open(o: { baudRate: number; dataBits: number; stopBits: number; parity: string; flowControl: string; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(s: { break?: boolean }): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  writable: { getWriter(): { write(b: Uint8Array): Promise<void>; releaseLock(): void } } | null;
}
interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener(ev: string, cb: () => void): void;
}
const serial = (): SerialLike | undefined => (navigator as unknown as { serial?: SerialLike }).serial;

export type DmxStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error';

/** What the stage lights do right now: dark, white for a set, or following the microphone. */
export type StageMode = 'off' | 'white' | 'sound';

const PORT_KEY = 'walkup.dmx.port';
const FRAME_INTERVAL_MS = 30; // about 33 frames per second
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends DMX512 through a USB-to-DMX cable using an FTDI-style "Open DMX" serial port:
 * 250,000 baud, 8 data bits, 2 stop bits, with a BREAK and mark-after-break before each frame.
 */
export class DmxOutput {
  status: DmxStatus = serial() ? 'disconnected' : 'unsupported';
  message = serial() ? '' : 'Stage-light control needs Chrome or Edge (Web Serial).';
  config: DmxConfig = loadDmxConfig();
  /** Microphone feeding the stage lights' sound-reactive mode. */
  readonly sound = new SoundInput();
  stageMode: StageMode = 'off';
  /** Last color sent to the stage lights, for the panel's preview swatch. */
  lastStageColor: LightColor = OFF;

  private port?: SerialPortLike;
  private running = false;
  private loopDone: Promise<void> = Promise.resolve();
  private showColor: LightColor = OFF;
  /** Set while disconnecting so the last frames go out dark. */
  private dark = false;
  private testColor: LightColor | null = null;
  private probeValues: Record<number, number> | null = null;
  /** Which light on the chain the channel finder is driving. */
  probeFixture = 0;
  private probeTimer?: ReturnType<typeof setTimeout>;
  private testTimer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(status: DmxStatus, message = '') { this.status = status; this.message = message; this.listeners.forEach((f) => f()); }

  setConfig(c: Partial<DmxConfig>) {
    this.config = clampDmxConfig({ ...this.config, ...c });
    saveDmxConfig(this.config);
    this.listeners.forEach((f) => f());
  }

  /** Change one light on the chain. */
  updateFixture(index: number, patch: Partial<DmxFixture>) {
    this.setConfig({ fixtures: this.config.fixtures.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  }

  /** Add a light to the end of the chain, at the first address after the lights already on it. */
  addFixture(fixture: Omit<DmxFixture, 'address'>) {
    if (this.config.fixtures.length >= MAX_FIXTURES) return;
    const address = nextFreeAddress(this.config.fixtures, fixture.channels);
    this.setConfig({ fixtures: [...this.config.fixtures, { ...fixture, address }] });
  }

  /** Take a light off the chain. At least one light always stays configured. */
  removeFixture(index: number) {
    if (this.config.fixtures.length <= 1) return;
    if (this.probing) this.stopProbe();
    this.setConfig({ fixtures: this.config.fixtures.filter((_, i) => i !== index) });
  }

  /** Color requested by the show for the warning lights (red at the light warning, off otherwise). */
  setShowColor(c: LightColor) { this.showColor = c; }

  /** What the show wants from the stage lights. */
  setStageMode(m: StageMode) {
    if (m === this.stageMode) return;
    this.stageMode = m;
    this.listeners.forEach((f) => f());
  }

  private stageColor(nowMs: number): LightColor {
    if (this.stageMode === 'white') return whiteAt(this.config.stageWhite);
    if (this.stageMode === 'sound') return this.sound.color(nowMs, this.config.soundSensitivity);
    return OFF;
  }

  /** Temporarily override the light so channels can be checked; reverts by itself. */
  test(c: LightColor, ms = 4000) {
    if (c === OFF) { this.cancelTest(); return; } // "off" hands control straight back to the show
    this.stopProbe();
    clearTimeout(this.testTimer);
    this.testColor = c;
    this.testTimer = setTimeout(() => { this.testColor = null; }, ms);
  }
  cancelTest() { clearTimeout(this.testTimer); this.testColor = null; this.stopProbe(); }

  get probing() { return this.probeValues !== null; }

  /**
   * Channel finder: light only the given channels of one light (1 = its start address) at the given levels,
   * so you can see what each channel of the light's current mode does. Every other light stays dark.
   * Stops by itself after 30 s.
   */
  probe(values: Record<number, number>, fixtureIndex = this.probeFixture, ms = 30000) {
    clearTimeout(this.testTimer);
    this.testColor = null;
    clearTimeout(this.probeTimer);
    this.probeValues = values;
    this.probeFixture = Math.min(Math.max(0, fixtureIndex), this.config.fixtures.length - 1);
    this.probeTimer = setTimeout(() => this.stopProbe(), ms);
    this.listeners.forEach((f) => f());
  }

  stopProbe() {
    clearTimeout(this.probeTimer);
    if (this.probeValues === null) return;
    this.probeValues = null;
    this.listeners.forEach((f) => f());
  }

  /** Must be called from a click: the browser asks which serial port to use. */
  async connect() {
    const s = serial();
    if (!s) return;
    try {
      this.set('connecting');
      const port = await s.requestPort();
      await this.open(port);
    } catch (e) {
      const err = e as Error;
      this.set(err.name === 'NotFoundError' ? 'disconnected' : 'error', err.name === 'NotFoundError' ? '' : err.message);
    }
  }

  /** Reconnect silently to a cable the browser already has permission for. */
  async autoConnect() {
    const s = serial();
    if (!s || this.status === 'connected') return;
    s.addEventListener('disconnect', () => { void this.close('Cable unplugged'); });
    try {
      const ports = await s.getPorts();
      let saved: { usbVendorId?: number; usbProductId?: number } | null = null;
      try { saved = JSON.parse(localStorage.getItem(PORT_KEY) ?? 'null'); } catch { /* ignore */ }
      const match = ports.find((p) => saved && p.getInfo().usbVendorId === saved.usbVendorId && p.getInfo().usbProductId === saved.usbProductId)
        ?? (ports.length === 1 ? ports[0] : undefined);
      if (match) await this.open(match);
    } catch { /* stay disconnected; the user can click Connect */ }
  }

  private async open(port: SerialPortLike) {
    await port.open({ baudRate: 250000, dataBits: 8, stopBits: 2, parity: 'none', flowControl: 'none', bufferSize: 1024 });
    try { localStorage.setItem(PORT_KEY, JSON.stringify(port.getInfo())); } catch { /* ignore */ }
    this.port = port;
    this.dark = false;
    this.running = true;
    this.set('connected');
    this.loopDone = this.loop(port);
  }

  private async loop(port: SerialPortLike) {
    const writer = port.writable?.getWriter();
    if (!writer) { await this.close('Serial port is not writable', true, true); return; }
    let failure: string | null = null;
    try {
      while (this.running && this.port === port) {
        const stage = this.dark ? OFF : this.testColor ?? this.stageColor(Date.now());
        this.lastStageColor = stage;
        const frame = this.probeValues
          ? buildProbeFrame(this.config.fixtures[this.probeFixture] ?? this.config.fixtures[0], this.probeValues)
          : buildFrame(this.config, this.dark ? OFF : this.testColor ?? this.showColor, stage);
        await port.setSignals({ break: true });   // BREAK: line held low (at least 88 microseconds)
        await sleep(2);
        await port.setSignals({ break: false });  // mark-after-break
        await sleep(1);
        await writer.write(frame);
        await sleep(FRAME_INTERVAL_MS);
      }
    } catch (e) {
      if (this.running) failure = `Light offline: ${(e as Error).message}`;
    } finally {
      try { writer.releaseLock(); } catch { /* already released */ }
    }
    if (failure) await this.close(failure, true, true);
  }

  /**
   * Stop sending and release the cable. The loop must finish first: a serial port cannot be closed
   * while the loop still holds its writer, and a port left open blocks reconnecting.
   */
  private async close(message = '', isError = false, fromLoop = false) {
    const port = this.port;
    if (!port) return;
    this.running = false;
    this.port = undefined;
    this.cancelTest();
    this.set(isError ? 'error' : 'disconnected', message);
    if (!fromLoop) await this.loopDone;
    try { await port.close(); } catch { /* already closed */ }
  }

  /** Turn every light off, then release the cable. */
  async disconnect() {
    this.dark = true;
    this.cancelTest();
    await sleep(FRAME_INTERVAL_MS * 2); // let one dark frame go out
    await this.close();
  }
}
