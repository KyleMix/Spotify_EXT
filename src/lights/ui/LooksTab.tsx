import { useState } from 'react';
import type { LightEngine } from '../engine';
import { clampLayer, momentsUsing, type Look } from '../looks';
import { useEngine } from './useEngine';
import { KeyBinder, LayerEditor, LayerPreview } from './controls';

/** Build and edit looks. Edits save as you go; the look being edited is fired so you can see it on the rig. */
export function LooksTab({ engine }: { engine: LightEngine }) {
  useEngine(engine);
  const { looks } = engine.looksState;
  const [selId, setSelId] = useState<string | null>(looks[0]?.id ?? null);
  const [note, setNote] = useState('');
  const look = looks.find((l) => l.id === selId) ?? looks[0];

  const update = (patch: Partial<Look>) => { if (look) engine.saveLook({ ...look, ...patch }); };
  const select = (id: string) => { setSelId(id); setNote(''); };
  const add = (from?: Look) => {
    const id = engine.saveLook(from
      ? { ...from, id: undefined, name: `${from.name} copy`, key: undefined }
      : { name: 'New look', fadeMs: 500, all: clampLayer({ effect: 'solid', colors: [{ r: 255, g: 255, b: 255 }] }), perFixture: {} });
    select(id);
  };
  const remove = () => {
    if (!look) return;
    const used = momentsUsing(engine.looksState, look.id);
    if (!engine.deleteLook(look.id)) { setNote(`"${look.name}" is used for ${used.map((m) => m.label).join(', ')}. Pick another look for that in the Show tab first.`); return; }
    setSelId(engine.looksState.looks[0]?.id ?? null);
  };

  return (
    <div className="looks-layout">
      <div className="card looks-list">
        {looks.map((l, i) => (
          <div key={l.id} className={`looks-item${look?.id === l.id ? ' on' : ''}`}>
            <button className="ghost looks-pick" aria-pressed={look?.id === l.id} onClick={() => select(l.id)}>
              <LayerPreview layer={l.all} /> <span>{l.name}</span>
            </button>
            <button className="mini ghost" disabled={i === 0} aria-label={`Move ${l.name} up`} onClick={() => engine.moveLook(l.id, -1)}>↑</button>
            <button className="mini ghost" disabled={i === looks.length - 1} aria-label={`Move ${l.name} down`} onClick={() => engine.moveLook(l.id, 1)}>↓</button>
          </div>
        ))}
        <div className="row wrap gap-2 mt-2">
          <button className="mini primary" onClick={() => add()}>+ New look</button>
          {look && <button className="mini" onClick={() => add(look)}>Duplicate</button>}
        </div>
      </div>

      {look ? (
        <div className="card">
          <div className="row wrap">
            <h2 className="m-0">{look.name}</h2>
            <div className="spacer" />
            {engine.manualLookId === look.id
              ? <button className="mini" onClick={() => engine.releaseLook()}>Stop preview</button>
              : <button className="mini primary" onClick={() => engine.fireLook(look.id)}>Preview on the rig</button>}
            <button className="mini danger" onClick={remove}>Delete</button>
          </div>
          {note && <p className="text-danger mt-2 mb-0" role="alert">{note}</p>}
          <div className="grid g3 mt-3">
            <div>
              <label>Name</label>
              <input value={look.name} aria-label="Look name" onChange={(e) => update({ name: e.target.value })} />
            </div>
            <div>
              <label>Fade in (seconds)</label>
              <input type="number" min={0} max={20} step={0.1} value={look.fadeMs / 1000} aria-label="Fade in seconds"
                onChange={(e) => update({ fadeMs: Math.round(Number(e.target.value) * 1000) })} />
            </div>
            <div>
              <label>Key</label>
              <KeyBinder value={look.key} label={look.name} onChange={(key) => update({ key })} />
            </div>
          </div>

          <h3 className="mt-4 mb-2">All lights</h3>
          <LayerEditor layer={look.all} label="All lights" onChange={(all) => update({ all })} />

          {engine.rig.fixtures.length > 1 && (
            <>
              <h3 className="mt-4 mb-2">Per light</h3>
              <p className="muted mt-0">Give a light its own setting in this look, e.g. one bar red while the other stays white.</p>
              {engine.rig.fixtures.map((f, i) => {
                const own = look.perFixture[f.id];
                const name = f.name || `Light ${i + 1}`;
                return (
                  <div key={f.id} className="per-fixture">
                    <label className="check">
                      <input type="checkbox" checked={!!own}
                        onChange={(e) => {
                          const perFixture = { ...look.perFixture };
                          if (e.target.checked) perFixture[f.id] = { ...look.all, colors: [...look.all.colors] }; else delete perFixture[f.id];
                          update({ perFixture });
                        }} />
                      {name}: {own ? 'its own setting' : 'same as all lights'}
                    </label>
                    {own && <LayerEditor layer={own} label={name} onChange={(l) => update({ perFixture: { ...look.perFixture, [f.id]: l } })} />}
                  </div>
                );
              })}
            </>
          )}
          <p className="muted mt-3 mb-0">
            Changes save as you make them. While this look is previewed it holds the rig; press <em>Stop preview</em> (or
            <em> Back to show</em> on the Console) to hand the lights back.
          </p>
        </div>
      ) : (
        <div className="card muted">No looks. Press <em>New look</em>.</div>
      )}
    </div>
  );
}
