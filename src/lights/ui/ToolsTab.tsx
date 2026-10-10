import { useEffect, useMemo, useState } from 'react';
import type { LightEngine } from '../engine';
import { channelOwners, modeOf, profileOf, type Rig } from '../patch';
import { channelLabel } from '../profiles';
import { checkSteps, describeStep, MAX_RAW_CHANNELS, usedSlots } from '../render';
import { describeAnswer, learnedProfile, type LearnAnswer } from '../learn';
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
  // Learning: how many channels the light's real mode has, what each channel did, and where the last one lit.
  const [count, setCount] = useState(0);
  const [answers, setAnswers] = useState<Record<number, LearnAnswer>>({});
  const [where, setWhere] = useState(1);
  const [saved, setSaved] = useState('');
  // Stepping is a true solo by default: every other channel at 0, so a channel the profile calls a dimmer (held at
  // full) can't hide that it's really a color. Optionally keep dimmer/mode channels at their home values instead.
  const [holdHome, setHoldHome] = useState(false);

  useEffect(() => { if (initialFixture) setFid(initialFixture); }, [initialFixture]);
  useEffect(() => { setAnswers({}); setCount(0); setWhere(1); setSaved(''); }, [fid]);

  if (!fixture || !mode) return <div className="card mb-3 muted">Add a light in the Rig tab to test its channels.</div>;

  const send = (v: Record<number, number>) => engine.setRaw(fixture.id, v);
  const set = (ch: number, v: number) => send({ ...values, [ch]: Math.min(255, Math.max(0, v)) });
  const total = count || mode.channels.length;
  const solo = (ch: number) => {
    const c = Math.min(total, Math.max(1, ch));
    setStepCh(c);
    const base = holdHome ? home : Object.fromEntries(Object.keys(home).map((k) => [k, 0]));
    send({ ...base, [c]: 255 });
  };
  const profile = profileOf(rig, fixture);
  const pxName = profile?.pixelName ?? 'Pixel';
  const pixels = Math.max(4, ...Object.values(answers).map((a) => (a.kind === 'color' ? a.pixel : 0)));
  const answer = (a: LearnAnswer) => {
    setAnswers((prev) => ({ ...prev, [stepCh]: a }));
    setSaved('');
    if (stepCh < total) solo(stepCh + 1);
  };
  const learnedCount = Object.keys(answers).filter((k) => Number(k) <= total).length;
  const saveLearned = () => {
    const id = engine.saveProfile(learnedProfile({ name: fixture.name || profile?.name || 'Light', count: total, answers, base: profile }));
    engine.clearRaw();
    setStepCh(0);
    engine.updateFixture(fixture.id, { profileId: id, modeId: 'learned' });
    setSaved(`Saved. ${fixture.name || 'This light'} now uses the learned layout (${total} channels). Run the rig check to confirm it.`);
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
        that keeps the light in DMX mode. <strong>Step through</strong> lights one channel at a time,
        which is the quickest way to learn what an unknown light's channels do. While stepping, every other channel of the
        light is at 0 unless you tick <em>Keep dimmer/mode channels up</em>.
      </p>
      <div className="row wrap gap-2 mb-3">
        <button className="mini" onClick={() => solo(stepCh - 1)} disabled={stepCh <= 1} aria-label="Previous channel">◀</button>
        <button className="mini primary" onClick={() => solo(stepCh || 1)}>{stepCh ? `Channel ${stepCh} at full` : 'Step through channels'}</button>
        <button className="mini" onClick={() => solo(stepCh + 1)} disabled={stepCh >= total} aria-label="Next channel">▶</button>
        <button className="mini" onClick={() => { setStepCh(0); send(home); }}>Reset to home</button>
        <button className="mini" disabled={!active} onClick={() => { setStepCh(0); engine.clearRaw(); }}>Stop testing</button>
        <label className="check ml-2">
          <input type="checkbox" checked={engine.soloTester} onChange={(e) => engine.setSoloTester(e.target.checked)} />
          Other lights dark while testing
        </label>
        <label className="check ml-2" title="Off: stepping lights only one channel, everything else at 0 (best for learning a light). On: dimmer and mode channels stay at their home values while stepping.">
          <input type="checkbox" checked={holdHome} onChange={(e) => setHoldHome(e.target.checked)} />
          Keep dimmer/mode channels up while stepping
        </label>
      </div>
      {!active && <p className="muted mt-0">Not testing: the light is following the show. Move a slider or step through to take over.</p>}
      {saved && <p className="text-ok mt-0" role="status">{saved}</p>}
      {stepCh > 0 && (
        <div className="learn card mb-3">
          <div className="row wrap">
            <strong>Learn this light: what did channel {stepCh} do?{answers[stepCh] ? ` (answered: ${describeAnswer(answers[stepCh], pxName)})` : ''}</strong>
            <span className="muted">{learnedCount} of {total} answered</span>
            <div className="spacer" />
            <label className="check">
              Channels in the light's mode
              <input type="number" className="w-auto chan-val" min={1} max={MAX_RAW_CHANNELS} value={total} aria-label="Channels in the light's mode"
                onChange={(e) => setCount(Math.min(MAX_RAW_CHANNELS, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
          </div>
          <div className="row wrap gap-2 mt-2">
            <span className="muted minw-90">Where it lit:</span>
            <button className={`mini${where === 0 ? ' primary' : ''}`} aria-pressed={where === 0} onClick={() => setWhere(0)}>Whole light</button>
            {Array.from({ length: pixels }, (_, i) => (
              <button key={i} className={`mini${where === i + 1 ? ' primary' : ''}`} aria-pressed={where === i + 1} onClick={() => setWhere(i + 1)}>{pxName} {i + 1}</button>
            ))}
            <button className="mini" title="Add another pod/par" onClick={() => setWhere(pixels + 1)}>+</button>
          </div>
          <div className="row wrap gap-2 mt-2">
            <span className="muted minw-90">Color:</span>
            {(['red', 'green', 'blue', 'white', 'amber'] as const).map((c) => (
              <button key={c} className={`mini swatch-btn sw-${c}`} onClick={() => answer({ kind: 'color', color: c, pixel: where })}>{c[0].toUpperCase() + c.slice(1)}</button>
            ))}
            <span className="muted">or</span>
            <button className="mini" onClick={() => answer({ kind: 'nothing' })}>Nothing happened</button>
            <button className="mini" onClick={() => answer({ kind: 'strobe' })}>It flashed / strobed</button>
            <button className="mini" onClick={() => answer({ kind: 'mode' })}>It ran a program / changed mode</button>
          </div>
          {stepCh === total && answers[stepCh] && (
            <p className="text-ok mt-2 mb-0" role="status">
              That was the last channel. Save below, or raise <em>Channels in the light's mode</em> and press ▶ to keep going.
            </p>
          )}
          {learnedCount > 0 && (
            <div className="learn-list mt-2">
              {Object.entries(answers).filter(([k]) => Number(k) <= total).sort(([a], [b]) => Number(a) - Number(b)).map(([k, a]) => (
                <button key={k} className={`chip${Number(k) === stepCh ? ' on' : ''}`} title="Go back to this channel" onClick={() => solo(Number(k))}>
                  {k}: {describeAnswer(a, pxName)}
                </button>
              ))}
            </div>
          )}
          <div className="row wrap gap-2 mt-2">
            <button className="mini primary" disabled={!learnedCount} onClick={saveLearned}>Save as this light's type</button>
            <span className="muted">Pick where it lit first, then the color: the next channel comes up automatically. Unanswered channels are left unused.</span>
          </div>
        </div>
      )}
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
