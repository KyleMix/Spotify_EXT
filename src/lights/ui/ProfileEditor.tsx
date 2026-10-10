import { useState } from 'react';
import type { LightEngine } from '../engine';
import { channelLabel, isColor, type ChannelDef, type ChannelType, type FixtureProfile, type ProfileMode } from '../profiles';

const TYPES: { id: ChannelType; label: string }[] = [
  { id: 'red', label: 'Red' }, { id: 'green', label: 'Green' }, { id: 'blue', label: 'Blue' },
  { id: 'white', label: 'White' }, { id: 'amber', label: 'Amber' }, { id: 'intensity', label: 'Dimmer' },
  { id: 'strobe', label: 'Strobe' }, { id: 'control', label: 'Mode / control (hold a value)' }, { id: 'other', label: 'Other / unused' },
];

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Describe a light type channel by channel. Saved types appear in the Rig tab's light type list. */
export function ProfileEditor({ engine, initial, onDone }: {
  engine: LightEngine; initial: Partial<FixtureProfile>; onDone: () => void;
}) {
  const [draft, setDraft] = useState<Partial<FixtureProfile>>(() => clone(initial));
  const [modeIdx, setModeIdx] = useState(0);
  const modes = draft.modes ?? [];
  const mode: ProfileMode | undefined = modes[modeIdx];

  const setMode = (patch: Partial<ProfileMode>) =>
    setDraft((d) => ({ ...d, modes: (d.modes ?? []).map((m, i) => (i === modeIdx ? { ...m, ...patch } : m)) }));
  const setChannel = (ci: number, patch: Partial<ChannelDef>) =>
    setMode({ channels: mode!.channels.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });

  const addMode = () => {
    setDraft((d) => ({ ...d, modes: [...(d.modes ?? []), { id: `mode${Date.now().toString(36)}`, name: `Mode ${(d.modes?.length ?? 0) + 1}`, channels: [{ type: 'red', home: 0 }, { type: 'green', home: 0 }, { type: 'blue', home: 0 }] }] }));
    setModeIdx(modes.length);
  };
  const removeMode = () => {
    setDraft((d) => ({ ...d, modes: (d.modes ?? []).filter((_, i) => i !== modeIdx) }));
    setModeIdx(0);
  };
  const save = () => { engine.saveProfile(draft as FixtureProfile); onDone(); };

  return (
    <div className="card">
      <h2 className="m-0">{draft.id ? 'Edit light type' : 'New light type'}</h2>
      <div className="grid g3 mt-3">
        <div>
          <label>Name</label>
          <input value={draft.name ?? ''} aria-label="Light type name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <label>Its pixels are called</label>
          <input value={draft.pixelName ?? ''} placeholder="Pixel (e.g. Pod, Par, Head)" aria-label="Pixel name"
            onChange={(e) => setDraft({ ...draft, pixelName: e.target.value })} />
        </div>
        <div>
          <label>Address is set with</label>
          <select value={draft.addressing ?? 'display'} aria-label="Address is set with"
            onChange={(e) => setDraft({ ...draft, addressing: e.target.value as FixtureProfile['addressing'] })}>
            <option value="display">A display (d001)</option>
            <option value="dip">DIP switches</option>
          </select>
        </div>
      </div>

      <div className="row wrap mt-3">
        <label className="m-0">DMX modes</label>
        {modes.map((m, i) => (
          <button key={m.id} className={`mini${i === modeIdx ? ' primary' : ''}`} onClick={() => setModeIdx(i)}>{m.name || `Mode ${i + 1}`}</button>
        ))}
        <button className="mini" disabled={modes.length >= 8} onClick={addMode}>+ Mode</button>
      </div>

      {mode && (
        <>
          <div className="grid g2 mt-2">
            <div>
              <label>Mode name</label>
              <input value={mode.name} aria-label="Mode name" onChange={(e) => setMode({ name: e.target.value })} />
            </div>
            <div>
              <label>What to set on the light (optional)</label>
              <input value={mode.note ?? ''} placeholder="e.g. Set the DIP mode switches to 12-CH" aria-label="Mode note"
                onChange={(e) => setMode({ note: e.target.value })} />
            </div>
          </div>
          <table className="chan-table mt-3">
            <thead><tr><th>Ch</th><th>Does</th><th>Pixel</th><th>Home value</th><th>Label (optional)</th><th /></tr></thead>
            <tbody>
              {mode.channels.map((c, ci) => (
                <tr key={ci}>
                  <td>{ci + 1}</td>
                  <td>
                    <select value={c.type} aria-label={`Channel ${ci + 1} type`}
                      onChange={(e) => {
                        const type = e.target.value as ChannelType;
                        setChannel(ci, { type, pixel: isColor(type) ? c.pixel : undefined, home: type === 'intensity' ? 255 : isColor(type) ? 0 : c.home });
                      }}>
                      {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </td>
                  <td>
                    {isColor(c.type)
                      ? <input type="number" min={0} max={32} value={c.pixel ?? 0} title="0 = whole light" aria-label={`Channel ${ci + 1} pixel`}
                          onChange={(e) => setChannel(ci, { pixel: Number(e.target.value) >= 1 ? Number(e.target.value) : undefined })} />
                      : <span className="muted">–</span>}
                  </td>
                  <td>
                    <input type="number" min={0} max={255} value={c.home} aria-label={`Channel ${ci + 1} home value`}
                      onChange={(e) => setChannel(ci, { home: Math.min(255, Math.max(0, Number(e.target.value) || 0)) })} />
                  </td>
                  <td>
                    <input value={c.label ?? ''} placeholder={channelLabel({ ...c, label: undefined }, mode, draft.pixelName || 'Pixel')} aria-label={`Channel ${ci + 1} label`}
                      onChange={(e) => setChannel(ci, { label: e.target.value || undefined })} />
                  </td>
                  <td>
                    <button className="mini" aria-label={`Remove channel ${ci + 1}`} disabled={mode.channels.length <= 1}
                      onClick={() => setMode({ channels: mode.channels.filter((_, i) => i !== ci) })}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row wrap mt-2">
            <button className="mini" disabled={mode.channels.length >= 64}
              onClick={() => setMode({ channels: [...mode.channels, { type: 'other', home: 0 }] })}>+ Channel</button>
            <div className="spacer" />
            <button className="mini danger" disabled={modes.length <= 1} onClick={removeMode}>Remove this mode</button>
          </div>
          <p className="muted mt-2 mb-0">
            <strong>Home value</strong> is what a channel sits at when nothing is using it. Mode/control channels need the value that
            puts the light in DMX color mode (often 0). A dimmer usually sits at 255. <strong>Pixel</strong> 0 means the color
            covers the whole light.
          </p>
        </>
      )}

      <div className="row mt-3">
        <button className="primary" onClick={save}>Save light type</button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
