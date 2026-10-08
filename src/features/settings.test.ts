import { describe, expect, it } from 'vitest';
import { clampFade, DEFAULT_SETTINGS } from './settings';

describe('clampFade', () => {
  it('keeps values in range and rounds', () => {
    expect(clampFade(4000)).toBe(4000);
    expect(clampFade(100)).toBe(500);
    expect(clampFade(60_000)).toBe(10_000);
    expect(clampFade(NaN)).toBe(DEFAULT_SETTINGS.fadeOutMs);
  });
  it("warning mode defaults to the light", () => { expect(DEFAULT_SETTINGS.warningMode).toBe("light"); });
  it("auto-start timer is on by default", () => {
    expect(DEFAULT_SETTINGS.autoStartTimer).toBe(true);
  });
  it('default fade is slower than the old 1.2s', () => {
    expect(DEFAULT_SETTINGS.fadeOutMs).toBeGreaterThan(1200);
  });
});
