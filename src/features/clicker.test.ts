import { describe, expect, it } from 'vitest';
import { bindKey, canFire, DEFAULT_BINDINGS, mergeBindings, ACTIONS, isBindable, keyLabel, resolveAction, unbindAction } from './clicker';

describe('clicker bindings', () => {
  it('resolves default clicker keys', () => {
    expect(resolveAction(DEFAULT_BINDINGS, 'PageDown')).toBe('next');
    expect(resolveAction(DEFAULT_BINDINGS, 'ArrowLeft')).toBe('fade');
    expect(resolveAction(DEFAULT_BINDINGS, 'Period')).toBe('panic');
    expect(resolveAction(DEFAULT_BINDINGS, 'KeyZ')).toBeNull();
  });
  it('moves a key between actions so it never maps twice', () => {
    const b = bindKey(DEFAULT_BINDINGS, 'panic', 'PageDown');
    expect(resolveAction(b, 'PageDown')).toBe('panic');
    expect(b.next).not.toContain('PageDown');
  });
  it('binding the same key twice does not duplicate it', () => {
    const b = bindKey(bindKey(DEFAULT_BINDINGS, 'fade', 'KeyF'), 'fade', 'KeyF');
    expect(b.fade.filter((c) => c === 'KeyF')).toHaveLength(1);
  });
  it('clears an action', () => {
    expect(unbindAction(DEFAULT_BINDINGS, 'fade').fade).toEqual([]);
  });
  it('rejects modifier-only keys', () => {
    expect(isBindable('ShiftLeft')).toBe(false);
    expect(isBindable('Tab')).toBe(false);
    expect(isBindable('F5')).toBe(true);
  });
  it('locks out rapid double-presses of next but never panic', () => {
    expect(canFire(undefined, 1000, 'next')).toBe(true);
    expect(canFire(1000, 1200, 'next')).toBe(false);
    expect(canFire(1000, 1600, 'next')).toBe(true);
    expect(canFire(1000, 1001, 'panic')).toBe(true);
  });
  it('labels keys', () => {
    expect(keyLabel('KeyP')).toBe('P');
    expect(keyLabel('PageDown')).toBe('PgDn');
    expect(keyLabel('Digit3')).toBe('3');
  });
});

describe('extra controls', () => {
  it('start unassigned so a stray key cannot skip an act', () => {
    for (const a of ['skip', 'back', 'closing', 'lightRed', 'lightOff'] as const) expect(DEFAULT_BINDINGS[a]).toEqual([]);
    expect(resolveAction(DEFAULT_BINDINGS, 'F13')).toBeNull();
  });
  it('can be bound to Stream Deck style F13-F24 keys, moving them off other actions', () => {
    expect(isBindable('F13')).toBe(true);
    const b = bindKey(bindKey(DEFAULT_BINDINGS, 'skip', 'F13'), 'back', 'F14');
    expect(resolveAction(b, 'F13')).toBe('skip');
    expect(resolveAction(b, 'F14')).toBe('back');
    const moved = bindKey(b, 'closing', 'F13');
    expect(resolveAction(moved, 'F13')).toBe('closing');
    expect(moved.skip).not.toContain('F13');
  });
  it('every action has a label and a lockout', () => {
    expect(ACTIONS.map((a) => a.id).sort()).toEqual(Object.keys(DEFAULT_BINDINGS).sort());
    expect(canFire(1000, 1200, 'skip')).toBe(false);
    expect(canFire(1000, 1200, 'lightRed')).toBe(true);
  });
});

describe('mergeBindings (keeps saved buttons across updates)', () => {
  it('keeps a user\'s custom assignments and fills in new actions with defaults', () => {
    const old = { next: ['KeyN'], fade: ['KeyF'], panic: ['KeyX'] }; // saved before the extra controls existed
    const m = mergeBindings(old);
    expect(m.next).toEqual(['KeyN']);
    expect(m.fade).toEqual(['KeyF']);
    expect(m.panic).toEqual(['KeyX']);
    expect(m.skip).toEqual([]);
  });
  it('falls back to defaults for junk', () => {
    expect(mergeBindings(null)).toEqual(DEFAULT_BINDINGS);
    expect(mergeBindings('x')).toEqual(DEFAULT_BINDINGS);
    expect(mergeBindings({ next: 'oops', fade: [1, 2] }).next).toEqual(DEFAULT_BINDINGS.next);
    expect(mergeBindings({ next: 'oops', fade: [1, 2] }).fade).toEqual(DEFAULT_BINDINGS.fade);
  });
});
