/** One open USB-DMX port refreshing the line. Used inside the worker, or on the page as a fallback. */
import { FRAME_INTERVAL_MS, portOptions, runOutputLoop, type DriverId, type SerialPortLike } from './drivers';

export type OutputStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SessionEvents {
  status(status: OutputStatus, message?: string): void;
  stats(fps: number): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OutputSession {
  private universe: Uint8Array = new Uint8Array(513);
  private slots = 24;
  private port?: SerialPortLike;
  private running = false;
  private loopDone: Promise<void> = Promise.resolve();

  constructor(private events: SessionEvents) {}

  setFrame(universe: Uint8Array, slots: number) { this.universe = universe; this.slots = slots; }

  async open(port: SerialPortLike, driver: DriverId) {
    await this.close(false);
    this.events.status('connecting');
    await port.open(portOptions(driver));
    this.port = port;
    this.running = true;
    this.events.status('connected');
    this.loopDone = this.run(port, driver);
  }

  private async run(port: SerialPortLike, driver: DriverId) {
    try {
      await runOutputLoop(port, driver, {
        frame: () => ({ universe: this.universe, slots: this.slots }),
        running: () => this.running && this.port === port,
        stats: (fps) => this.events.stats(fps),
      });
    } catch (e) {
      if (!this.running || this.port !== port) return;
      this.running = false;
      this.port = undefined;
      try { await port.close(); } catch { /* already closed */ }
      this.events.status('error', `Lights offline: ${(e as Error).message}`);
    }
  }

  /** Stop refreshing and release the port, after sending a few dark frames if asked. */
  async close(darkFirst = true, message = '') {
    const port = this.port;
    if (!port) return;
    if (darkFirst) {
      this.universe = new Uint8Array(513);
      await sleep(FRAME_INTERVAL_MS * 3);
    }
    this.running = false;
    this.port = undefined;
    await this.loopDone; // a port can't close while the loop still holds its writer
    try { await port.close(); } catch { /* already closed */ }
    this.events.status('disconnected', message);
  }
}
