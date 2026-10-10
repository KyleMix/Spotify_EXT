import { useState } from 'react';
import type { LightEngine } from '../engine';
import { DRIVERS, type DriverId } from '../drivers';
import { BLUE, GREEN, OFF, RED, WHITE } from '../color';
import { useEngine } from './useEngine';
import { RigTab } from './RigTab';
import { ToolsTab } from './ToolsTab';
import { ShowTab } from './ShowTab';
import { ConsoleTab } from './ConsoleTab';
import { LooksTab } from './LooksTab';

type Tab = 'console' | 'looks' | 'show' | 'rig' | 'tools';
const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'console', label: 'Console', title: 'Fire looks by hand, master dimmer, back to show' },
  { id: 'looks', label: 'Looks', title: 'Build and edit looks: colors, effects, fades, keys' },
  { id: 'show', label: 'Show', title: 'Which look each moment of the show fires, and the microphone' },
  { id: 'rig', label: 'Rig', title: 'Which lights are on the chain, their modes and addresses' },
  { id: 'tools', label: 'Tools', title: 'Universe monitor, channel tester and rig check' },
];

/** Connection status, cable type, connect and blackout: always visible at the top of the Lights screen. */
export function ConnectionBar({ engine }: { engine: LightEngine }) {
  useEngine(engine);
  const connected = engine.status === 'connected';
  const pill = connected ? 'ok' : engine.status === 'error' ? 'err' : '';
  const label = connected ? 'Lights connected' : engine.status === 'connecting' ? 'Connecting…'
    : engine.status === 'error' ? 'Lights offline' : engine.status === 'unsupported' ? 'Not supported' : 'Not connected';
  return (
    <div className="card mb-3">
      <div className="row wrap">
        <span className={`pill ${pill}`} role="status">{label}</span>
        {connected && (
          <span className={`muted${engine.fps > 0 && engine.fps < 20 ? ' text-danger' : ''}`}
            title="Frames sent to the cable per second. Below 20 the lights may flicker.">
            {engine.fps ? `${engine.fps} fps` : 'measuring…'}{engine.thread ? ` · sent from ${engine.thread === 'worker' ? 'background worker' : 'page'}` : ''}
          </span>
        )}
        <div className="spacer" />
        <select value={engine.driver} disabled={connected || engine.status === 'connecting'} aria-label="USB-DMX cable type"
          title={DRIVERS.find((d) => d.id === engine.driver)?.hint}
          onChange={(e) => engine.setDriver(e.target.value as DriverId)} className="w-auto">
          {DRIVERS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        {connected || engine.status === 'connecting'
          ? <button onClick={() => void engine.disconnect()}>Disconnect</button>
          : <button className="primary" disabled={engine.status === 'unsupported'} onClick={() => void engine.connect()}>Connect lights</button>}
        <button className={engine.blackout ? 'danger' : ''} aria-pressed={engine.blackout}
          title="All lights dark until pressed again" onClick={() => engine.setBlackout(!engine.blackout)}>
          {engine.blackout ? '● Blackout on' : 'Blackout'}
        </button>
      </div>
      {engine.message && <p className={`mb-0 mt-2 ${engine.status === 'error' ? 'text-danger' : 'muted'}`}>{engine.message}</p>}
      <div className="row wrap gap-2 mt-2">
        <span className="muted">Test every light (4 s):</span>
        {([['Red', RED], ['Green', GREEN], ['Blue', BLUE], ['White', WHITE]] as const).map(([name, c]) => (
          <button key={name} className="mini" disabled={!connected} onClick={() => engine.test(c)}>{name}</button>
        ))}
        <button className="mini" disabled={!connected} onClick={() => engine.test(OFF)}>Off</button>
        <div className="spacer" />
        <label className="check" title="Sends frames from a background thread so a busy page can't stall them. Turn off if the lights stay dark.">
          <input type="checkbox" checked={engine.useWorker} disabled={connected || engine.status === 'connecting'}
            onChange={(e) => engine.setUseWorker(e.target.checked)} />
          <span className="muted">Background sending (experimental)</span>
        </label>
      </div>
    </div>
  );
}

export function LightsScreen({ engine }: { engine: LightEngine }) {
  const [tab, setTab] = useState<Tab>(() => {
    const fallback: Tab = engine.rig.fixtures.length ? 'console' : 'rig';
    try {
      const t = sessionStorage.getItem('walkup.lights.tab') as Tab | null;
      return t && TABS.some((x) => x.id === t) ? t : fallback;
    } catch { return fallback; }
  });
  const [testId, setTestId] = useState<string | null>(null);
  const go = (t: Tab) => { setTab(t); try { sessionStorage.setItem('walkup.lights.tab', t); } catch { /* ignore */ } };

  return (
    <div className="lights">
      <ConnectionBar engine={engine} />
      <div className="seg mb-3" role="tablist" aria-label="Lights">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} title={t.title} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'console' && <ConsoleTab engine={engine} />}
      {tab === 'looks' && <LooksTab engine={engine} />}
      {tab === 'rig' && <RigTab engine={engine} onTest={(id) => { setTestId(id); go('tools'); }} />}
      {tab === 'tools' && <ToolsTab engine={engine} initialFixture={testId} />}
      {tab === 'show' && <ShowTab engine={engine} />}
    </div>
  );
}
