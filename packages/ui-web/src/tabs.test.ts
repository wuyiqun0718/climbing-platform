import { describe, expect, it } from 'vitest';
import { tabKeyIndex } from './tabs';

describe('tabKeyIndex', () => {
  it('moves right and left, wrapping at the ends', () => {
    expect(tabKeyIndex('ArrowRight', 0, 3)).toBe(1);
    expect(tabKeyIndex('ArrowRight', 2, 3)).toBe(0);
    expect(tabKeyIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(tabKeyIndex('ArrowLeft', 2, 3)).toBe(1);
  });
  it('Home and End go to the edges', () => {
    expect(tabKeyIndex('Home', 2, 3)).toBe(0);
    expect(tabKeyIndex('End', 0, 3)).toBe(2);
  });
  it('nothing selected counts as the first tab', () => {
    expect(tabKeyIndex('ArrowRight', -1, 3)).toBe(1);
  });
  it('ignores other keys and empty lists', () => {
    expect(tabKeyIndex('Enter', 0, 3)).toBeNull();
    expect(tabKeyIndex('ArrowRight', 0, 0)).toBeNull();
  });
});
