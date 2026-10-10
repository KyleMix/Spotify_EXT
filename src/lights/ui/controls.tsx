import { useEffect, useState } from 'react';
import type { LightColor } from '../color';
import { EFFECTS, effectColor, type Layer } from '../effects';
import { DEFAULT_BINDINGS, keyLabel, loadBindings, resolveAction, ACTIONS } from '../../features/clicker';

export const toHex = (c: LightColor) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const fromHex = (h: string): LightColor => ({
  r: parseInt(h.slice(1, 3), 16) || 0, g: parseInt(h.slice(3, 5), 16) || 0, b: parseInt(h.slice(5, 7), 16) || 0,
});

const DEFAULT_COLORS: LightColor[] = [
  { r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 200 }, { r: 0, g: 200, b: 255 },
];

/** Small strip showing what a layer looks like across four pixels right now (static for moving effects). */
export function LayerPreview({ layer }: { layer: Layer }) {
  return (
    <span className="look-preview" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => {
        const c = effectColor(layer, { tMs: 0, pixel: i, globalIndex: i, globalCount: 4, sound: { r: 120, g: 0, b: 255 } });
        return <i key={i} style={{ background: `rgb(${c.r}, ${c.g}, ${c.b})` }} />;
      })}
    </span>
  );
}

/** Edit one layer: effect, colors, speed and level. Changes apply straight away (the look is live while editing). */
export function LayerEditor({ layer, onChange, label }: { layer: Layer; onChange: (l: Layer) => void; label: string }) {
  const fx = EFFECTS.find((e) => e.id === layer.effect) ?? EFFECTS[0];
  // Chase and strobe always use their fixed color slots; solid and pulse use as many colors as you add (1-4).
  const fixed = layer.effect === 'chase' || layer.effect === 'strobe';
  const count = fixed ? fx.usesColors : Math.min(fx.usesColors, Math.max(1, layer.colors.length));
  const colors = Array.from({ length: count }, (_, i) => layer.colors[i] ?? DEFAULT_COLORS[i]);
  const setColor = (i: number, c: LightColor) => {
    const next = [...colors]; next[i] = c;
    onChange({ ...layer, colors: next });
  };
  return (
    <div className="layer-editor">
      <div className="grid g4">
        <div>
          <label>Effect</label>
          <select value={layer.effect} aria-label={`${label} effect`}
            onChange={(e) => {
              const next = EFFECTS.find((x) => x.id === e.target.value)!;
              onChange({ ...layer, effect: next.id, colors: Array.from({ length: next.usesColors }, (_, i) => layer.colors[i] ?? DEFAULT_COLORS[i]) });
            }}>
            {EFFECTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
        {fx.usesColors > 0 && (
          <div>
            <label>{layer.effect === 'chase' ? 'Moving / background' : count > 1 ? 'Colors (alternate across pods)' : 'Color'}</label>
            <div className="row gap-2">
              {colors.map((c, i) => (
                <input key={i} type="color" className="color-in" value={toHex(c)} aria-label={`${label} color ${i + 1}`}
                  onChange={(e) => setColor(i, fromHex(e.target.value))} />
              ))}
              {!fixed && colors.length < fx.usesColors && (
                <button className="mini" aria-label={`${label}: add a color`} onClick={() => onChange({ ...layer, colors: [...colors, DEFAULT_COLORS[colors.length]] })}>+</button>
              )}
              {!fixed && colors.length > 1 && (
                <button className="mini" aria-label={`${label}: remove last color`} onClick={() => onChange({ ...layer, colors: colors.slice(0, -1) })}>−</button>
              )}
            </div>
          </div>
        )}
        {fx.usesSpeed && (
          <div>
            <label>Speed ({layer.speed.toFixed(1)})</label>
            <input type="range" min={0.1} max={10} step={0.1} value={layer.speed} aria-label={`${label} speed`}
              onChange={(e) => onChange({ ...layer, speed: Number(e.target.value) })} />
          </div>
        )}
        <div>
          <label>Level ({Math.round(layer.intensity * 100)}%)</label>
          <input type="range" min={0} max={100} value={Math.round(layer.intensity * 100)} aria-label={`${label} level`}
            onChange={(e) => onChange({ ...layer, intensity: Number(e.target.value) / 100 })} />
        </div>
      </div>
      <p className="muted mt-2 mb-0">{fx.hint}</p>
      {layer.effect === 'strobe' && (
        <p className="text-danger mt-1 mb-0" role="note">
          ⚠ Flashing lights can trigger seizures in people with photosensitive epilepsy, especially at 3 or more flashes a second.
          Warn your audience before using strobe.
        </p>
      )}
    </div>
  );
}

/** Which Live-mode action already uses a key, if any (so a look key doesn't do two things in Live mode). */
export function liveActionFor(code: string): string | null {
  let b = DEFAULT_BINDINGS;
  try { b = loadBindings(); } catch { /* defaults */ }
  const a = resolveAction(b, code);
  return a ? ACTIONS.find((x) => x.id === a)?.label ?? a : null;
}

/** "Set key" button: the next key pressed is bound. Keys Live mode already uses are refused. */
export function KeyBinder({ value, onChange, label }: { value?: string; onChange: (code: string | undefined) => void; label: string }) {
  const [listening, setListening] = useState(false);
  const [warn, setWarn] = useState('');
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Tab'].includes(e.code)) return;
      setListening(false);
      const used = liveActionFor(e.code);
      if (used) { setWarn(`${keyLabel(e.code)} is already "${used}" in Live mode. Pick another key (F13–F24 work well with a Stream Deck).`); return; }
      setWarn('');
      onChange(e.code);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, onChange]);
  return (
    <span className="row wrap gap-2">
      {value ? <kbd>{keyLabel(value)}</kbd> : <span className="muted">no key</span>}
      <button className="mini" aria-label={`${label}: set key`} onClick={() => { setWarn(''); setListening(!listening); }}>
        {listening ? 'Press a key…' : value ? 'Change key' : 'Set key'}
      </button>
      {value && <button className="mini" aria-label={`${label}: clear key`} onClick={() => onChange(undefined)}>Clear</button>}
      {warn && <span className="text-danger" role="alert">{warn}</span>}
    </span>
  );
}
