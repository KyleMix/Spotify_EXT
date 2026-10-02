import { describe, expect, it } from 'vitest';
import { nextDensity } from './density';

describe('nextDensity', () => {
  it('toggles between comfortable and compact', () => {
    expect(nextDensity('comfortable')).toBe('compact');
    expect(nextDensity('compact')).toBe('comfortable');
  });
});
