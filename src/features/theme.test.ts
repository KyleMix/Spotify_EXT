import { describe, expect, it } from 'vitest';
import { nextTheme } from './theme';

describe('nextTheme', () => {
  it('cycles dark → light → auto → dark', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('auto');
    expect(nextTheme('auto')).toBe('dark');
  });
});
