import { describe, it, expect } from 'vitest';
import {
  pickByAbsThreshold,
  interpolateHsl,
} from '../../../packages/frontend/src/lib/chart-theme.js';

describe('pickByAbsThreshold', () => {
  it('|value| > threshold 返回 highValue，否则 lowValue（边界 == 属于 low）', () => {
    expect(pickByAbsThreshold(0.6, 0.5, 'high', 'low')).toBe('high');
    expect(pickByAbsThreshold(-0.6, 0.5, 'high', 'low')).toBe('high');
    expect(pickByAbsThreshold(0.5, 0.5, 'high', 'low')).toBe('low');
    expect(pickByAbsThreshold(-0.5, 0.5, 'high', 'low')).toBe('low');
    expect(pickByAbsThreshold(0, 0.5, 'high', 'low')).toBe('low');
  });
});

describe('interpolateHsl', () => {
  it('min === max：默认使用区间中点色相，或返回 equalDefault', () => {
    expect(interpolateHsl(5, 5, 5)).toBe('hsl(60, 70%, 45%)');
    expect(interpolateHsl(5, 5, 5, { equalDefault: '#ccc' })).toBe('#ccc');
  });

  it('正常区间：value 线性映射到色相，越界 clamp 到 [0,1]', () => {
    expect(interpolateHsl(5, 0, 10)).toBe('hsl(60, 70%, 45%)');
    expect(interpolateHsl(0, 0, 10)).toBe('hsl(0, 70%, 45%)');
    expect(interpolateHsl(10, 0, 10)).toBe('hsl(120, 70%, 45%)');
    expect(interpolateHsl(20, 0, 10)).toBe('hsl(120, 70%, 45%)');
    expect(interpolateHsl(-5, 0, 10)).toBe('hsl(0, 70%, 45%)');
  });

  it('自定义 options（hueStart/hueEnd/saturation/lightness）应生效', () => {
    expect(
      interpolateHsl(5, 0, 10, {
        hueStart: 240,
        hueEnd: 0,
        saturation: 50,
        lightness: 60,
      }),
    ).toBe('hsl(120, 50%, 60%)');
  });
});
