import { useCallback, useEffect, useRef, useState } from 'react';
import type { Show } from '../types';
import { formatClock, timerStatus } from '../lib';
import type { WalkUpPlayer } from '../spotify/player';
import {
  bindKey, canFire, DEFAULT_BINDINGS, isBindable, keyLabel, loadBindings, resolveAction, saveBindings, unbindAction,
  type Action, type Bindings,
} from './clicker';
import { RemotePanel } from './RemotePanel';

type Phase = 'cued' | 'walkup' | 'timing';
interface LogEntry { name: string; elapsedMs: number; setLengthMin: number }

export function Live({ show, player, ready }: { show: Show; player: WalkUpPlayer | null; ready: boolean }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('cued');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showStart, setShowStart] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [bindings, setBindings] = useState<Bindings>(loadBindings);
  const [listening, setListening] = useState<Action | null>(null);
  const [lastKey, setLastKey] = useState('');

  const slot = show.slots[idx];
  const next = show.slots[idx + 1];
  const done = idx >= show.slots.length;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    try { setErr(''); await fn(); } catch (e) { setErr((e as Error).message); }
  }, []);

  const elapsed = phase === 'timing' ? now - startedAt : 0;
  const st = slot ? timerStatus(elapsed, slot.setLengthMin, slot.warnAtMin) : null;
  const pct = slot && slot.setLengthMin > 0 ? Math.min(100, (elapsed / (slot.setLengthMin * 60_000)) * 100) : 0;

  const playWalkup = () => guard(async () => {
    if (!slot) return;
    if (showStart === null) setShowStart(Date.now());
    if (slot.track && player && ready) {
      await player.unlock();
      await player.play(slot.track, slot.startOffsetMs, slot.cueLengthMs);
    }
    setPhase('walkup');
  });
  const onStage = () => guard(async () => {
    if (player && ready) await player.stop(2000);
    setStartedAt(Date.now());
    setPhase('timing');
  });
  const endSet = () => guard(async () => {
    if (slot) setLog((l) => [...l, { name: slot.performer || 'Unnamed', elapsedMs: now - startedAt, setLengthMin: slot.setLengthMin }]);
    if (player && ready) await player.stop(800);
    setIdx((i) => i + 1);
    setPhase('cued');
  });
  const skip = () => guard(async () => { if (player && ready) await player.stop(500); setIdx((i) => Math.min(show.slots.length, i + 1)); setPhase('cued'); });
  const back = () => { setIdx((i) => Math.max(0, i - 1)); setPhase('cued'); };

  const primary = phase === 'cued' ? playWalkup : phase === 'walkup' ? onStage : endSet;
  const primaryRef = useRef(primary);
  primaryRef.current = primary;

  const fade = () => guard(async () => { await player?.stop(1200); });
  const panic = () => guard(async () => { await player?.panic(); });
  const handlers = useRef({ next: primary, fade, panic });
  handlers.current = { next: primary, fade, panic };
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const listeningRef = useRef(listening);
  listeningRef.current = listening;
  const lastFired = useRef<Partial<Record<Action, number>>>({});

  useEffect(() => { saveBindings(bindings); }, [bindings]);

  // Keyboard + Bluetooth clickers (which present as keyboards) drive the same actions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      setLastKey(e.code);

      const assigning = listeningRef.current;
      if (assigning) {
        e.preventDefault();
        if (isBindable(e.code)) { setBindings((b) => bindKey(b, assigning, e.code)); setListening(null); }
        return;
      }

      const action = resolveAction(bindingsRef.current, e.code);
      if (!action) return;
      e.preventDefault(); // also stops Enter/Space from "clicking" whichever button has focus
      (document.activeElement as HTMLElement | null)?.blur?.();
      const t = Date.now();
      if (!canFire(lastFired.current[action], t, action)) return;
      lastFired.current[action] = t;
      void handlers.current[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (show.slots.length === 0) return <div className="card muted">Add someone to the lineup in Edit mode first.</div>;

  const runningTotal = showStart ? formatClock(now - showStart) : '0:00';

  return (
    <div className="live">
      <div className="card stage">
        {done ? (
          <><div className="phase">Show complete</div><div className="who">That's a wrap 🎤</div><div className="muted">Total running time {runningTotal}</div></>
        ) : (
          <>
            <div className="phase">
              {phase === 'cued' ? 'Up next' : phase === 'walkup' ? 'Walk-up playing' : 'On stage'} · {idx + 1} of {show.slots.length}
            </div>
            <div className="who">{slot.performer || 'Unnamed'}</div>
            <div className="muted">{slot.track ? `♪ ${slot.track.name} — ${slot.track.artist}` : 'No walk-up song'}{slot.notes && ` · ${slot.notes}`}</div>
            <div className={`clock ${phase === 'timing' && st ? st.state : 'idle'}`}>
              {phase === 'timing' ? formatClock(elapsed) : '0:00'}
            </div>
            <div className={`bar ${phase === 'timing' && st ? st.state : ''}`}><i style={{ width: `${pct}%` }} /></div>
            <div className="muted" style={{ marginBottom: 20 }}>
              {phase === 'timing' && st
                ? st.state === 'over' ? `Over by ${formatClock(st.overMs)}` : `${formatClock(st.remainingMs)} left of ${slot.setLengthMin} min`
                : `Set length ${slot.setLengthMin} min`}
            </div>
            <div className="controls">
              <button className="primary" onClick={() => void primary()}>
                {phase === 'cued' ? '▶ Play walk-up' : phase === 'walkup' ? '🎤 On stage — start timer' : '■ End set'}
              </button>
              <button onClick={() => void fade()}>Fade out</button>
              <button className="danger" onClick={() => void panic()}>Panic stop</button>
            </div>
            <div className="muted" style={{ marginTop: 16 }}>
              <kbd>{keyLabel(bindings.next[0] ?? '')}</kbd> next step · <kbd>{keyLabel(bindings.fade[0] ?? '')}</kbd> fade out · <kbd>{keyLabel(bindings.panic[0] ?? '')}</kbd> panic stop
              {!ready && ' · Spotify not connected: timer works, music is off'}
            </div>
          </>
        )}
      </div>

      <div className="grid g2">
        <div className="card next">
          <div><div className="muted">NEXT</div><div style={{ fontWeight: 600, fontSize: 18 }}>{next ? next.performer || 'Unnamed' : '—'}</div>
            <div className="muted">{next?.track ? `♪ ${next.track.name}` : ''}</div></div>
          <div className="row"><button onClick={back} disabled={idx === 0}>← Back</button><button onClick={() => void skip()} disabled={done}>Skip →</button></div>
        </div>
        <div className="card">
          <div className="row"><div className="muted">SHOW CLOCK</div><div className="spacer" /><strong>{runningTotal}</strong></div>
          <div className="log" style={{ marginTop: 8 }}>
            {log.length === 0 && <div className="muted">Set times will appear here.</div>}
            {log.map((l, i) => {
              const diff = l.elapsedMs - l.setLengthMin * 60_000;
              return (
                <div className="li" key={i}><span>{l.name}</span>
                  <span>{formatClock(l.elapsedMs)} <span className="muted" style={{ color: diff > 0 ? 'var(--danger)' : 'var(--ok)' }}>
                    ({diff > 0 ? '+' : '-'}{formatClock(Math.abs(diff))})</span></span></div>
              );
            })}
          </div>
        </div>
      </div>
      <RemotePanel bindings={bindings} listening={listening} lastKey={lastKey} onListen={setListening}
        onClear={(a) => setBindings((b) => unbindAction(b, a))} onReset={() => setBindings(DEFAULT_BINDINGS)} />
      {err && <div className="toast" role="alert">{err}</div>}
    </div>
  );
}
