/**
 * "Learn this light": the channel tester steps one channel at a time and you say what lit up. The answers become
 * a custom light type, so a light whose manual is missing or wrong (like the Neo-Slim) gets a correct profile.
 */
import type { ChannelDef, ChannelType, FixtureProfile } from './profiles';

/** What you saw when one channel went to full. pixel 0 = the whole light. */
export type LearnAnswer =
  | { kind: 'color'; color: Extract<ChannelType, 'red' | 'green' | 'blue' | 'white' | 'amber'>; pixel: number }
  | { kind: 'strobe' }
  | { kind: 'mode' }
  | { kind: 'nothing' };

export function answerToChannel(a: LearnAnswer | undefined): ChannelDef {
  if (!a || a.kind === 'nothing') return { type: 'other', home: 0 };
  if (a.kind === 'strobe') return { type: 'strobe', label: 'Strobe', home: 0 };
  if (a.kind === 'mode') return { type: 'control', label: 'Mode / program (keep at 0)', home: 0 };
  return { type: a.color, pixel: a.pixel > 0 ? a.pixel : undefined, home: 0 };
}

export function describeAnswer(a: LearnAnswer, pixelName = 'Pixel'): string {
  if (a.kind === 'nothing') return 'nothing';
  if (a.kind === 'strobe') return 'strobe';
  if (a.kind === 'mode') return 'mode / program';
  return `${a.pixel > 0 ? `${pixelName} ${a.pixel}` : 'all'} ${a.color}`;
}

/**
 * Build a light type from the answers for channels 1..count (unanswered channels are left unused at 0).
 * A channel that turned everything on only together with others can't be seen alone, so dimmers aren't learned:
 * if a learned light stays dark, add a dimmer in the light type editor.
 */
export function learnedProfile(opts: {
  name: string; count: number; answers: Record<number, LearnAnswer>; base?: FixtureProfile;
}): Omit<FixtureProfile, 'id'> {
  const channels = Array.from({ length: opts.count }, (_, i) => answerToChannel(opts.answers[i + 1]));
  return {
    name: `${opts.name} (learned)`,
    addressing: opts.base?.addressing ?? 'display',
    pixelName: opts.base?.pixelName,
    modes: [{ id: 'learned', name: `${opts.count}-CH (learned)`, channels, note: 'Learned with the channel tester.' }],
  };
}
