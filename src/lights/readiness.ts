/** Pre-show lighting checks for Live mode's ready check. Pure: everything it needs is passed in. */
import { EFFECTS } from './effects';
import { MOMENTS, type LooksState, type ShowMoment } from './looks';
import { profileOf, rigIssues, type Rig } from './patch';

export interface ReadyItem { ok: boolean; text: string }

const RED_MOMENTS: ShowMoment[] = ['warning', 'timeup'];
const isMusic = (effect: string) => !!EFFECTS.find((e) => e.id === effect)?.music;

export function lightingReadiness(opts: {
  rig: Rig; looks: LooksState; connected: boolean; micOn: boolean; blackout: boolean;
  /** False in Timer only mode: the warning and time's up cues are never fired. */
  redCues: boolean;
}): ReadyItem[] {
  const { rig, looks, connected, micOn, blackout, redCues } = opts;
  if (!rig.fixtures.length) return [{ ok: true, text: 'No lights set up (timer and music only)' }];
  const items: ReadyItem[] = [];
  items.push(connected ? { ok: true, text: 'Lights connected' } : { ok: false, text: 'Lights not connected (Lights → Connect lights)' });
  const issues = rigIssues(rig).length;
  if (issues) items.push({ ok: false, text: `${issues} rig problem${issues === 1 ? '' : 's'} (see Lights → Rig)` });
  const unverified = rig.fixtures.filter((f) => profileOf(rig, f)?.unverified).map((f) => f.name || 'a light');
  if (unverified.length) items.push({ ok: false, text: `Channel layout not confirmed for ${unverified.join(', ')} (run Lights → Tools → Rig check)` });
  if (blackout) items.push({ ok: false, text: 'Blackout is on' });
  const used = MOMENTS.filter((m) => redCues || !RED_MOMENTS.includes(m.id)).map((m) => looks.cues[m.id]).filter(Boolean);
  const musicCue = looks.looks.some((l) => used.includes(l.id) && (isMusic(l.all.effect) || Object.values(l.perFixture).some((p) => isMusic(p.effect))));
  if (musicCue && !micOn) items.push({ ok: false, text: 'Microphone off: music looks will run their idle pattern (Lights → Show → Start microphone)' });
  if (!musicCue || micOn) items.push({ ok: true, text: musicCue ? 'Microphone on' : 'No music looks in the show cues' });
  return items;
}
