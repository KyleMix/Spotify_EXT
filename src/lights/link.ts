/**
 * Talks to the DMX output: in a Web Worker when the browser allows Web Serial there, otherwise on the page.
 * Either way the caller just opens a port, sends universes and gets status back.
 */
import type { DriverId, PortInfo, SerialPortLike } from './drivers';
import { OutputSession, type OutputStatus, type SessionEvents } from './session';

export type ToWorker =
  | { type: 'open'; info: PortInfo; driver: DriverId }
  | { type: 'frame'; universe: Uint8Array; slots: number }
  | { type: 'close'; message?: string };

export type FromWorker =
  | { type: 'ready'; serial: boolean }
  | { type: 'status'; status: OutputStatus; message?: string }
  | { type: 'stats'; fps: number }
  | { type: 'openFailed'; reason: string };

export type OutputThread = 'worker' | 'page';

export class DmxLink {
  /** Where frames are being generated; shown in the panel so timing problems can be traced. */
  thread: OutputThread = 'page';
  private worker?: Worker;
  private workerReady: Promise<boolean>;
  private page: OutputSession;
  private pending?: { port: SerialPortLike; driver: DriverId };

  constructor(private events: SessionEvents) {
    this.page = new OutputSession(events);
    this.workerReady = new Promise((resolve) => {
      try {
        const w = new Worker(new URL('./dmx.worker.ts', import.meta.url), { type: 'module' });
        const timer = setTimeout(() => resolve(false), 3000);
        w.onmessage = (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.type === 'ready') { clearTimeout(timer); resolve(m.serial); return; }
          if (m.type === 'status') {
            if (m.status === 'connected') this.pending = undefined;
            events.status(m.status, m.message);
          }
          else if (m.type === 'stats') events.stats(m.fps);
          else if (m.type === 'openFailed') void this.fallBack(m.reason);
        };
        w.onerror = () => { clearTimeout(timer); resolve(false); };
        this.worker = w;
      } catch { resolve(false); }
    });
  }

  /** The worker couldn't open the cable (e.g. no Web Serial there in this browser): run it on the page instead. */
  private async fallBack(reason: string) {
    const p = this.pending;
    this.pending = undefined;
    if (!p) return;
    this.thread = 'page';
    try { await this.page.open(p.port, p.driver); } catch (e) {
      this.events.status('error', `${(e as Error).message}${reason === 'notFound' ? '' : ` (worker: ${reason})`}`);
    }
  }

  async open(port: SerialPortLike, driver: DriverId) {
    await this.close();
    if (await this.workerReady && this.worker) {
      this.thread = 'worker';
      this.pending = { port, driver };
      this.events.status('connecting');
      this.worker.postMessage({ type: 'open', info: port.getInfo(), driver } satisfies ToWorker);
    } else {
      this.thread = 'page';
      await this.page.open(port, driver);
    }
  }

  send(universe: Uint8Array, slots: number) {
    if (this.thread === 'worker') this.worker?.postMessage({ type: 'frame', universe, slots } satisfies ToWorker);
    else this.page.setFrame(universe, slots);
  }

  /** Lights go dark, then the port is released. */
  async close(message?: string) {
    this.pending = undefined;
    if (this.thread === 'worker') this.worker?.postMessage({ type: 'close', message } satisfies ToWorker);
    else await this.page.close(true, message);
  }
}
