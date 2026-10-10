import type { LightEngine } from '../engine';
import { cssColor } from '../color';
import { MOMENTS } from '../looks';
import { keyLabel } from '../../features/clicker';
import { useEngine, useTicker } from './useEngine';
import { KeyBinder, LayerPreview } from './controls';

/** Live view of what every pod/par shows right now. */
function RigPreview({ engine }: { engine: LightEngine }) {
  useTicker(80);
  if (!engine.rig.fixtures.length) return null;
  return (
    <div className="rig-preview" aria-label="What the lights show now">
      {engine.rig.fixtures.map((f, i) => (
        <div key={f.id} className="rig-preview-fixture">
          <span className="muted">{f.name || `Light ${i + 1}`}</span>
          <span className="rig-preview-pixels">
            {(engine.output[f.id] ?? []).map((c, p) => (
              <i key={p} style={{ background: cssColor({ r: c.r * engine.master, g: c.g * engine.master, b: c.b * engine.master }) }} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Fire looks by hand during a show, with master dimmer and "back to show". */
export function ConsoleTab({ engine }: { engine: LightEngine }) {
  useEngine(engine);
  const { looks, cues, releaseKey } = engine.looksState;
  const active = engine.activeLookId;
  const momentLabel = engine.moment ? MOMENTS.find((m) => m.id === engine.moment)?.label : null;
  const showLook = engine.moment ? looks.find((l) => l.id === cues[engine.moment!]) : undefined;

  return (
    <>
      <div className="card mb-3">
        <div className="row wrap">
          <div>
            <strong>
              {engine.manualLookId
                ? `Holding "${looks.find((l) => l.id === engine.manualLookId)?.name}" (fired by hand)`
                : momentLabel ? `Following the show: ${momentLabel} → ${showLook?.name ?? 'dark'}` : 'Live mode is closed: lights are dark until you fire a look'}
            </strong>
            {engine.manualLookId && momentLabel && <div className="muted">The show is at {momentLabel}; it takes over again when you go back to the show.</div>}
          </div>
          <div className="spacer" />
          <button className="primary" disabled={!engine.manualLookId} onClick={() => engine.releaseLook()}>
            ↩ Back to show{releaseKey ? ` (${keyLabel(releaseKey)})` : ''}
          </button>
        </div>
        <div className="grid g2 mt-3">
          <div>
            <label>Master dimmer ({Math.round(engine.master * 100)}%)</label>
            <input type="range" min={0} max={100} value={Math.round(engine.master * 100)} aria-label="Master dimmer"
              onChange={(e) => engine.setMaster(Number(e.target.value) / 100)} />
          </div>
          <div>
            <label>Key for "Back to show"</label>
            <KeyBinder value={releaseKey} label="Back to show" onChange={(k) => engine.setReleaseKey(k)} />
          </div>
        </div>
        <div className="mt-3"><RigPreview engine={engine} /></div>
      </div>

      <div className="look-grid">
        {looks.map((l) => (
          <button key={l.id} className={`look-btn${active === l.id ? ' on' : ''}`} aria-pressed={active === l.id}
            onClick={() => (engine.manualLookId === l.id ? engine.releaseLook() : engine.fireLook(l.id))}
            title={engine.manualLookId === l.id ? 'Click again to go back to the show' : 'Fire this look'}>
            <LayerPreview layer={l.all} />
            <span className="look-name">{l.name}</span>
            <span className="look-meta">
              {l.key && <kbd>{keyLabel(l.key)}</kbd>}
              {MOMENTS.filter((m) => cues[m.id] === l.id).map((m) => <span key={m.id} className="chip">{m.label}</span>)}
            </span>
          </button>
        ))}
      </div>
      <p className="muted mt-3">
        Click a look to fire it; it holds until you click it again, fire another, or press <em>Back to show</em>. Looks with a key
        fire from anywhere in the app (a Stream Deck <em>Hotkey</em> on F13–F24 works well); the browser tab must be in front.
      </p>
    </>
  );
}
