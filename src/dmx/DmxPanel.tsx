import { useEffect, useState } from 'react';
import type { DmxOutput } from './output';
import { BLUE, GREEN, OFF, RED, WHITE, type DmxConfig } from './frame';

const MAX_PROBE = 16;

const FIELDS: { key: keyof DmxConfig; label: string; min: number; max: number }[] = [
  { key: 'address', label: 'Start address', min: 1, max: 512 },
  { key: 'red', label: 'Red channel', min: 1, max: 32 },
  { key: 'green', label: 'Green channel', min: 1, max: 32 },
  { key: 'blue', label: 'Blue channel', min: 1, max: 32 },
  { key: 'dimmer', label: 'Dimmer channel (0 = none)', min: 0, max: 32 },
];

export function DmxPanel({ dmx }: { dmx: DmxOutput }) {
  const [, force] = useState(0);
  const [ch, setCh] = useState(1);
  const [note, setNote] = useState('');
  useEffect(() => dmx.subscribe(() => force((n) => n + 1)), [dmx]);
  useEffect(() => () => dmx.stopProbe(), [dmx]); // never leave a probe running when leaving Live mode

  const lightChannel = (n: number) => { const c = Math.min(MAX_PROBE, Math.max(1, n)); setCh(c); setNote(''); dmx.probe({ [c]: 255 }); };
  const assign = (key: 'red' | 'green' | 'blue' | 'dimmer', label: string) => { dmx.setConfig({ [key]: ch }); setNote(`Channel ${ch} saved as ${label}.`); };

  const connected = dmx.status === 'connected';
  const pill = dmx.status === 'connected' ? 'ok' : dmx.status === 'error' ? 'err' : '';

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Stage light (DMX)</h2>
        <div className="spacer" />
        <span className={`pill ${pill}`}>
          {dmx.status === 'connected' ? 'Light connected' : dmx.status === 'connecting' ? 'Connecting…'
            : dmx.status === 'error' ? 'Light offline' : dmx.status === 'unsupported' ? 'Not supported' : 'Not connected'}
        </span>
      </div>
      <p className="muted" style={{ margin: '8px 0 12px' }}>
        The light turns red at each act's light-warning time and stays red through overtime. It is off the rest of the time.
      </p>

      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {connected
          ? <button onClick={() => void dmx.disconnect()}>Disconnect light</button>
          : <button className="primary" disabled={dmx.status === 'unsupported' || dmx.status === 'connecting'} onClick={() => void dmx.connect()}>Connect light</button>}
        {dmx.message && <span className="muted" role="status" style={{ color: dmx.status === 'error' ? 'var(--danger)' : undefined }}>{dmx.message}</span>}
      </div>

      <div className="grid g4" style={{ marginBottom: 12 }}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label>{f.label}</label>
            <input type="number" min={f.min} max={f.max} value={dmx.config[f.key]} aria-label={f.label}
              onChange={(e) => dmx.setConfig({ [f.key]: e.target.value === '' ? f.min : Number(e.target.value) })} />
          </div>
        ))}
      </div>

      <label>Test the light (each test lasts 4 seconds)</label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {([['Red', RED], ['Green', GREEN], ['Blue', BLUE], ['White', WHITE]] as const).map(([name, c]) => (
          <button key={name} className="mini" disabled={!connected} onClick={() => dmx.test(c)}>Test {name.toLowerCase()}</button>
        ))}
        <button className="mini" disabled={!connected} onClick={() => dmx.test(OFF)}>Light off</button>
      </div>
      <div style={{ marginTop: 16 }}>
        <label>Channel finder (use this if a test shows the wrong color or nothing)</label>
        <p className="muted" style={{ margin: '0 0 8px' }}>
          Lights one channel of the light at a time, from your start address. Step through and watch the light. When a
          channel makes red, press <em>This channel is Red</em>; do the same for green and blue.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {!dmx.probing
            ? <button className="mini primary" disabled={!connected} onClick={() => lightChannel(1)}>Start channel finder</button>
            : <>
                <button className="mini" disabled={ch <= 1} onClick={() => lightChannel(ch - 1)} aria-label="Previous channel">◀ Prev</button>
                <strong style={{ minWidth: 90, textAlign: 'center' }} role="status">Channel {ch}</strong>
                <button className="mini" disabled={ch >= MAX_PROBE} onClick={() => lightChannel(ch + 1)} aria-label="Next channel">Next ▶</button>
                <button className="mini" onClick={() => { dmx.stopProbe(); setNote(''); }}>Stop</button>
              </>}
          <button className="mini" disabled={!connected} title="Raises channels 1-16 together; some modes strobe or run programs"
            onClick={() => { setNote('All channels full. Some modes flash; press Stop if that bothers you.'); dmx.probe(Object.fromEntries(Array.from({ length: MAX_PROBE }, (_, i) => [i + 1, 255]))); }}>
            All channels full</button>
        </div>
        {dmx.probing && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <span className="muted">This channel is:</span>
            <button className="mini" onClick={() => assign('red', 'Red')}>Red</button>
            <button className="mini" onClick={() => assign('green', 'Green')}>Green</button>
            <button className="mini" onClick={() => assign('blue', 'Blue')}>Blue</button>
            <button className="mini" onClick={() => assign('dimmer', 'the dimmer')}>Dimmer</button>
          </div>
        )}
        {note && <div className="muted" style={{ marginTop: 6 }} role="status">{note}</div>}
        <p className="muted" style={{ margin: '8px 0 0' }}>
          If no channel ever shows red or green, check the light itself: press <kbd>MODE</kbd> on the light to a built-in
          static color and see whether its red and green LEDs work. Press <kbd>SETUP</kbd> to see the channel mode
          (like <kbd>Ch.04</kbd>).
        </p>
      </div>
      <p className="muted" style={{ margin: '10px 0 0' }}>
        The number on the light's display (like <kbd>d001</kbd>) is the start address. Channel numbers count from 1 at that
        address. Press Test red, green and blue; if a color is wrong, change the channel numbers. If a test shows nothing, the
        light's mode may have a dimmer channel that needs to be set.
      </p>
    </div>
  );
}
