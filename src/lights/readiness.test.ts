import { describe, expect, it } from 'vitest';
import { defaultLooks } from './looks';
import type { Rig } from './patch';
import { lightingReadiness } from './readiness';

const rig: Rig = { customProfiles: [], fixtures: [
  { id: 'bar', name: '4BAR', profileId: 'chauvet-4bar-flex', modeId: '15ch', address: 1 },
  { id: 'neo', name: 'Neo', profileId: 'irradiant-neo-slim-bar-48', modeId: '12ch', address: 16 },
] };
const base = { rig, looks: defaultLooks(), connected: true, micOn: true, blackout: false, redCues: true };
const bad = (items: { ok: boolean; text: string }[]) => items.filter((i) => !i.ok).map((i) => i.text);

describe('lightingReadiness', () => {
  it('flags an unconfirmed light type even when everything else is ready', () => {
    expect(bad(lightingReadiness(base))).toEqual(['Channel layout not confirmed for Neo (run Lights → Tools → Rig check)']);
  });
  it('flags a disconnected cable, overlaps, blackout and a mic that music cues need', () => {
    const r = { ...rig, fixtures: [rig.fixtures[0], { ...rig.fixtures[1], profileId: 'generic-rgb', modeId: '3ch', address: 10 }] };
    const out = bad(lightingReadiness({ ...base, rig: r, connected: false, micOn: false, blackout: true }));
    expect(out).toEqual([
      'Lights not connected (Lights → Connect lights)',
      '1 rig problem (see Lights → Rig)',
      'Blackout is on',
      'Microphone off: music looks will run their idle pattern (Lights → Show → Start microphone)',
    ]);
  });
  it('does not ask for the mic when no cue in use is a music look', () => {
    const looks = defaultLooks();
    for (const k of Object.keys(looks.cues) as (keyof typeof looks.cues)[]) looks.cues[k] = 'stage-white';
    const r = { ...rig, fixtures: [rig.fixtures[0]] };
    expect(bad(lightingReadiness({ ...base, rig: r, looks, micOn: false }))).toEqual([]);
  });
  it('with no lights there is nothing to check', () => {
    expect(lightingReadiness({ ...base, rig: { fixtures: [], customProfiles: [] } })).toEqual([{ ok: true, text: 'No lights set up (timer and music only)' }]);
  });
});
