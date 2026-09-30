import { useCallback, useEffect, useRef, useState } from 'react';
import type { Show } from '../types';
import { DEFAULTS, formatClock, hasWalkOff, timerStatus } from '../lib';
import type { WalkUpPlayer } from '../spotify/player';
import {
  bindKey, canFire, DEFAULT_BINDINGS, isBindable, keyLabel, loadBindings, resolveAction, saveBindings, unbindAction,
  type Action, type Bindings,
} from './clicker';
import { RemotePanel } from './RemotePanel';
import { clampFade, FADE_MAX_MS, FADE_MIN_MS, loadSettings, saveSettings, type AudioSettings } from './settings';

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
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);
  const [closingPlaying, setClosingPlaying] = useState(false);
  // True only while a walk-up we started is playing; gates the automatic timer start.
  const armedRef = useRef(false);
  const phaseRef = useRef<Phase>('cued');
  const settingsRef = useRef(settings);

  const slot = show.slots[idx];
  const next = show.slots[idx + 1];
  const done = idx >= show.slots.length;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (player) player.fadeOutMs = settings.fadeOutMs;
    saveSettings(settings);
  }, [player, settings]);

  /** Fade in the background so the show's state changes the instant a button is pressed. */
  const fadeOutNow = () => {
    if (player && ready) player.stop().catch((e: Error) => setErr(e.message));
  };

  phaseRef.current = phase;
  settingsRef.current = settings;

  // Timer starts on its own when the walk-up music has gone quiet (fade finished, panic, or song ended).
  useEffect(() => {
    if (!player) return;
    player.onSilent = () => {
      if (!armedRef.current || phaseRef.current !== 'walkup' || !settingsRef.current.autoStartTimer) return;
      armedRef.current = false;
      setStartedAt(Date.now());
      setPhase('timing');
    };
    return () => { player.onSilent = undefined; };
  }, [player]);

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
      armedRef.current = true;
    }
    setPhase('walkup');
  });
  const onStage = () => guard(async () => {
    armedRef.current = false;
    fadeOutNow();
    setStartedAt(Date.now());
    setPhase('timing');
  });
  const endSet = () => guard(async () => {
    armedRef.current = false;
    if (slot) setLog((l) => [...l, { name: slot.performer || 'Unnamed', elapsedMs: now - startedAt, setLengthMin: slot.setLengthMin }]);
    if (player && ready) {
      try {
        // Walk-off is comedians only; hosts and breaks just fade out.
        if (slot && hasWalkOff(slot)) {
          await player.play(slot.walkOffTrack!, slot.walkOffStartMs ?? 0, slot.walkOffCueMs ?? DEFAULTS.walkOffCueMs, 400);
        } else {
          fadeOutNow();
        }
      } catch (e) { setErr((e as Error).message); } // never block the show on a playback error
    }
    setIdx((i) => i + 1);
    setPhase('cued');
  });
  const skip = () => guard(async () => { armedRef.current = false; fadeOutNow(); setIdx((i) => Math.min(show.slots.length, i + 1)); setPhase('cued'); });
  const back = () => {
    armedRef.current = false;
    if (closingPlaying) { fadeOutNow(); setClosingPlaying(false); }
    setIdx((i) => Math.max(0, i - 1));
    setPhase('cued');
  };

  const closing = () => guard(async () => {
    if (closingPlaying) { fadeOutNow(); setClosingPlaying(false); return; }
    if (show.closingTrack && player && ready) {
      await player.unlock();
      await player.play(show.closingTrack, show.closingStartMs ?? 0, show.closingCueMs ?? DEFAULTS.closingCueMs, 1200);
      setClosingPlaying(true);
    }
  });

  const primary = done ? closing : phase === 'cued' ? playWalkup : phase === 'walkup' ? onStage : endSet;
  const primaryRef = useRef(primary);
  primaryRef.current = primary;

  const fade = () => guard(async () => { setClosingPlaying(false); fadeOutNow(); });
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
      const el = e.target as HTMLInputElement;
      // Ignore real typing, but sliders/checkboxes must not swallow clicker keys after being touched.
      const typing = el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
        || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type));
      if (typing) return;
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
          <>
            <div className="phase">Show complete</div>
            <div className="who">That's a wrap 🎤</div>
            <div className="muted">Total running time {runningTotal}</div>
            {show.closingTrack ? (
              <>
                <div className="muted" style={{ marginTop: 16 }}>♪ {show.closingTrack.name} — {show.closingTrack.artist}</div>
                <div className="controls" style={{ marginTop: 16 }}>
                  <button className="primary" onClick={() => void closing()}>
                    {closingPlaying ? '■ Fade out closing song' : '▶ Play closing song'}
                  </button>
                  <button className="danger" onClick={() => void panic()}>Panic stop</button>
                </div>
              </>
            ) : <div className="muted" style={{ marginTop: 16 }}>No end-of-show song set.</div>}
          </>
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
                {phase === 'cued' ? '▶ Play walk-up' : phase === 'walkup' ? '🎤 On stage — start timer now' : '■ End set'}
              </button>
              <button onClick={() => void fade()}>Fade out</button>
              <button className="danger" onClick={() => void panic()}>Panic stop</button>
            </div>
            {phase === 'walkup' && settings.autoStartTimer && slot.track && ready && (
              <div className="muted" style={{ marginTop: 12 }} role="status">Timer starts automatically when the music stops.</div>
            )}
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
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Fade length</h2>
          <div className="spacer" />
          <strong>{(settings.fadeOutMs / 1000).toFixed(1)} s</strong>
        </div>
        <p className="muted" style={{ margin: '8px 0' }}>
          How long music takes to fade out when you press Fade out, when the comic takes the stage, and when a
          walk-up or walk-off reaches its time limit. Longer is smoother.
        </p>
        <input type="range" min={FADE_MIN_MS} max={FADE_MAX_MS} step={500} value={settings.fadeOutMs}
          aria-label="Fade length in seconds"
          onChange={(e) => setSettings((s) => ({ ...s, fadeOutMs: clampFade(Number(e.target.value)) }))} />
        <label className="check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={settings.autoStartTimer}
            onChange={(e) => setSettings((s) => ({ ...s, autoStartTimer: e.target.checked }))} />
          Start the timer automatically when the walk-up music stops
        </label>
      </div>
      <RemotePanel bindings={bindings} listening={listening} lastKey={lastKey} onListen={setListening}
        onClear={(a) => setBindings((b) => unbindAction(b, a))} onReset={() => setBindings(DEFAULT_BINDINGS)} />
      {err && <div className="toast" role="alert">{err}</div>}
    </div>
  );
}
