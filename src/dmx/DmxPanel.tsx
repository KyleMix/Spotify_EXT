import { useEffect, useState } from 'react';
import type { DmxOutput } from './output';
import { BLUE, GREEN, OFF, RED, WHITE, type DmxConfig } from './frame';

const FIELDS: { key: keyof DmxConfig; label: string; min: number; max: number }[] = [
  { key: 'address', label: 'Start address', min: 1, max: 512 },
  { key: 'red', label: 'Red channel', min: 1, max: 32 },
  { key: 'green', label: 'Green channel', min: 1, max: 32 },
  { key: 'blue', label: 'Blue channel', min: 1, max: 32 },
  { key: 'dimmer', label: 'Dimmer channel (0 = none)', min: 0, max: 32 },
];

export function DmxPanel({ dmx }: { dmx: DmxOutput }) {
  const [, force] = useState(0);
  useEffect(() => dmx.subscribe(() => force((n) => n + 1)), [dmx]);

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
      <p className="muted" style={{ margin: '10px 0 0' }}>
        The number on the light's display (like <kbd>d001</kbd>) is the start address. Channel numbers count from 1 at that
        address. Press Test red, green and blue; if a color is wrong, change the channel numbers. If a test shows nothing, the
        light's mode may have a dimmer channel that needs to be set.
      </p>
    </div>
  );
}
