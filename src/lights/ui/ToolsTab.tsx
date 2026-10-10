import { useEffect, useMemo, useState } from 'react';
import type { LightEngine } from '../engine';
import { channelOwners, modeOf, profileOf, type Rig } from '../patch';
import { channelLabel } from '../profiles';
import { checkSteps, describeStep, usedSlots } from '../render';
import { useEngine, useTicker } from './useEngine';

/* Owner colors for the monitor: one hue per light, spread around the wheel. */
const ownerHue = (i: number) => (i * 137.5) % 360;

/** Which light and channel name each DMX channel is, e.g. "Neo-Slim · Par 3 red". */
function channelNames(rig: Rig): Record<number, string> {
  const out: Record<number, string> = {};
  rig.fixtures.forEach((f, i) => {
    const mode = modeOf(rig, f);
    const px = profileOf(rig, f)?.pixelName;
    mode?.channels.forEach((c, ci) => { out[f.address + ci] = `${f.name || `Light ${i + 1}`} · ${channelLabel(c, mode, px)}`; });
  });
  return out;
}

function RigCheck({ engine }: { engine: LightEngine }) {
  const c = engine.check;
  const total = useMemo(() => checkSteps(engine.rig).length, [engine.rig]);
  const step = c?.steps[c.index];
  return (
    <div className="card mb-3">
      <h2 className="m-0">Rig check</h2>
      <p className="muted mt-2">
        Lights every pod or par of every light in red, then green, blue and white, one at a time, with everything else dark.
        Watch the rig: each step should light exactly the part named below, in that color. Use this before every show.
      </p>
      {!c ? (
        <button className="primary" disabled={!total} onClick={() => engine.startCheck()}>Start rig check ({total} steps)</button>
      ) : (
        <>
          <div className="check-now" role="status">
            <span className="swatch" style={{ background: `rgb(${step!.color.r}, ${step!.color.g}, ${step!.color.b})` }} />
            <strong>{describeStep(engine.rig, step!)}</strong>
            <span className="muted">step {c.index + 1} of {c.steps.length}</span>
          </div>
          <div className="row wrap gap-2 mt-2">
            <button className="mini" onClick={() => engine.stepCheck(-1)} disabled={c.index === 0} aria-label="Previous step">◀ Prev</button>
            <button className="mini" onClick={() => engine.pauseCheck(!c.playing)}>{c.playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button className="mini" onClick={() => engine.stepCheck(1)} disabled={c.index >= c.steps.length - 1} aria-label="Next step">Next ▶</button>
            <button className="mini" onClick={() => engine.stopCheck()}>Stop</button>
          </div>
        </>
      )}
    </div>
  );
}

function Tester({ engine, initialFixture }: { engine: LightEngine; initialFixture: string | null }) {
  const { rig } = engine;
  const [fid, setFid] = useState<string>(() => initialFixture ?? rig.fixtures[0]?.id ?? '');
  const fixture = rig.fixtures.find((f) => f.id === fid) ?? rig.fixtures[0];
  const mode = fixture ? modeOf(rig, fixture) : undefined;
  const px = fixture ? profileOf(rig, fixture)?.pixelName : undefined;
  const home = useMemo(() => Object.fromEntries((mode?.channels ?? []).map((c, i) => [i + 1, c.home])), [mode]);
  const active = engine.raw && engine.raw.fixtureId === fixture?.id ? engine.raw.values : null;
  const values = active ?? home;
  const [stepCh, setStepCh] = useState(0);

  useEffect(() => { if (initialFixture) setFid(initialFixture); }, [initialFixture]);

  if (!fixture || !mode) return <div className="card mb-3 muted">Add a light in the Rig tab to test its channels.</div>;

  const send = (v: Record<number, number>) => engine.setRaw(fixture.id, v);
  const set = (ch: number, v: number) => send({ ...values, [ch]: Math.min(255, Math.max(0, v)) });
  const solo = (ch: number) => {
    const c = Math.min(mode.channels.length, Math.max(1, ch));
    setStepCh(c);
    send({ ...home, [c]: 255 });
  };

  return (
    <div className="card mb-3">
      <div className="row wrap">
        <h2 className="m-0">Channel tester</h2>
        <div className="spacer" />
        <select className="w-auto" value={fixture.id} aria-label="Light to test" onChange={(e) => { engine.clearRaw(); setStepCh(0); setFid(e.target.value); }}>
          {rig.fixtures.map((f, i) => <option key={f.id} value={f.id}>{f.name || `Light ${i + 1}`} (ch {f.address}–{f.address + (modeOf(rig, f)?.channels.length ?? 1) - 1})</option>)}
        </select>
      </div>
      <p className="muted mt-2">
        Every slider is one DMX channel of this light, starting at its address. Channels marked as mode/control start at the value
        that keeps the light in DMX mode. <strong>Step through</strong> lights one channel at a time (the others stay at home),
        which is the quickest way to learn what an unknown light's channels do.
      </p>
      <div className="row wrap gap-2 mb-3">
        <button className="mini" onClick={() => solo(stepCh - 1)} disabled={stepCh <= 1} aria-label="Previous channel">◀</button>
        <button className="mini primary" onClick={() => solo(stepCh || 1)}>{stepCh ? `Channel ${stepCh} at full` : 'Step through channels'}</button>
        <button className="mini" onClick={() => solo(stepCh + 1)} disabled={stepCh >= mode.channels.length} aria-label="Next channel">▶</button>
        <button className="mini" onClick={() => { setStepCh(0); send(home); }}>Reset to home</button>
        <button className="mini" disabled={!active} onClick={() => { setStepCh(0); engine.clearRaw(); }}>Stop testing</button>
        <label className="check ml-2">
          <input type="checkbox" checked={engine.soloTester} onChange={(e) => engine.setSoloTester(e.target.checked)} />
          Other lights dark while testing
        </label>
      </div>
      {!active && <p className="muted mt-0">Not testing: the light is following the show. Move a slider or step through to take over.</p>}
      <div className="chan-sliders">
        {mode.channels.map((c, i) => {
          const ch = i + 1;
          return (
            <div key={ch} className={`chan-row${stepCh === ch ? ' hot' : ''}`}>
              <span className="chan-num" title={`DMX channel ${fixture.address + i}`}>{ch}</span>
              <span className="chan-name">{channelLabel(c, mode, px)}{c.type === 'control' && <span className="muted"> · hold {c.home}</span>}</span>
              <input type="range" min={0} max={255} value={values[ch] ?? 0} aria-label={`Channel ${ch}: ${channelLabel(c, mode, px)}`}
                onChange={(e) => { setStepCh(0); set(ch, Number(e.target.value)); }} />
              <input type="number" min={0} max={255} value={values[ch] ?? 0} aria-label={`Channel ${ch} value`} className="chan-val"
                onChange={(e) => { setStepCh(0); set(ch, Number(e.target.value)); }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Monitor({ engine }: { engine: LightEngine }) {
  useTicker(100);
  const [all, setAll] = useState(false);
  const { rig, universe } = engine;
  const owners = useMemo(() => channelOwners(rig), [rig]);
  const names = useMemo(() => channelNames(rig), [rig]);
  const index = useMemo(() => Object.fromEntries(rig.fixtures.map((f, i) => [f.id, i])), [rig]);
  const shown = all ? 512 : Math.max(32, Math.ceil(usedSlots(rig) / 16) * 16);

  return (
    <div className="card">
      <div className="row wrap">
        <h2 className="m-0">Universe monitor</h2>
        <span className="muted">what is being sent right now{engine.status === 'connected' ? '' : ' (not connected: nothing reaches the lights)'}</span>
        <div className="spacer" />
        <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All 512</label>
      </div>
      <div className="row wrap gap-2 mt-2 mb-2">
        {rig.fixtures.map((f, i) => (
          <span key={f.id} className="legend"><i style={{ background: `hsl(${ownerHue(i)} 70% 55%)` }} />{f.name || `Light ${i + 1}`}</span>
        ))}
      </div>
      <div className="universe" role="img" aria-label="DMX channel values">
        {Array.from({ length: shown }, (_, k) => {
          const ch = k + 1, v = universe[ch], owner = owners[ch];
          const hue = owner ? ownerHue(index[owner]) : null;
          return (
            <div key={ch} className={`cell${owner ? '' : ' free'}`} title={`Ch ${ch}${names[ch] ? ` · ${names[ch]}` : ''} = ${v}`}
              style={{ borderColor: hue === null ? undefined : `hsl(${hue} 70% 55%)`, background: v ? `color-mix(in srgb, var(--accent) ${Math.round((v / 255) * 70)}%, var(--panel2))` : undefined }}>
              <span className="cell-ch">{ch}</span><span className="cell-v">{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ToolsTab({ engine, initialFixture }: { engine: LightEngine; initialFixture: string | null }) {
  useEngine(engine);
  // Leaving the tools hands the lights back to the show.
  useEffect(() => () => { engine.clearRaw(); engine.stopCheck(); }, [engine]);
  return (
    <>
      <RigCheck engine={engine} />
      <Tester engine={engine} initialFixture={initialFixture} />
      <Monitor engine={engine} />
    </>
  );
}
