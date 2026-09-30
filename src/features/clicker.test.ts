import { describe, expect, it } from 'vitest';
import { bindKey, canFire, DEFAULT_BINDINGS, isBindable, keyLabel, resolveAction, unbindAction } from './clicker';

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
