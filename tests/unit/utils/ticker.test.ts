import { describe, it, expect } from 'vitest';
import { normalizeTicker } from '../../../packages/frontend/src/utils/format';

describe('normalizeTicker', () => {
  it('应去除首尾空白并转大写', () => {
    expect(normalizeTicker('  aapl  ')).toBe('AAPL');
    expect(normalizeTicker('BRK-B')).toBe('BRK-B');
  });
});
