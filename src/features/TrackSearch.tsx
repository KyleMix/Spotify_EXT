import { useEffect, useState } from 'react';
import { SEARCH_PAGE, searchTracks } from '../spotify/api';
import type { Track } from '../types';

export function TrackSearch({ onPick, placeholder = 'Search Spotify for a song or artist…' }: { onPick: (t: Track) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); setErr(''); setLoading(false); setSearched(false); return; }
    let stale = false;
    setLoading(true);
    const h = setTimeout(() => {
      searchTracks(q)
        .then((r) => { if (!stale) { setResults(r); setMore(r.length >= SEARCH_PAGE); setErr(''); setSearched(true); } })
        .catch((e: Error) => { if (!stale) { setErr(e.message); setSearched(false); } })
        .finally(() => { if (!stale) setLoading(false); });
    }, 350);
    return () => { stale = true; clearTimeout(h); };
  }, [q]);

  const showMore = () => {
    setLoadingMore(true);
    searchTracks(q, results.length)
      .then((r) => {
        // Spotify can repeat a song across pages; keep each one once.
        setResults((cur) => [...cur, ...r.filter((t) => !cur.some((c) => c.uri === t.uri))]);
        setMore(r.length >= SEARCH_PAGE);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoadingMore(false));
  };

  return (
    <div>
      <input type="search" placeholder={placeholder} aria-label={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && <div className="muted mt-2" role="status">Searching…</div>}
      {err && <div className="muted text-danger mt-2" role="alert">{err}</div>}
      {!loading && !err && searched && results.length === 0 && (
        <div className="muted mt-2" role="status">No songs found for “{q}”. Try the song title plus the artist.</div>
      )}
      <div className="results">
        {results.map((t) => (
          <button key={t.uri} className="result" title="Use this song" onClick={() => { onPick(t); setQ(''); setResults([]); setSearched(false); }}>
            {t.albumArt ? <img className="art" src={t.albumArt} alt="" /> : <div className="art" />}
            <div><div>{t.name}</div><div className="muted">{t.artist}</div></div>
          </button>
        ))}
      </div>
      {more && results.length > 0 && (
        <button className="mini mt-2" disabled={loadingMore} onClick={showMore}>{loadingMore ? 'Loading…' : 'Show more results'}</button>
      )}
    </div>
  );
}
