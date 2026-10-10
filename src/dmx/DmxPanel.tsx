import { useEffect, useState } from 'react';
import type { DmxOutput } from './output';
import { BLUE, FIXTURE_PRESETS, GREEN, MAX_FIXTURES, OFF, RED, WHITE, footprint, overlaps, type DmxFixture } from './frame';

const MAX_PROBE = 16;

const FIELDS: { key: Exclude<keyof DmxFixture, 'name'>; label: string; min: number; max: number }[] = [
  { key: 'address', label: 'Start address', min: 1, max: 512 },
  { key: 'red', label: 'Red channel', min: 1, max: 32 },
  { key: 'green', label: 'Green channel', min: 1, max: 32 },
  { key: 'blue', label: 'Blue channel', min: 1, max: 32 },
  { key: 'dimmer', label: 'Dimmer channel (0 = none)', min: 0, max: 32 },
  { key: 'channels', label: 'Channels in mode', min: 1, max: 32 },
];

const pad3 = (n: number) => String(n).padStart(3, '0');
const nameOf = (f: DmxFixture, i: number) => f.name.trim() || `Light ${i + 1}`;

export function DmxPanel({ dmx }: { dmx: DmxOutput }) {
  const [, force] = useState(0);
  const [ch, setCh] = useState(1);
  const [note, setNote] = useState('');
  const [preset, setPreset] = useState(FIXTURE_PRESETS[0].id);
  const [addedHint, setAddedHint] = useState('');
  useEffect(() => dmx.subscribe(() => force((n) => n + 1)), [dmx]);
  useEffect(() => () => dmx.stopProbe(), [dmx]); // never leave a probe running when leaving Live mode

  const { fixtures, warnPulseSec } = dmx.config;
  const finderOn = dmx.probing ? dmx.probeFixture : -1;
  const clash = overlaps(fixtures);

  const lightChannel = (fixture: number, n: number) => {
    const c = Math.min(MAX_PROBE, Math.max(1, n)); setCh(c); setNote(''); dmx.probe({ [c]: 255 }, fixture);
  };
  const assign = (key: 'red' | 'green' | 'blue' | 'dimmer', label: string) => {
    dmx.updateFixture(finderOn, { [key]: ch });
    setNote(`Channel ${ch} saved as ${label} for ${fixtures[finderOn] ? nameOf(fixtures[finderOn], finderOn) : 'this light'}.`);
  };
  const addLight = () => {
    const p = FIXTURE_PRESETS.find((x) => x.id === preset) ?? FIXTURE_PRESETS[0];
    dmx.addFixture(p.fixture);
    const added = dmx.config.fixtures[dmx.config.fixtures.length - 1];
    setAddedHint(`${p.hint} Address: d${pad3(added.address)}.`);
  };

  const connected = dmx.status === 'connected';
  const pill = dmx.status === 'connected' ? 'ok' : dmx.status === 'error' ? 'err' : '';
  const lights = fixtures.length === 1 ? 'the light' : 'every light';

  return (
    <div className="card">
      <div className="row">
        <h2 className="m-0">Stage light (DMX)</h2>
        <div className="spacer" />
        <span className={`pill ${pill}`}>
          {dmx.status === 'connected' ? 'Light connected' : dmx.status === 'connecting' ? 'Connecting…'
            : dmx.status === 'error' ? 'Light offline' : dmx.status === 'unsupported' ? 'Not supported' : 'Not connected'}
        </span>
      </div>
      <p className="muted mt-2-mb-3">
        {warnPulseSec > 0
          ? `At each act's light-warning time ${lights} flashes red for ${warnPulseSec} seconds, then goes off. When time is up it turns red and stays on until the next act.`
          : `At each act's light-warning time ${lights} turns red and stays on through overtime until the next act.`}
        {' '}It is off the rest of the time.
      </p>

      <div className="row wrap mb-3">
        {connected
          ? <button onClick={() => void dmx.disconnect()}>Disconnect light</button>
          : <button className="primary" disabled={dmx.status === 'unsupported' || dmx.status === 'connecting'} onClick={() => void dmx.connect()}>Connect light</button>}
        {dmx.message && <span className={`muted${dmx.status === 'error' ? ' text-danger' : ''}`} role="status">{dmx.message}</span>}
      </div>

      <div className="grid g4 mb-3">
        <div>
          <label>Warning flash (sec, 0 = stay on)</label>
          <input type="number" min={0} max={30} value={warnPulseSec} aria-label="Warning flash (sec, 0 = stay on)"
            onChange={(e) => dmx.setConfig({ warnPulseSec: e.target.value === '' ? 0 : Number(e.target.value) })} />
        </div>
      </div>

      <label>Lights on the chain ({fixtures.length})</label>
      <p className="muted mb-2 mt-0">
        Daisy-chain lights with DMX cables: the cable from the PC goes into the first light's <kbd>DMX IN</kbd>, its
        <kbd>DMX OUT</kbd> goes into the next light's <kbd>DMX IN</kbd>, and so on. Give each light its own start address
        so their channels don't overlap.
      </p>
      {fixtures.map((f, i) => (
        <div key={i} className="card mb-3">
          <div className="row wrap gap-2">
            <input className="minw-170" value={f.name} placeholder={`Light ${i + 1}`} aria-label={`Light ${i + 1} name`}
              onChange={(e) => dmx.updateFixture(i, { name: e.target.value })} />
            <span className="muted">d{pad3(f.address)}–d{pad3(f.address + footprint(f) - 1)}</span>
            <div className="spacer" />
            <button className="mini" disabled={!connected} onClick={() => lightChannel(i, 1)}>Find channels</button>
            <button className="mini" disabled={fixtures.length <= 1} onClick={() => dmx.removeFixture(i)}
              aria-label={`Remove ${nameOf(f, i)}`}>Remove</button>
          </div>
          <div className="grid g4 mt-2">
            {FIELDS.map((fd) => (
              <div key={fd.key}>
                <label>{fd.label}</label>
                <input type="number" min={fd.min} max={fd.max} value={f[fd.key]} aria-label={`${nameOf(f, i)}: ${fd.label}`}
                  onChange={(e) => dmx.updateFixture(i, { [fd.key]: e.target.value === '' ? fd.min : Number(e.target.value) })} />
              </div>
            ))}
          </div>
          {finderOn === i && (
            <div className="mt-2">
              <div className="row wrap gap-2">
                <button className="mini" disabled={ch <= 1} onClick={() => lightChannel(i, ch - 1)} aria-label="Previous channel">◀ Prev</button>
                <strong className="minw-90" role="status">Channel {ch}</strong>
                <button className="mini" disabled={ch >= MAX_PROBE} onClick={() => lightChannel(i, ch + 1)} aria-label="Next channel">Next ▶</button>
                <button className="mini" onClick={() => { dmx.stopProbe(); setNote(''); }}>Stop</button>
                <button className="mini" title="Raises channels 1-16 together; some modes strobe or run programs"
                  onClick={() => { setNote('All channels full. Some modes flash; press Stop if that bothers you.'); dmx.probe(Object.fromEntries(Array.from({ length: MAX_PROBE }, (_, k) => [k + 1, 255])), i); }}>
                  All channels full</button>
              </div>
              <div className="row wrap gap-2 mt-2">
                <span className="muted">This channel is:</span>
                <button className="mini" onClick={() => assign('red', 'Red')}>Red</button>
                <button className="mini" onClick={() => assign('green', 'Green')}>Green</button>
                <button className="mini" onClick={() => assign('blue', 'Blue')}>Blue</button>
                <button className="mini" onClick={() => assign('dimmer', 'the dimmer')}>Dimmer</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {clash.length > 0 && (
        <p className="text-danger mt-0" role="alert">
          {clash.map(([a, b]) => `${nameOf(fixtures[a], a)} and ${nameOf(fixtures[b], b)} share channels.`).join(' ')}
          {' '}Change one light's start address (on the light and here) so the ranges don't overlap.
        </p>
      )}
      {note && <div className="muted mb-2" role="status">{note}</div>}

      <div className="row wrap gap-2 mb-3">
        <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Type of light to add">
          {FIXTURE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button className="mini" disabled={fixtures.length >= MAX_FIXTURES} onClick={addLight}>Add light to chain</button>
      </div>
      {addedHint && <p className="muted mt-0" role="status">{addedHint}</p>}

      <label>Test the lights (each test lasts 4 seconds)</label>
      <div className="row wrap gap-2">
        {([['Red', RED], ['Green', GREEN], ['Blue', BLUE], ['White', WHITE]] as const).map(([name, c]) => (
          <button key={name} className="mini" disabled={!connected} onClick={() => dmx.test(c)}>Test {name.toLowerCase()}</button>
        ))}
        <button className="mini" disabled={!connected} onClick={() => dmx.test(OFF)}>Light off</button>
      </div>
      <p className="muted mt-3 mb-0">
        The number on a light's display (like <kbd>d001</kbd>) is its start address. Channel numbers count from 1 at that
        address. Press Test red, green and blue; if a light shows the wrong color or nothing, press its <em>Find channels</em>:
        it lights one channel of that light at a time, and you press <em>This channel is Red</em> (and green, blue) as you
        see them. If no channel ever shows a color, press <kbd>MODE</kbd> on the light to a built-in static color to check its
        LEDs, and press <kbd>SETUP</kbd> (or <kbd>MENU</kbd>) to see its channel mode.
      </p>
    </div>
  );
}
