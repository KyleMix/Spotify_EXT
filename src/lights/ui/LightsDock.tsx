import { useState } from 'react';
import type { LightEngine } from '../engine';
import { MOMENTS } from '../looks';
import { keyLabel } from '../../features/clicker';
import { useEngine } from './useEngine';
import { RigPreview } from './ConsoleTab';

const HIDE_KEY = 'walkup.lights.dockHidden';

/**
 * The lights on Live mode's Stage screen: what they're doing, a live preview, one-tap looks, back to show,
 * blackout and the master dimmer, so the whole show runs from one screen.
 */
export function LightsDock({ engine, onOpenLights }: { engine: LightEngine; onOpenLights: () => void }) {
  useEngine(engine);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } });
  const toggle = () => { setHidden(!hidden); try { localStorage.setItem(HIDE_KEY, hidden ? '0' : '1'); } catch { /* ignore */ } };
  if (!engine.rig.fixtures.length) return null;

  const { looks, cues } = engine.looksState;
  const active = engine.activeLookId;
  const moment = engine.moment ? MOMENTS.find((m) => m.id === engine.moment) : undefined;
  const lookName = (id: string | null | undefined) => looks.find((l) => l.id === id)?.name ?? 'dark';
  const connected = engine.status === 'connected';
  const now = engine.blackout ? 'Blackout'
    : engine.manualLookId ? `Holding ${lookName(engine.manualLookId)}`
      : moment ? `${moment.label} → ${lookName(cues[moment.id])}` : 'Dark';

  return (
    <div className="card dock" aria-label="Lights">
      <div className="row wrap">
        <strong>Lights</strong>
        <span className={`pill ${connected ? 'ok' : engine.status === 'error' ? 'err' : ''}`}>{connected ? 'connected' : engine.status === 'error' ? 'offline' : 'not connected'}</span>
        <span className="dock-now">{now}</span>
        <div className="spacer" />
        {engine.manualLookId && (
          <button className="mini primary" onClick={() => engine.releaseLook()}>
            ↩ Back to show{engine.looksState.releaseKey ? ` (${keyLabel(engine.looksState.releaseKey)})` : ''}
          </button>
        )}
        <button className={`mini${engine.blackout ? ' danger' : ''}`} aria-pressed={engine.blackout} onClick={() => engine.setBlackout(!engine.blackout)}>
          {engine.blackout ? '● Blackout on' : 'Blackout'}{engine.looksState.blackoutKey ? ` (${keyLabel(engine.looksState.blackoutKey)})` : ''}
        </button>
        <button className="mini ghost" onClick={onOpenLights}>Lights screen</button>
        <button className="mini ghost" aria-expanded={!hidden} onClick={toggle}>{hidden ? 'Show' : 'Hide'}</button>
      </div>
      {!hidden && (
        <>
          <div className="row wrap mt-2 dock-body">
            <RigPreview engine={engine} />
            <div className="dock-master">
              <label>Master {Math.round(engine.master * 100)}%</label>
              <input type="range" min={0} max={100} value={Math.round(engine.master * 100)} aria-label="Master dimmer"
                onChange={(e) => engine.setMaster(Number(e.target.value) / 100)} />
            </div>
          </div>
          <div className="dock-looks mt-2">
            {looks.map((l) => (
              <button key={l.id} className={`mini${active === l.id ? ' on' : ''}`} aria-pressed={active === l.id}
                title={engine.manualLookId === l.id ? 'Click again to go back to the show' : 'Fire this look (holds until Back to show)'}
                onClick={() => (engine.manualLookId === l.id ? engine.releaseLook() : engine.fireLook(l.id))}>
                {l.name}{l.key ? ` · ${keyLabel(l.key)}` : ''}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
