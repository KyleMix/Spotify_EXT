import { useEffect, useState } from 'react';
import type { LightEngine } from '../engine';
import { MOMENTS } from '../looks';
import { hsvToRgb } from '../sound';
import { cssColor } from '../color';
import { EFFECTS } from '../effects';
import { useEngine, useTicker } from './useEngine';
import { loadSettings, saveSettings, type WarningMode } from '../../features/settings';

/** Which look each moment of the show fires, the warning flash length, and the microphone for sound-reactive looks. */
export function ShowTab({ engine }: { engine: LightEngine }) {
  useEngine(engine);
  const mic = engine.sound;
  const [, force] = useState(0);
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  // Shared with Live mode's Setup (only one of the two screens is open at a time, so storage keeps them in step).
  const [warningMode, setWarningMode] = useState<WarningMode>(() => loadSettings().warningMode);
  const chooseWarning = (m: WarningMode) => { setWarningMode(m); saveSettings({ ...loadSettings(), warningMode: m }); };
  const timerOnly = warningMode === 'display';
  const unused = (id: string) => timerOnly && (id === 'warning' || id === 'timeup');
  useEffect(() => mic.subscribe(() => force((n) => n + 1)), [mic]);
  useEffect(() => { void mic.devices().then(setMics); }, [mic, mic.status]);

  const { warnPulseSec, soundSensitivity, autoGain } = engine.show;
  const { looks, cues } = engine.looksState;
  const isMusic = (id: string) => !!EFFECTS.find((e) => e.id === id)?.music;
  const usesSound = looks.some((l) => (isMusic(l.all.effect) || Object.values(l.perFixture).some((p) => isMusic(p.effect))) && Object.values(cues).includes(l.id));

  return (
    <>
      <div className="card mb-3">
        <h2 className="m-0">Time warning</h2>
        <div className="seg mt-2" role="radiogroup" aria-label="Time warning mode">
          <button role="radio" aria-checked={timerOnly} className={timerOnly ? 'on' : ''} onClick={() => chooseWarning('display')}>Timer only (no warning light)</button>
          <button role="radio" aria-checked={!timerOnly} className={!timerOnly ? 'on' : ''} onClick={() => chooseWarning('light')}>Lights go red</button>
        </div>
        <p className="muted mt-2 mb-0">
          {timerOnly
            ? 'No warning light: the lights stay on the On stage look for the whole set, and the timer (Live mode and the comedian timer window) is the warning.'
            : "The lights fire the Light warning look at each act's light-warning time and Time's up when the set length is reached."}
          {' '}Same setting as Live → Setup → Time warning.
        </p>
      </div>

      <div className="card mb-3">
        <h2 className="m-0">Show cues</h2>
        <p className="muted mt-2">While Live mode is open, each moment of the show fires a look. Firing a look by hand on the Console overrides this until you go back to the show.</p>
        <div className="cue-table">
          {MOMENTS.map((m) => (
            <div key={m.id} className={`cue-row${engine.moment === m.id ? ' now' : ''}${unused(m.id) ? ' unused' : ''}`}>
              <div>
                <strong>{m.label}</strong>{engine.moment === m.id && <span className="pill ok ml-2">now</span>}
                <div className="muted">{unused(m.id) ? 'Not used: Timer only mode has no warning light.' : m.hint}</div>
              </div>
              <select value={cues[m.id]} aria-label={`Look for ${m.label}`} disabled={unused(m.id)} onChange={(e) => engine.setCue(m.id, e.target.value)}>
                <option value="">Dark</option>
                {looks.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          ))}
        </div>
        {!timerOnly && (
          <div className="grid g3 mt-3">
            <div>
              <label>Light warning lasts (sec, 0 = until time's up)</label>
              <input type="number" min={0} max={30} value={warnPulseSec} aria-label="Light warning length in seconds"
                onChange={(e) => engine.setShowSettings({ warnPulseSec: e.target.value === '' ? 0 : Number(e.target.value) })} />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row wrap">
          <h2 className="m-0">Microphone</h2>
          <span className="muted">for music looks{usesSound ? '' : ' (no show cue uses one right now)'}</span>
        </div>
        <p className="muted mt-2">Point it at the speakers. Music looks (Beat colors, Beat chase, Ripple, Music meter, Bass / mid / treble, Color to music) follow it. With the mic off they run a slow idle pattern instead.</p>
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
        {mic.status === 'on' && <MusicMeter engine={engine} />}
        <div className="grid g3 mt-2">
          <div>
            <label>Sound sensitivity ({soundSensitivity})</label>
            <input type="range" min={1} max={10} value={soundSensitivity} aria-label="Sound sensitivity (1-10)"
              onChange={(e) => engine.setShowSettings({ soundSensitivity: Number(e.target.value) })} />
          </div>
          <div>
            <label>Volume</label>
            <label className="check">
              <input type="checkbox" checked={autoGain} onChange={(e) => engine.setShowSettings({ autoGain: e.target.checked })} />
              Auto-adjust to the room
            </label>
          </div>
        </div>
        <p className="muted mt-2 mb-0">
          {autoGain
            ? 'Auto-adjust follows how loud the room has been over the last few seconds, so quiet and loud rooms react alike. Raise sensitivity if the lights barely move, lower it if they never settle.'
            : 'Fixed volume: raise sensitivity for a quiet room or a far-away mic, lower it if the lights are always at full.'}
          {' '}Very quiet sound (room noise) is ignored.
        </p>
      </div>
    </>
  );
}

/** Live readout of what the analyser hears: overall level, the three bands, the beat light and the gain. */
function MusicMeter({ engine }: { engine: LightEngine }) {
  useTicker(60);
  const a = engine.audio;
  if (!a?.live) return null;
  const bar = (label: string, v: number) => (
    <div className="music-row" key={label}>
      <span className="muted">{label}</span>
      <div className="meter"><i style={{ width: `${Math.round(v * 100)}%` }} /></div>
    </div>
  );
  return (
    <div className="music-meter" aria-label={`Sound level ${Math.round(a.level * 100)}%`}>
      <div className="music-bars">
        {bar('Level', a.level)}{bar('Bass', a.bass)}{bar('Mid', a.mid)}{bar('Treble', a.treble)}
      </div>
      <div className="music-beat">
        <span className="beat-dot" style={{ background: cssColor(hsvToRgb(a.hue, 1, 0.25 + 0.75 * a.flash)), transform: `scale(${1 + 0.4 * a.flash})` }} />
        <span className="muted">beat {a.beatCount}</span>
        <span className="muted">gain ×{engine.sound.analyzer.gain.toFixed(1)}</span>
      </div>
    </div>
  );
}
