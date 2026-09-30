import { ACTIONS, keyLabel, type Action, type Bindings } from './clicker';

interface Props {
  bindings: Bindings;
  listening: Action | null;
  lastKey: string;
  onListen: (a: Action | null) => void;
  onClear: (a: Action) => void;
  onReset: () => void;
}

export function RemotePanel({ bindings, listening, lastKey, onListen, onClear, onReset }: Props) {
  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Bluetooth clicker</h2>
        <div className="spacer" />
        <span className="pill" title="The last key the browser received, useful for testing your remote">
          Last key: {lastKey ? keyLabel(lastKey) : '—'}
        </span>
      </div>
      <p className="muted" style={{ margin: '8px 0 12px' }}>
        Pair the clicker in your computer's Bluetooth settings, then click <strong>Add button</strong> and press the
        button on the remote to assign it. Keep this tab focused.
      </p>
      <div className="grid">
        {ACTIONS.map((a) => (
          <div key={a.id} className="row" style={{ flexWrap: 'wrap' }}>
            <div style={{ minWidth: 170 }}>
              <div style={{ fontWeight: 600 }}>{a.label}</div>
              <div className="muted">{a.hint}</div>
            </div>
            <div className="row" style={{ flex: 1, flexWrap: 'wrap', gap: 6 }}>
              {bindings[a.id].length === 0 && <span className="muted">Not assigned</span>}
              {bindings[a.id].map((c) => <kbd key={c}>{keyLabel(c)}</kbd>)}
            </div>
            <button onClick={() => onListen(listening === a.id ? null : a.id)} className={listening === a.id ? 'primary' : ''}>
              {listening === a.id ? 'Press a button… (cancel)' : 'Add button'}
            </button>
            <button className="ghost" onClick={() => onClear(a.id)} disabled={bindings[a.id].length === 0}>Clear</button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button className="ghost" onClick={onReset}>Reset to defaults</button>
      </div>
    </div>
  );
}
