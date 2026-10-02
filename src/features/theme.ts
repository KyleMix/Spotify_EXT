export type Theme = 'dark' | 'light' | 'auto';
const KEY = 'walkup.theme';
export const THEMES: { id: Theme; label: string }[] = [
  { id: 'dark', label: '🌙 Dark' }, { id: 'light', label: '☀️ Light' }, { id: 'auto', label: '🖥 Auto' },
];

export function loadTheme(): Theme {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'auto' || v === 'dark') return v; } catch { /* default */ }
  return 'dark';
}
export function nextTheme(t: Theme): Theme {
  return THEMES[(THEMES.findIndex((x) => x.id === t) + 1) % THEMES.length].id;
}
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
  const light = t === 'light' || (t === 'auto' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f5f6f8' : '#0f1115');
}
