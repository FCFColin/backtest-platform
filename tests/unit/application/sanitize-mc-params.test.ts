import { describe, it, expect } from 'vitest';
import { sanitizeMcParams } from '../../../packages/backend/src/application/backtest-helpers.js';

describe('sanitizeMcParams（与 Go MCSimParams 白名单对齐）', () => {
  it('仅保留白名单键，剥离未知键与原型污染键', () => {
    const result = sanitizeMcParams({
      numSimulations: 500,
      numYears: 20,
      minBlockYears: 1,
      maxBlockYears: 3,
      successThreshold: 1.0,
      maliciousKey: 'strip-me',
      constructor: 'evil',
      __proto__: { polluted: true },
    });
    expect(result).toEqual({
      numSimulations: 500,
      numYears: 20,
      minBlockYears: 1,
      maxBlockYears: 3,
      successThreshold: 1.0,
    });
    expect(result).not.toHaveProperty('maliciousKey');
  });

  it('undefined / 非对象 / 数组均返回空对象', () => {
    expect(sanitizeMcParams(undefined)).toEqual({});
    expect(sanitizeMcParams(null as unknown as Record<string, unknown>)).toEqual({});
    expect(sanitizeMcParams('nope' as unknown as Record<string, unknown>)).toEqual({});
    expect(sanitizeMcParams([{ numSimulations: 1 }] as unknown as Record<string, unknown>)).toEqual(
      {},
    );
  });
});
