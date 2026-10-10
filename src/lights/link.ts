/**
 * Talks to the DMX output: on the page (default, proven with Open DMX cables) or, if chosen, in a Web Worker.
 * Opening and closing are queued so two of them can never overlap: overlapping opens of one serial port leave
 * one side holding the cable while the other gets the frames, and the lights sit dark while showing "connected".
 */
import type { DriverId, PortInfo, SerialPortLike } from './drivers';
import { OutputSession, type OutputStatus, type SessionEvents } from './session';

export type ToWorker =
  | { type: 'open'; seq: number; info: PortInfo; driver: DriverId }
  | { type: 'frame'; universe: Uint8Array; slots: number }
  | { type: 'close'; seq: number; message?: string };

export type FromWorker =
  | { type: 'ready'; serial: boolean }
  | { type: 'status'; seq: number; status: OutputStatus; message?: string }
  | { type: 'stats'; fps: number }
  | { type: 'openFailed'; seq: number; reason: string };

export type OutputThread = 'worker' | 'page';

export class DmxLink {
  /** Where frames are being sent from right now; shown in the panel so timing problems can be traced. */
  thread: OutputThread = 'page';
  private worker?: Worker;
  private workerReady?: Promise<boolean>;
  private page: OutputSession;
  /** Every open/close runs after the previous one has finished. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Id of the latest worker request; replies to older ones are ignored. */
  private seq = 0;
  private waiting?: { seq: number; resolve: (ok: boolean) => void };

  constructor(private events: SessionEvents) {
    this.page = new OutputSession(events);
  }

  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private startWorker(): Promise<boolean> {
    this.workerReady ??= new Promise((resolve) => {
      try {
        const w = new Worker(new URL('./dmx.worker.ts', import.meta.url), { type: 'module' });
        const timer = setTimeout(() => resolve(false), 3000);
        w.onmessage = (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.type === 'ready') { clearTimeout(timer); resolve(m.serial); return; }
          if (m.type === 'stats') { if (this.thread === 'worker') this.events.stats(m.fps); return; }
          if (m.seq !== this.seq) return; // a reply to a request that has since been replaced
          if (m.type === 'status') {
            if (m.status === 'connected') this.settle(m.seq, true);
            this.events.status(m.status, m.message);
          } else if (m.type === 'openFailed') {
            this.settle(m.seq, false, m.reason);
          }
        };
        w.onerror = () => { clearTimeout(timer); resolve(false); };
        this.worker = w;
      } catch { resolve(false); }
    });
    return this.workerReady;
  }

  private failReason = '';
  private settle(seq: number, ok: boolean, reason = '') {
    if (this.waiting?.seq !== seq) return;
    this.failReason = reason;
    this.waiting.resolve(ok);
    this.waiting = undefined;
  }

  /** Open the cable. With `useWorker`, try the worker first and fall back to the page if it can't open it. */
  open(port: SerialPortLike, driver: DriverId, useWorker: boolean): Promise<void> {
    return this.run(async () => {
      await this.closeNow();
      if (useWorker && (await this.startWorker()) && this.worker) {
        const seq = ++this.seq;
        this.thread = 'worker';
        this.events.status('connecting');
        const ok = await new Promise<boolean>((resolve) => {
          this.waiting = { seq, resolve };
          this.worker!.postMessage({ type: 'open', seq, info: port.getInfo(), driver } satisfies ToWorker);
        });
        if (ok) return;
        // The worker can't reach this cable (or has no Web Serial): make sure it let go, then use the page.
        this.worker.postMessage({ type: 'close', seq: ++this.seq } satisfies ToWorker);
        if (this.failReason !== 'notFound') console.warn('DMX worker could not open the cable:', this.failReason);
      }
      this.thread = 'page';
      await this.page.open(port, driver);
    });
  }

  send(universe: Uint8Array, slots: number) {
    if (this.thread === 'worker') this.worker?.postMessage({ type: 'frame', universe, slots } satisfies ToWorker);
    else this.page.setFrame(universe, slots);
  }

  /** Lights go dark, then the port is released. */
  close(message?: string): Promise<void> {
    return this.run(() => this.closeNow(message));
  }

  private async closeNow(message?: string) {
    if (this.thread === 'worker' && this.worker) {
      this.worker.postMessage({ type: 'close', seq: ++this.seq, message } satisfies ToWorker);
      this.thread = 'page';
      // Give the worker time to send its dark frames and release the port before anything reopens it.
      await new Promise((r) => setTimeout(r, 300));
      this.seq++; // ignore anything the worker still says about the old connection
      this.events.status('disconnected', message ?? '');
    } else {
      await this.page.close(true, message);
    }
  }
}
