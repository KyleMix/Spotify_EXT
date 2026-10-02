import type { Show } from '../types';
import { describeCue, DEFAULTS, formatClock, runSheetRows, totalPlannedMin } from '../lib';

/** Hidden on screen; shown (alone) when printing. */
export function RunSheet({ show }: { show: Show }) {
  const rows = runSheetRows(show);
  const mmss = (min: number) => formatClock(min * 60_000);
  return (
    <section className="runsheet" aria-hidden>
      <h1>{show.name}</h1>
      <p>{[show.date, show.venue].filter(Boolean).join(' · ')} · {show.slots.length} slots · {totalPlannedMin(show)} min of sets planned</p>
      <table>
        <thead><tr><th>#</th><th>Starts</th><th>Name</th><th>Set</th><th>Walk-up</th><th>Walk-off</th><th>Notes</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td>{r.n}</td><td>{mmss(r.startMin)}</td>
              <td><b>{r.name}</b>{r.type !== 'act' && <> ({r.type})</>}</td>
              <td>{r.lengthMin} min</td><td>{r.walkUp || '—'}</td><td>{r.type === 'act' ? r.walkOff || '—' : ''}</td><td>{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p><b>End-of-show song:</b> {show.closingTrack
        ? describeCue(show.closingTrack, show.closingStartMs ?? 0, show.closingCueMs ?? DEFAULTS.closingCueMs) : 'none'}</p>
      <p className="small">Start times are planned (set lengths added up from the top of the show), not live times.</p>
    </section>
  );
}
