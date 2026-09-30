import { useState } from 'react';
import type { Show, Slot, Track } from '../types';
import { DEFAULTS, moveItem, newSlot, totalPlannedMin } from '../lib';
import { SongField } from './SongField';

interface Props {
  show: Show;
  update: (fn: (s: Show) => Show) => void;
  canSearch: boolean;
  preview: (track: Track, startMs: number, cueMs: number) => void;
}

const num = (v: string, d = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

export function Editor({ show, update, canSearch, preview }: Props) {
  const [sel, setSel] = useState<string | undefined>(show.slots[0]?.id);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const slot = show.slots.find((s) => s.id === sel);

  const patch = (id: string, p: Partial<Slot>) =>
    update((s) => ({ ...s, slots: s.slots.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const add = (type: Slot['type']) => {
    const s = newSlot({ type, performer: type === 'host' ? 'Host' : type === 'break' ? 'Break' : '', setLengthMin: type === 'break' ? 10 : type === 'host' ? 3 : 10 });
    update((sh) => ({ ...sh, slots: [...sh.slots, s] }));
    setSel(s.id);
  };
  const reorder = (from: number, to: number) => update((s) => ({ ...s, slots: moveItem(s.slots, from, to) }));
  const remove = (id: string) => { update((s) => ({ ...s, slots: s.slots.filter((x) => x.id !== id) })); setSel(undefined); };

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="card grid g3">
        <div><label>Show name</label><input value={show.name} onChange={(e) => update((s) => ({ ...s, name: e.target.value }))} /></div>
        <div><label>Date</label><input type="date" value={show.date} onChange={(e) => update((s) => ({ ...s, date: e.target.value }))} /></div>
        <div><label>Venue</label><input value={show.venue} onChange={(e) => update((s) => ({ ...s, venue: e.target.value }))} /></div>
      </div>

      <div className="card">
        <SongField label="End-of-show song" track={show.closingTrack} startMs={show.closingStartMs ?? 0}
          cueMs={show.closingCueMs ?? DEFAULTS.closingCueMs} cueLabel="Play for (sec, 0 = until faded out)"
          canSearch={canSearch} preview={preview}
          hint="Plays when you press Next after the last act finishes. Leave empty for no closing song."
          onChange={(p) => update((sh) => ({
            ...sh,
            ...('track' in p ? { closingTrack: p.track } : {}),
            ...(p.startMs !== undefined ? { closingStartMs: p.startMs } : {}),
            ...(p.cueMs !== undefined ? { closingCueMs: p.cueMs } : {}),
          }))} />
      </div>

      <div className="split">
        <div className="grid">
          <div className="row">
            <h2 style={{ margin: 0 }}>Lineup</h2><span className="muted">{show.slots.length} slots · {totalPlannedMin(show)} min planned</span>
            <div className="spacer" />
            <button className="primary" onClick={() => add('act')}>+ Comedian</button>
            <button onClick={() => add('host')}>+ Host</button>
            <button onClick={() => add('break')}>+ Break</button>
          </div>
          {show.slots.length === 0 && <div className="card muted">No one on the bill yet. Add your first comedian.</div>}
          {show.slots.map((s, i) => (
            <div key={s.id} draggable
              className={`slot ${sel === s.id ? 'sel' : ''} ${over === i && drag !== i ? 'dragover' : ''}`}
              onClick={() => setSel(s.id)}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragEnd={() => { if (drag !== null && over !== null) reorder(drag, over); setDrag(null); setOver(null); }}>
              <div className="n">{i + 1}</div>
              <div className="grow">
                <div className="title">{s.performer || <span className="muted">Unnamed</span>}{s.type !== 'act' && <span className="pill" style={{ marginLeft: 8 }}>{s.type}</span>}</div>
                <div className="muted">{s.track ? `♪ ${s.track.name} — ${s.track.artist}` : 'No walk-up song'} · {s.setLengthMin} min</div>
              </div>
              <button className="ghost" aria-label="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); reorder(i, i - 1); }}>↑</button>
              <button className="ghost" aria-label="Move down" disabled={i === show.slots.length - 1} onClick={(e) => { e.stopPropagation(); reorder(i, i + 1); }}>↓</button>
            </div>
          ))}
        </div>

        <div className="card">
          {!slot ? <div className="muted">Select a slot to edit it.</div> : (
            <div className="grid">
              <h2>Edit slot</h2>
              <div className="grid g2">
                <div><label>Name</label><input value={slot.performer} onChange={(e) => patch(slot.id, { performer: e.target.value })} /></div>
                <div><label>Type</label>
                  <select value={slot.type} onChange={(e) => patch(slot.id, { type: e.target.value as Slot['type'] })}>
                    <option value="act">Comedian</option><option value="host">Host</option><option value="break">Break</option>
                  </select></div>
              </div>

              <SongField label="Walk-up song" track={slot.track} startMs={slot.startOffsetMs} cueMs={slot.cueLengthMs}
                cueLabel="Play walk-up for (sec, 0 = until stopped)" canSearch={canSearch} preview={preview}
                hint={slot.track ? undefined : `Tip: ${DEFAULTS.walkUpCueMs / 1000}s is a good starting length. Start on the hook.`}
                onChange={(p) => patch(slot.id, {
                  ...('track' in p ? { track: p.track } : {}),
                  ...(p.startMs !== undefined ? { startOffsetMs: p.startMs } : {}),
                  ...(p.cueMs !== undefined ? { cueLengthMs: p.cueMs } : {}),
                })} />

              {slot.type === 'act' && (
                <SongField label="Walk-off song" track={slot.walkOffTrack} startMs={slot.walkOffStartMs ?? 0}
                  cueMs={slot.walkOffCueMs ?? DEFAULTS.walkOffCueMs} cueLabel="Play walk-off for (sec, 0 = until stopped)"
                  canSearch={canSearch} preview={preview}
                  hint={slot.walkOffTrack ? undefined : `Plays when you end this set. Tip: ~${DEFAULTS.walkOffCueMs / 1000}s, starting on a big moment.`}
                  onChange={(p) => patch(slot.id, {
                    ...('track' in p ? { walkOffTrack: p.track } : {}),
                    ...(p.startMs !== undefined ? { walkOffStartMs: p.startMs } : {}),
                    ...(p.cueMs !== undefined ? { walkOffCueMs: p.cueMs } : {}),
                  })} />
              )}

              <div className="grid g2">
                <div><label>Set length (min)</label>
                  <input type="number" min={0} value={slot.setLengthMin} onChange={(e) => patch(slot.id, { setLengthMin: num(e.target.value) })} /></div>
                <div><label>Light warning at (min left)</label>
                  <input type="number" min={0} value={slot.warnAtMin} onChange={(e) => patch(slot.id, { warnAtMin: num(e.target.value) })} /></div>
              </div>
              <div><label>Notes / intro</label><textarea rows={3} value={slot.notes} onChange={(e) => patch(slot.id, { notes: e.target.value })} /></div>
              <div className="row"><div className="spacer" /><button className="danger" onClick={() => remove(slot.id)}>Delete slot</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
