export type Density = 'comfortable' | 'compact';
const KEY = 'walkup.density';
export const DENSITIES: { id: Density; label: string }[] = [
  { id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' },
];

export function loadDensity(): Density {
  try { if (localStorage.getItem(KEY) === 'compact') return 'compact'; } catch { /* default */ }
  return 'comfortable';
}
export const nextDensity = (d: Density): Density => (d === 'compact' ? 'comfortable' : 'compact');
export function applyDensity(d: Density) {
  document.documentElement.dataset.density = d;
  try { localStorage.setItem(KEY, d); } catch { /* storage unavailable */ }
}
