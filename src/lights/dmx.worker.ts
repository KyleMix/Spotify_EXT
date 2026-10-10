/// <reference lib="webworker" />
/**
 * DMX output worker: keeps the DMX line refreshed off the page's main thread, so rendering, Spotify and React
 * can't stall frames. The page posts a fresh universe whenever the lights change; the worker keeps resending it.
 */
import { samePort, serialApi } from './drivers';
import { OutputSession } from './session';
import type { FromWorker, ToWorker } from './link';

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

const session = new OutputSession({
  status: (status, message) => post({ type: 'status', status, message }),
  stats: (fps) => post({ type: 'stats', fps }),
});

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'frame') { session.setFrame(m.universe, m.slots); return; }
  if (m.type === 'close') { await session.close(true, m.message); return; }
  if (m.type === 'open') {
    try {
      const ports = (await serialApi()?.getPorts()) ?? [];
      const port = ports.find((p) => samePort(p.getInfo(), m.info));
      if (!port) { post({ type: 'openFailed', reason: 'notFound' }); return; }
      await session.open(port, m.driver);
    } catch (err) {
      post({ type: 'openFailed', reason: (err as Error).message });
    }
  }
};

post({ type: 'ready', serial: !!serialApi() });
