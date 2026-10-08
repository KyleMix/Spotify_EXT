import { useEffect, useState } from 'react';
import { parseMessage, timerView, TIMER_CHANNEL, type TimerSnapshot } from './timerSync';

/** The pop-out timer: a read-only copy of the stage clock, meant for a second screen facing the comedian. */
export function TimerWindow() {
  const [snap, setSnap] = useState<TimerSnapshot | null>(null);
  const [now, setNow] = useState(Date.now());
  const [full, setFull] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    document.title = 'Walk-Up timer';
    const ch = new BroadcastChannel(TIMER_CHANNEL);
    ch.onmessage = (e) => {
      const m = parseMessage(e.data);
      if (!m) return;
      if (m.type === 'state') setSnap(m.snap);
      else if (m.type === 'bye') setSnap(null);
    };
    ch.postMessage({ type: 'hello' }); // ask a running Live screen for the current state
    return () => ch.close();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    const fs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fs);
    return () => { clearInterval(t); document.removeEventListener('fullscreenchange', fs); };
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => { /* browser refused; the window still works */ });
  };

  if (!snap) {
    return (
      <div className="tw tw-idle" onDoubleClick={toggleFull}>
        <div className="tw-hint">Waiting for Live mode in the main Walk-Up window. Double-click for full screen.</div>
      </div>
    );
  }

  const v = timerView(snap, now);
  return (
    <div className={`tw tw-${v.state}`} onDoubleClick={toggleFull} title={full ? 'Double-click to leave full screen' : 'Double-click for full screen'}>
      <div className="tw-clock" role="timer" aria-live="off">{v.text}</div>
    </div>
  );
}
