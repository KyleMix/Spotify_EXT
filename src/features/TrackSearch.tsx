import { useEffect, useState } from 'react';
import { searchTracks } from '../spotify/api';
import type { Track } from '../types';

export function TrackSearch({ onPick }: { onPick: (t: Track) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const h = setTimeout(() => {
      searchTracks(q).then((r) => { setResults(r); setErr(''); }).catch((e: Error) => setErr(e.message));
    }, 350);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <div>
      <input placeholder="Search Spotify for a walk-up song…" value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <div className="muted" style={{ color: 'var(--danger)', marginTop: 6 }}>{err}</div>}
      <div className="results">
        {results.map((t) => (
          <button key={t.uri} className="result" onClick={() => { onPick(t); setQ(''); setResults([]); }}>
            {t.albumArt ? <img className="art" src={t.albumArt} alt="" /> : <div className="art" />}
            <div><div>{t.name}</div><div className="muted">{t.artist}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}
