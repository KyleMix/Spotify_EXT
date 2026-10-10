import { useEffect, useState } from 'react';
import type { LightEngine } from '../engine';
import { cssColor } from '../color';
import type { Bands } from '../sound';
import { useEngine } from './useEngine';

/** How the lights follow the show for now (Phase 2 replaces this with looks): warning timing, white level, sound. */
export function ShowTab({ engine }: { engine: LightEngine }) {
  useEngine(engine);
  const mic = engine.sound;
  const [, force] = useState(0);
  const [bands, setBands] = useState<Bands | null>(null);
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => mic.subscribe(() => force((n) => n + 1)), [mic]);
  useEffect(() => { void mic.devices().then(setMics); }, [mic, mic.status]);
  useEffect(() => {
    const t = setInterval(() => { setBands(mic.levels()); force((n) => n + 1); }, 100);
    return () => clearInterval(t);
  }, [mic]);

  const { warnPulseSec, stageWhite, soundSensitivity } = engine.show;
  const stage = engine.rig.fixtures.filter((f) => f.role === 'stage').length;
  const warning = engine.rig.fixtures.length - stage;
  const level = Math.round(Math.min(1, (bands?.level ?? 0) * (0.5 + ((soundSensitivity - 1) / 9) * 2.5)) * 100);
  const now = engine.stageMode === 'white' ? `white at ${stageWhite}% (an act is on stage)`
    : engine.stageMode === 'sound' ? (mic.status === 'on' ? 'following the microphone' : 'slow color fade (microphone off)')
      : 'off (Live mode is closed)';

  return (
    <>
      <div className="card mb-3">
        <div className="row wrap">
          <h2 className="m-0">Stage lights</h2>
          <span className="muted">{stage} light{stage === 1 ? '' : 's'} · now: {now}</span>
          <div className="spacer" />
          {engine.status === 'connected' && <span className="swatch" title="Color being sent to the stage lights" style={{ background: cssColor(engine.lastStageColor) }} />}
        </div>
        <p className="muted mt-2">
          White while a comedian is on the clock. During walk-ups, walk-offs, between acts and the closing song they change color
          with the sound the microphone hears: each beat jumps to a new color, and louder is brighter. They only follow the show
          while Live mode is open.
        </p>
        <div className="row wrap gap-2 mb-2">
          {mic.status === 'on'
            ? <button className="mini" onClick={() => mic.stop()}>Stop microphone</button>
            : <button className="mini primary" disabled={mic.status === 'unsupported' || mic.status === 'starting'} onClick={() => void mic.start()}>🎤 Start microphone</button>}
          {mics.length > 1 && (
            <select className="w-auto" value={mic.deviceId} aria-label="Microphone" onChange={(e) => void mic.start(e.target.value)}>
              <option value="">Default microphone</option>
              {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
          {mic.message && <span className={`muted${mic.status === 'error' ? ' text-danger' : ''}`} role="status">{mic.message}</span>}
        </div>
        {mic.status === 'on' && (
          <div className="mb-2" aria-label={`Sound level ${level}%`}><div className="meter"><i style={{ width: `${level}%` }} /></div></div>
        )}
        <div className="grid g3">
          <div>
            <label>White level during a set (%)</label>
            <input type="number" min={0} max={100} value={stageWhite} aria-label="White level during a set (%)"
              onChange={(e) => engine.setShowSettings({ stageWhite: e.target.value === '' ? 0 : Number(e.target.value) })} />
          </div>
          <div>
            <label>Sound sensitivity (1-10)</label>
            <input type="range" min={1} max={10} value={soundSensitivity} aria-label="Sound sensitivity (1-10)"
              onChange={(e) => engine.setShowSettings({ soundSensitivity: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="m-0">Warning lights</h2>
        <p className="muted mt-2">
          {warning
            ? `${warning} light${warning === 1 ? '' : 's'}. At each act's light-warning time they flash red, go off, then turn red when time is up and stay red until the next act.`
            : 'No light has the Warning role. Set a light\'s role in the Rig tab, or use the pop-out timer in Live mode instead.'}
        </p>
        <div className="grid g3">
          <div>
            <label>Warning flash (sec, 0 = stay on)</label>
            <input type="number" min={0} max={30} value={warnPulseSec} aria-label="Warning flash (sec, 0 = stay on)"
              onChange={(e) => engine.setShowSettings({ warnPulseSec: e.target.value === '' ? 0 : Number(e.target.value) })} />
          </div>
        </div>
      </div>
    </>
  );
}
