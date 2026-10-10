import { useEffect, useState } from 'react';
import type { LightEngine } from '../engine';

/** Re-render when the engine reports a change (rig edits, connection, tester, rig check). */
export function useEngine(engine: LightEngine) {
  const [, force] = useState(0);
  useEffect(() => engine.subscribe(() => force((n) => n + 1)), [engine]);
}

/** Re-render on a timer, for live readouts (universe monitor, meters). */
export function useTicker(ms: number, enabled = true) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => force((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}
