import { useState } from 'react';
import type { LightEngine } from '../engine';
import { DRIVERS, type DriverId } from '../drivers';
import { useEngine } from './useEngine';
import { RigTab } from './RigTab';
import { ToolsTab } from './ToolsTab';
import { ShowTab } from './ShowTab';

type Tab = 'rig' | 'tools' | 'show';
const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'rig', label: 'Rig', title: 'Which lights are on the chain, their modes and addresses' },
  { id: 'tools', label: 'Tools', title: 'Universe monitor, channel tester and rig check' },
  { id: 'show', label: 'Show', title: 'How the lights follow the show and the microphone' },
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
    </div>
  );
}

export function LightsScreen({ engine }: { engine: LightEngine }) {
  const [tab, setTab] = useState<Tab>(() => { try { return (sessionStorage.getItem('walkup.lights.tab') as Tab) || 'rig'; } catch { return 'rig'; } });
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
      {tab === 'rig' && <RigTab engine={engine} onTest={(id) => { setTestId(id); go('tools'); }} />}
      {tab === 'tools' && <ToolsTab engine={engine} initialFixture={testId} />}
      {tab === 'show' && <ShowTab engine={engine} />}
    </div>
  );
}
