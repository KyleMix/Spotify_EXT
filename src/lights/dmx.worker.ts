/// <reference lib="webworker" />
/**
 * Optional DMX output worker: keeps the DMX line refreshed off the page's main thread. The page posts a fresh
 * universe whenever the lights change; the worker keeps resending it. Open and close requests are handled one at a
 * time, in order, and every reply carries the request's id so the page can ignore stale ones.
 */
import { samePort, serialApi } from './drivers';
import { OutputSession } from './session';
import type { FromWorker, ToWorker } from './link';

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let seq = 0;
const session = new OutputSession({
  status: (status, message) => post({ type: 'status', seq, status, message }),
  stats: (fps) => post({ type: 'stats', fps }),
});

let queue: Promise<unknown> = Promise.resolve();

async function handle(m: Exclude<ToWorker, { type: 'frame' }>) {
  seq = m.seq;
  if (m.type === 'close') { await session.close(true, m.message); return; }
  try {
    const ports = (await serialApi()?.getPorts()) ?? [];
    const port = ports.find((p) => samePort(p.getInfo(), m.info));
    if (!port) { post({ type: 'openFailed', seq: m.seq, reason: 'notFound' }); return; }
    await session.open(port, m.driver);
  } catch (err) {
    post({ type: 'openFailed', seq: m.seq, reason: (err as Error).message });
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'frame') { session.setFrame(m.universe, m.slots); return; }
  queue = queue.then(() => handle(m), () => handle(m));
};

post({ type: 'ready', serial: !!serialApi() });
