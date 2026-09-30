import { buildFrame, loadDmxConfig, OFF, saveDmxConfig, clampDmxConfig, type DmxConfig, type LightColor } from './frame';

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

  private port?: SerialPortLike;
  private running = false;
  private loopDone: Promise<void> = Promise.resolve();
  private showColor: LightColor = OFF;
  private testColor: LightColor | null = null;
  private testTimer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(status: DmxStatus, message = '') { this.status = status; this.message = message; this.listeners.forEach((f) => f()); }

  setConfig(c: Partial<DmxConfig>) {
    this.config = clampDmxConfig({ ...this.config, ...c });
    saveDmxConfig(this.config);
    this.listeners.forEach((f) => f());
  }

  /** Color requested by the show (red at the light warning, off otherwise). */
  setShowColor(c: LightColor) { this.showColor = c; }

  /** Temporarily override the light so channels can be checked; reverts by itself. */
  test(c: LightColor, ms = 4000) {
    if (c === OFF) { this.cancelTest(); return; } // "off" hands control straight back to the show
    clearTimeout(this.testTimer);
    this.testColor = c;
    this.testTimer = setTimeout(() => { this.testColor = null; }, ms);
  }
  cancelTest() { clearTimeout(this.testTimer); this.testColor = null; }

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
        const frame = buildFrame(this.config, this.testColor ?? this.showColor);
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

  /** Turn the light off, then release the cable. */
  async disconnect() {
    this.showColor = OFF;
    this.cancelTest();
    await sleep(FRAME_INTERVAL_MS * 2); // let one dark frame go out
    await this.close();
  }
}
