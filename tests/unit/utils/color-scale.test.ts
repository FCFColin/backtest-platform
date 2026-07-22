import { describe, it, expect } from 'vitest';
import {
  pickByThreshold,
  pickByAbsThreshold,
  interpolateHsl,
} from '../../../packages/frontend/src/utils/colorScale.js';

describe('pickByThreshold', () => {
  it('非负阈值用 >=：value=0 应落入最负带（中性色），保证 0 不被最正带捕获', () => {
    const bands: { threshold: number; value: string }[] = [
      { threshold: 0.5, value: 'strong' },
      { threshold: 0, value: 'neutral' },
      { threshold: -0.5, value: 'weak-negative' },
    ];
    expect(pickByThreshold(0, bands, 'fallback')).toBe('neutral');
    expect(pickByThreshold(0.5, bands, 'fallback')).toBe('strong');
    expect(pickByThreshold(0.4, bands, 'fallback')).toBe('neutral');
    expect(pickByThreshold(-0.3, bands, 'fallback')).toBe('weak-negative');
  });

  it('负阈值用 >：边界值（value === threshold）不应命中负带', () => {
    const bands: { threshold: number; value: string }[] = [{ threshold: -0.5, value: 'negative' }];
    // value === -0.5 不命中（负阈值用 > 严格大于）
    expect(pickByThreshold(-0.5, bands, 'fallback')).toBe('fallback');
    // value > -0.5（如 -0.4）应命中
    expect(pickByThreshold(-0.4, bands, 'fallback')).toBe('negative');
  });

  it('空 bands 或全部不匹配应返回 defaultValue', () => {
    expect(pickByThreshold(0, [], 'fallback')).toBe('fallback');
    const bands: { threshold: number; value: string }[] = [{ threshold: 10, value: 'high' }];
    expect(pickByThreshold(5, bands, 'fallback')).toBe('fallback');
  });
});

describe('pickByAbsThreshold', () => {
  it('|value| > threshold 返回 highValue，否则 lowValue（边界 == 属于 low）', () => {
    expect(pickByAbsThreshold(0.6, 0.5, 'high', 'low')).toBe('high');
    expect(pickByAbsThreshold(-0.6, 0.5, 'high', 'low')).toBe('high');
    // 边界：|value| === threshold → low
    expect(pickByAbsThreshold(0.5, 0.5, 'high', 'low')).toBe('low');
    expect(pickByAbsThreshold(-0.5, 0.5, 'high', 'low')).toBe('low');
    // 零值
    expect(pickByAbsThreshold(0, 0.5, 'high', 'low')).toBe('low');
  });
});

describe('interpolateHsl', () => {
  it('min === max：默认使用区间中点色相，或返回 equalDefault', () => {
    // 默认 hueStart=0, hueEnd=120 → 中点 60
    expect(interpolateHsl(5, 5, 5)).toBe('hsl(60, 70%, 45%)');
    // 自定义 equalDefault 优先
    expect(interpolateHsl(5, 5, 5, { equalDefault: '#ccc' })).toBe('#ccc');
  });

  it('正常区间：value 线性映射到色相，越界 clamp 到 [0,1]', () => {
    // min=0, max=10, value=5 → normalized=0.5 → hue=60
    expect(interpolateHsl(5, 0, 10)).toBe('hsl(60, 70%, 45%)');
    // value = min → hue = hueStart = 0
    expect(interpolateHsl(0, 0, 10)).toBe('hsl(0, 70%, 45%)');
    // value = max → hue = hueEnd = 120
    expect(interpolateHsl(10, 0, 10)).toBe('hsl(120, 70%, 45%)');
    // value > max → clamp 到 1 → hue = 120
    expect(interpolateHsl(20, 0, 10)).toBe('hsl(120, 70%, 45%)');
    // value < min → clamp 到 0 → hue = 0
    expect(interpolateHsl(-5, 0, 10)).toBe('hsl(0, 70%, 45%)');
  });

  it('自定义 options（hueStart/hueEnd/saturation/lightness）应生效', () => {
    // hueStart=240, hueEnd=0, value 居中 → normalized=0.5 → hue = 240 + 0.5*(0-240) = 120
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
