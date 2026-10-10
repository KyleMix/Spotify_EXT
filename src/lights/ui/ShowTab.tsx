import { useEffect, useState } from 'react';
import type { LightEngine } from '../engine';
import { MOMENTS } from '../looks';
import type { Bands } from '../sound';
import { useEngine } from './useEngine';

/** Which look each moment of the show fires, the warning flash length, and the microphone for sound-reactive looks. */
export function ShowTab({ engine }: { engine: LightEngine }) {
  useEngine(engine);
  const mic = engine.sound;
  const [, force] = useState(0);
  const [bands, setBands] = useState<Bands | null>(null);
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => mic.subscribe(() => force((n) => n + 1)), [mic]);
  useEffect(() => { void mic.devices().then(setMics); }, [mic, mic.status]);
  useEffect(() => {
    const t = setInterval(() => setBands(mic.levels()), 100);
    return () => clearInterval(t);
  }, [mic]);

  const { warnPulseSec, soundSensitivity } = engine.show;
  const { looks, cues } = engine.looksState;
  const level = Math.round(Math.min(1, (bands?.level ?? 0) * (0.5 + ((soundSensitivity - 1) / 9) * 2.5)) * 100);
  const usesSound = looks.some((l) => (l.all.effect === 'sound' || Object.values(l.perFixture).some((p) => p.effect === 'sound')) && Object.values(cues).includes(l.id));

  return (
    <>
      <div className="card mb-3">
        <h2 className="m-0">Show cues</h2>
        <p className="muted mt-2">While Live mode is open, each moment of the show fires a look. Firing a look by hand on the Console overrides this until you go back to the show.</p>
        <div className="cue-table">
          {MOMENTS.map((m) => (
            <div key={m.id} className={`cue-row${engine.moment === m.id ? ' now' : ''}`}>
              <div>
                <strong>{m.label}</strong>{engine.moment === m.id && <span className="pill ok ml-2">now</span>}
                <div className="muted">{m.hint}</div>
              </div>
              <select value={cues[m.id]} aria-label={`Look for ${m.label}`} onChange={(e) => engine.setCue(m.id, e.target.value)}>
                <option value="">Dark</option>
                {looks.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="grid g3 mt-3">
          <div>
            <label>Light warning lasts (sec, 0 = until time's up)</label>
            <input type="number" min={0} max={30} value={warnPulseSec} aria-label="Light warning length in seconds"
              onChange={(e) => engine.setShowSettings({ warnPulseSec: e.target.value === '' ? 0 : Number(e.target.value) })} />
          </div>
        </div>
        <p className="muted mt-2 mb-0">
          In Live mode's pop-out timer mode the Light warning and Time's up cues are skipped (the lights stay on the On stage look);
          the timer window is the warning instead.
        </p>
      </div>

      <div className="card">
        <div className="row wrap">
          <h2 className="m-0">Microphone</h2>
          <span className="muted">for Sound reactive looks{usesSound ? '' : ' (no show cue uses one right now)'}</span>
        </div>
        <p className="muted mt-2">Point it at the speakers. Each beat jumps to a new color and louder is brighter. With the mic off, sound looks fade slowly through colors.</p>
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
            <label>Sound sensitivity (1-10)</label>
            <input type="range" min={1} max={10} value={soundSensitivity} aria-label="Sound sensitivity (1-10)"
              onChange={(e) => engine.setShowSettings({ soundSensitivity: Number(e.target.value) })} />
          </div>
        </div>
      </div>
    </>
  );
}
