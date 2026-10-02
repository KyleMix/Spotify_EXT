import { useState } from 'react';
import type { Show, Slot, Track } from '../types';
import { actCount, applyWalkOffToAll, DEFAULTS, slotDefaults, isBlankSlot, MAX_SPOTS, moveItem, newSlot, resizeActs, slotName, totalPlannedMin } from '../lib';
import { SongField, type Audition } from './SongField';
import { SongBank } from './SongBank';
import { rememberTrack } from './bank';

interface Props {
  show: Show;
  update: (fn: (s: Show) => Show) => void;
  canSearch: boolean;
  audition: Audition;
  songCheck: { bad: string[]; state: 'idle' | 'checking' | 'done' | 'error'; msg?: string };
  onCheckSongs: () => void;
}

const num = (v: string, d = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

export function Editor({ show, update, canSearch, audition, songCheck, onCheckSongs }: Props) {
  const isBad = (t?: Track) => Boolean(t && songCheck.bad.includes(t.uri));
  const [sel, setSel] = useState<string | undefined>(show.slots[0]?.id);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [recentV, setRecentV] = useState(0);
  const slot = show.slots.find((s) => s.id === sel);
  const defs = slotDefaults(show);
  const noteSong = (t?: Track) => { if (t) { rememberTrack(t); setRecentV((v) => v + 1); } };

  const patch = (id: string, p: Partial<Slot>) => {
    noteSong(p.track); noteSong(p.walkOffTrack);
    update((s) => ({ ...s, slots: s.slots.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  };
  const assign = (kind: 'walk-up' | 'walk-off', t: Track) => {
    if (!slot) return;
    patch(slot.id, kind === 'walk-up' ? { track: t } : { walkOffTrack: t });
  };
  const add = (type: Slot['type']) => {
    const s = newSlot({ type, performer: type === 'host' ? 'Host' : type === 'break' ? 'Break' : '', setLengthMin: type === 'break' ? 10 : type === 'host' ? 3 : defs.setLengthMin,
      ...(type === 'act' ? { cueLengthMs: defs.cueLengthMs, warnAtMin: defs.warnAtMin } : {}) });
    update((sh) => ({ ...sh, slots: [...sh.slots, s] }));
    setSel(s.id);
  };
  const reorder = (from: number, to: number) => update((s) => ({ ...s, slots: moveItem(s.slots, from, to) }));
  const remove = (id: string) => { update((s) => ({ ...s, slots: s.slots.filter((x) => x.id !== id) })); setSel(undefined); };

  /** Grow/shrink the comedian list; confirm first if that would drop spots someone has filled in. */
  const setSpots = (count: number) => {
    const next = resizeActs(show.slots, count, 0, defs);
    const dropped = show.slots.filter((s) => !next.includes(s));
    if (dropped.some((s) => !isBlankSlot(s))
      && !confirm(`Remove ${dropped.length} spot${dropped.length === 1 ? '' : 's'} from the end of the list? Some already have a name or song.`)) return;
    update((sh) => ({ ...sh, slots: next }));
    if (sel && !next.some((s) => s.id === sel)) setSel(undefined);
  };
  const spots = actCount(show.slots);
  const spotOptions = Array.from({ length: MAX_SPOTS + 1 }, (_, i) => i);

  const setDefault = (p: Partial<typeof defs>) => update((s) => ({ ...s, defaults: { ...defs, ...p } }));

  return (
    <div className="edit-layout">
    <div className="grid" style={{ gap: 20, minWidth: 0 }}>
      <div className="card grid g3">
        <div><label>Show name</label><input value={show.name} onChange={(e) => update((s) => ({ ...s, name: e.target.value }))} /></div>
        <div><label>Date</label><input type="date" value={show.date} onChange={(e) => update((s) => ({ ...s, date: e.target.value }))} /></div>
        <div><label>Venue</label><input value={show.venue} onChange={(e) => update((s) => ({ ...s, venue: e.target.value }))} /></div>
        <details style={{ gridColumn: '1 / -1' }}>
          <summary style={{ cursor: 'pointer' }}>Defaults for new spots</summary>
          <div className="muted" style={{ margin: '6px 0' }}>Used when you add spots with the Spots menu or + Spot. Spots already in the list are not changed.</div>
          <div className="grid g3">
            <div><label>Set length (minutes)</label><input type="number" min={0} value={defs.setLengthMin} onChange={(e) => setDefault({ setLengthMin: num(e.target.value, 10) })} /></div>
            <div><label>Warning at (minutes left)</label><input type="number" min={0} value={defs.warnAtMin} onChange={(e) => setDefault({ warnAtMin: num(e.target.value, 2) })} /></div>
            <div><label>Walk-up plays for (seconds)</label><input type="number" min={0} value={defs.cueLengthMs / 1000} onChange={(e) => setDefault({ cueLengthMs: num(e.target.value, 25) * 1000 })} /></div>
          </div>
        </details>
      </div>

      <div className="card">
        {isBad(show.closingTrack) && <div role="alert" style={{ color: 'var(--danger)', marginBottom: 8 }}>⚠ Spotify says the end-of-show song is unavailable. Pick another.</div>}
        <SongField label="End-of-show song" kind="end-of-show" track={show.closingTrack} startMs={show.closingStartMs ?? 0}
          cueMs={show.closingCueMs ?? DEFAULTS.closingCueMs} cueLabel="Play for (seconds, 0 = until you fade it out)"
          canSearch={canSearch} audition={audition}
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
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Lineup</h2><span className="muted">{show.slots.length} slots · {totalPlannedMin(show)} min planned</span>
            <div className="spacer" />
            <label className="check" title="Pick how many comedian spots the list should have. Blank spots are added or removed from the end.">
              Spots
              <select style={{ width: 'auto' }} value={spots} aria-label="Number of comedian spots" onChange={(e) => setSpots(Number(e.target.value))}>
                {spotOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button aria-label="Remove last spot" title="Remove the last comedian spot" disabled={spots === 0} onClick={() => setSpots(spots - 1)}>− Spot</button>
            <button className="primary" title="Add a blank comedian spot at the end" disabled={spots >= MAX_SPOTS} onClick={() => setSpots(spots + 1)}>+ Spot</button>
            <button onClick={() => add('host')}>+ Host</button>
            <button onClick={() => add('break')}>+ Break</button>
          </div>
          {canSearch && (show.slots.some((x) => x.track || x.walkOffTrack) || show.closingTrack) ? (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="mini" disabled={!canSearch || songCheck.state === 'checking'} onClick={onCheckSongs}
                title="Ask Spotify whether each chosen song can be played in your country">{songCheck.state === 'checking' ? 'Checking songs…' : '✔ Check songs are playable'}</button>
              <span className="muted" role="status">
                {songCheck.state === 'done' && (songCheck.bad.length === 0 ? 'All songs are playable.' : `${songCheck.bad.length} song${songCheck.bad.length === 1 ? ' is' : 's are'} unavailable — marked ⚠ below.`)}
                {songCheck.state === 'error' && <span style={{ color: 'var(--danger)' }}>{songCheck.msg ?? 'Could not check songs.'}</span>}
                {songCheck.state === 'idle' && 'Find songs that have been removed or are blocked in your region.'}
              </span>
            </div>
          ) : null}
          {show.slots.length === 0 && <div className="card muted">No one on the bill yet. Pick a number of spots above, or add a comedian.</div>}
          {show.slots.map((s, i) => (
            <div key={s.id} draggable
              className={`slot ${sel === s.id ? 'sel' : ''} ${over === i && drag !== i ? 'dragover' : ''}`}
              onClick={() => setSel(s.id)}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { if (drag === null) return; e.preventDefault(); setOver(i); }}
              onDragEnd={() => { if (drag !== null && over !== null) reorder(drag, over); setDrag(null); setOver(null); }}>
              <div className="handle" aria-hidden title="Drag to reorder (or use the arrows)">⋮⋮</div>
              <div className="n">{i + 1}</div>
              <div className="grow">
                <div className="title">{s.performer || <span className="muted">{slotName(s, i)}</span>}{s.type !== 'act' && <span className="pill" style={{ marginLeft: 8 }}>{s.type}</span>}</div>
                <div className="muted">{s.track ? `♪ ${s.track.name} — ${s.track.artist}` : 'No walk-up song'} · {s.setLengthMin} min
                  {isBad(s.track) && <span style={{ color: 'var(--danger)' }} title="Spotify says this walk-up song is unavailable. Pick another."> ⚠ walk-up unavailable</span>}
                  {isBad(s.walkOffTrack) && <span style={{ color: 'var(--danger)' }} title="Spotify says this walk-off song is unavailable. Pick another."> ⚠ walk-off unavailable</span>}</div>
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

              <SongField label="Walk-up song" kind="walk-up" track={slot.track} startMs={slot.startOffsetMs} cueMs={slot.cueLengthMs}
                cueLabel="Play walk-up for (sec, 0 = until stopped)" canSearch={canSearch} audition={audition} dropActive={dragging}
                hint={slot.track ? undefined : `Tip: ${DEFAULTS.walkUpCueMs / 1000}s is a good starting length. Start on the hook.`}
                onChange={(p) => patch(slot.id, {
                  ...('track' in p ? { track: p.track } : {}),
                  ...(p.startMs !== undefined ? { startOffsetMs: p.startMs } : {}),
                  ...(p.cueMs !== undefined ? { cueLengthMs: p.cueMs } : {}),
                })} />

              {slot.type === 'act' && (
                <SongField label="Walk-off song" kind="walk-off" track={slot.walkOffTrack} startMs={slot.walkOffStartMs ?? 0}
                  cueMs={slot.walkOffCueMs ?? DEFAULTS.walkOffCueMs} cueLabel="Play walk-off for (sec, 0 = until stopped)"
                  canSearch={canSearch} audition={audition} dropActive={dragging}
                  hint={slot.walkOffTrack ? undefined : `Plays when you end this set. Tip: ~${DEFAULTS.walkOffCueMs / 1000}s, starting on a big moment.`}
                  onChange={(p) => patch(slot.id, {
                    ...('track' in p ? { walkOffTrack: p.track } : {}),
                    ...(p.startMs !== undefined ? { walkOffStartMs: p.startMs } : {}),
                    ...(p.cueMs !== undefined ? { walkOffCueMs: p.cueMs } : {}),
                  })} />
              )}
              {slot.type === 'act' && slot.walkOffTrack && actCount(show.slots) > 1 && (
                <div className="row">
                  <button className="mini" title="Copy this walk-off song and timing to every comedian in the lineup"
                    onClick={() => {
                      const others = show.slots.filter((x) => x.type === 'act' && x.id !== slot.id && x.walkOffTrack && x.walkOffTrack.uri !== slot.walkOffTrack!.uri);
                      if (others.length && !confirm(`Replace the walk-off song of ${others.length} other comedian${others.length === 1 ? '' : 's'}?`)) return;
                      update((sh) => ({ ...sh, slots: applyWalkOffToAll(sh.slots, slot) }));
                    }}>Use this walk-off for all comedians</button>
                </div>
              )}

              <div className="grid g2">
                <div><label>Set length (minutes)</label>
                  <input type="number" min={0} value={slot.setLengthMin} onChange={(e) => patch(slot.id, { setLengthMin: num(e.target.value) })} /></div>
                <div><label>Warning light at (minutes left)</label>
                  <input type="number" min={0} value={slot.warnAtMin} onChange={(e) => patch(slot.id, { warnAtMin: num(e.target.value) })} />
                  <div className="muted" style={{ marginTop: 4 }}>The timer turns amber (and the stage light flashes) this many minutes before time is up.</div></div>
              </div>
              <div><label>Notes / intro (shown on the Live screen)</label><textarea rows={3} value={slot.notes} onChange={(e) => patch(slot.id, { notes: e.target.value })} /></div>
              <div className="row"><div className="spacer" /><button className="danger" onClick={() => { if (isBlankSlot(slot) || confirm(`Delete ${slotName(slot, show.slots.indexOf(slot))} from the lineup?`)) remove(slot.id); }}>Delete slot</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
    <SongBank connected={canSearch} slotLabel={slot ? slotName(slot, show.slots.indexOf(slot)) : undefined}
      canSetWalkOff={slot?.type === 'act'} onAssign={assign} onDragState={setDragging} recentVersion={recentV} />
    </div>
  );
}
