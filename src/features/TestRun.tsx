import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Show } from '../types';
import type { WalkUpPlayer } from '../spotify/player';
import { slotName } from '../lib';

/** Each walk-up plays at most this long during a test run. */
export const PREVIEW_MS = 15_000;

interface Props {
  show: Show;
  player: WalkUpPlayer | null;
  ready: boolean;
  /** Tells Live to lock the real show controls while a test is playing. */
  onActive: (active: boolean) => void;
  /** Increment to stop the test (Live's Fade out / Panic stop). */
  stopSignal: number;
}

/** Pre-show check: hear every walk-up in lineup order without touching the timer, log or stage light. */
export function TestRun({ show, player, ready, onActive, stopSignal }: Props) {
  const queue = useMemo(() => show.slots.map((s, i) => ({ s, i })).filter((x) => x.s.track), [show.slots]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const [cur, setCur] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const activeRef = useRef(false);
  const active = cur !== null;
  activeRef.current = active;

  useEffect(() => { onActive(active); }, [active, onActive]);
  useEffect(() => () => onActive(false), [onActive]);

  const end = useCallback((fade: boolean) => {
    clearTimeout(timer.current);
    setAuto(false); setCur(null);
    if (fade) player?.stop(300).catch(() => { /* already stopped */ });
  }, [player]);

  const playAt = useCallback((k: number, chain: boolean) => {
    clearTimeout(timer.current);
    const item = queueRef.current[k];
    if (!item || !player || !item.s.track) { end(false); return; }
    setErr(''); setCur(k); setAuto(chain);
    const dur = Math.min(item.s.cueLengthMs || PREVIEW_MS, PREVIEW_MS);
    player.unlock().then(() => player.play(item.s.track!, item.s.startOffsetMs, dur))
      .catch((e: Error) => { setErr(e.message); end(false); });
    if (chain) {
      timer.current = setTimeout(() => (k + 1 < queueRef.current.length ? playAt(k + 1, true) : end(false)), dur + player.fadeOutMs + 600);
    }
  }, [player, end]);

  useEffect(() => { if (stopSignal) end(false); }, [stopSignal, end]);
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (activeRef.current) player?.stop(300).catch(() => { /* ignore */ });
  }, [player]);

  const missing = show.slots.filter((s) => !s.track).length;
  const item = cur !== null ? queue[cur] : undefined;

  return (
    <div className="card">
      <div className="row wrap">
        <h2 className="m-0">Test run</h2>
        <span className="muted">Hear each walk-up in order (up to {PREVIEW_MS / 1000}s each). The timer, log and stage light are not used.</span>
        <div className="spacer" />
        {!active ? (
          <>
            <button disabled={!ready || queue.length === 0} title={ready ? '' : 'Spotify must be ready'} onClick={() => playAt(0, false)}>▶ Start at the first song</button>
            <button className="primary" disabled={!ready || queue.length === 0} title={ready ? 'Plays every walk-up one after another' : 'Spotify must be ready'} onClick={() => playAt(0, true)}>▶▶ Play all</button>
          </>
        ) : (
          <>
            <button disabled={cur === 0} onClick={() => playAt(cur! - 1, auto)}>⏮ Previous</button>
            <button disabled={cur! + 1 >= queue.length} onClick={() => playAt(cur! + 1, auto)}>⏭ Next song</button>
            <button className="danger" onClick={() => end(true)}>■ Stop test</button>
          </>
        )}
      </div>
      {queue.length === 0 && <div className="muted mt-2">No walk-up songs yet. Add them in Edit mode.</div>}
      {item && (
        <div className="mt-3" role="status">
          <b>{cur! + 1} of {queue.length}:</b> {slotName(item.s, item.i)} — ♪ {item.s.track!.name}
          {auto && <span className="muted"> · moving on automatically</span>}
        </div>
      )}
      {!active && missing > 0 && queue.length > 0 && <div className="muted mt-2">{missing} slot{missing === 1 ? ' has' : 's have'} no walk-up song and will be skipped.</div>}
      {err && <div role="alert" className="text-danger mt-2">{err}</div>}
    </div>
  );
}
