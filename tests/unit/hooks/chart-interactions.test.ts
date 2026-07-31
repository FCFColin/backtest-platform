import { describe, it, expect } from 'vitest';
import { downsample } from '../../../packages/frontend/src/hooks/useChartInteractions.js';

describe('downsample', () => {
  it('数据量未超 maxPoints 时应原样返回', () => {
    const data = [1, 2, 3, 4, 5];
    expect(downsample(data, 10)).toBe(data);
    expect(downsample(data, 5)).toBe(data);
  });

  it('数据量等于 maxPoints + 1 时应降采样并保留最后一个点', () => {
    const data = Array.from({ length: 11 }, (_, i) => i);
    const result = downsample(data, 10);

    expect(result.length).toBeLessThanOrEqual(11);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(10);
  });

  it('大数据集应按步长抽取并确保末点包含', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 2 }));
    const result = downsample(data, 10);

    expect(result.length).toBeGreaterThan(1);
    expect(result.length).toBeLessThanOrEqual(12);
    expect(result[result.length - 1]).toEqual({ x: 99, y: 198 });
  });

  it('空数组应返回空数组', () => {
    expect(downsample([], 100)).toEqual([]);
  });

  it('单元素数组应原样返回', () => {
    expect(downsample(['x'], 10)).toEqual(['x']);
  });

  it('最后一个点已被步长覆盖时不应重复追加', () => {
    const data = Array.from({ length: 10 }, (_, i) => i);
    const result = downsample(data, 5);
    // step = ceil(10/5) = 2, indexes: 0,2,4,6,8 → last point 9 different from 8
    expect(result).toEqual([0, 2, 4, 6, 8, 9]);
  });

  it('当最后一个点恰好被步长覆盖时不重复添加', () => {
    const data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = downsample(data, 10);
    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('maxPoints=1 应返回首尾两个元素', () => {
    const data = Array.from({ length: 5 }, (_, i) => i);
    const result = downsample(data, 1);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(4);
  });

  it('maxPoints 大于 data.length 时原样返回', () => {
    const data = [1, 2, 3];
    expect(downsample(data, 100)).toBe(data);
  });
});
