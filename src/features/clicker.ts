/**
 * Bluetooth clickers / presentation remotes / page turners show up as ordinary keyboards,
 * so "supporting" them means mapping key codes to show actions, with anti-double-press protection.
 */
export type Action = 'next' | 'fade' | 'panic';
export type Bindings = Record<Action, string[]>;

export const ACTIONS: { id: Action; label: string; hint: string }[] = [
  { id: 'next', label: 'Next step', hint: 'Play walk-up → start timer → end set' },
  { id: 'fade', label: 'Fade out music', hint: 'Gentle 1.2 s fade' },
  { id: 'panic', label: 'Panic stop', hint: 'Cut the music instantly' },
];

/** Typical clicker output: Next = →/PgDn, Previous = ←/PgUp, Blank screen = B/period. */
export const DEFAULT_BINDINGS: Bindings = {
  next: ['Space', 'Enter', 'ArrowRight', 'PageDown'],
  fade: ['Escape', 'ArrowLeft', 'PageUp'],
  panic: ['KeyP', 'KeyB', 'Period'],
};

/** Minimum gap between repeats of an action; stops a double-click from skipping an act. */
export const LOCKOUT_MS: Record<Action, number> = { next: 500, fade: 300, panic: 0 };

const STORAGE_KEY = 'walkup.clicker.v1';
const MODIFIERS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Tab']);

export const isBindable = (code: string) => Boolean(code) && !MODIFIERS.has(code);

export function resolveAction(b: Bindings, code: string): Action | null {
  for (const a of Object.keys(b) as Action[]) if (b[a].includes(code)) return a;
  return null;
}

/** Assign `code` to `action`, removing it from any other action so a key never does two things. */
export function bindKey(b: Bindings, action: Action, code: string): Bindings {
  const next = {} as Bindings;
  for (const a of Object.keys(b) as Action[]) next[a] = b[a].filter((c) => c !== code);
  next[action] = [...next[action], code];
  return next;
}

export function unbindAction(b: Bindings, action: Action): Bindings {
  return { ...b, [action]: [] };
}

export function canFire(lastFiredAt: number | undefined, now: number, action: Action): boolean {
  return lastFiredAt === undefined || now - lastFiredAt >= LOCKOUT_MS[action];
}

const NAMES: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓',
  PageDown: 'PgDn', PageUp: 'PgUp', Period: '.', Comma: ',', Backspace: 'Backspace', NumpadEnter: 'Num Enter',
};
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function loadBindings(): Bindings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw && (Object.keys(DEFAULT_BINDINGS) as Action[]).every((a) => Array.isArray(raw[a]))) return raw as Bindings;
  } catch { /* use defaults */ }
  return DEFAULT_BINDINGS;
}

export function saveBindings(b: Bindings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch { /* storage unavailable */ }
}
