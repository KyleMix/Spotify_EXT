import { useEffect, useState } from 'react';
import { parseTimeInput } from '../lib';

const show = (sec: number) => (Number.isInteger(sec) ? String(sec) : sec.toFixed(1));

/** Text field for a time in seconds. Accepts `41`, `0:41`, `1:05`; commits on blur or Enter. */
export function TimeInput({ seconds, onCommit, label }: { seconds: number; onCommit: (sec: number) => void; label: string }) {
  const [text, setText] = useState(show(seconds));
  useEffect(() => setText(show(seconds)), [seconds]);

  const commit = () => {
    const v = parseTimeInput(text);
    if (v === null) setText(show(seconds)); // not understood: keep the previous value
    else { onCommit(v); setText(show(v)); }
  };

  return (
    <input inputMode="decimal" aria-label={label} value={text} onChange={(e) => setText(e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
