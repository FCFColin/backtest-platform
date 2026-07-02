/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { downsample, useZoomRange } from '../../../src/hooks/useChartInteractions.js';

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
});

describe('useZoomRange', () => {
  const data = Array.from({ length: 20 }, (_, i) => ({ idx: i, value: i * 10 }));

  it('未设置缩放范围时应返回完整数据', () => {
    const { result } = renderHook(() => useZoomRange(data));

    expect(result.current.visibleData).toEqual(data);
    expect(result.current.zoomRange).toBeNull();
  });

  it('设置 initialRange 时应切片 visibleData', () => {
    const { result } = renderHook(() => useZoomRange(data, [2, 5]));

    expect(result.current.zoomRange).toEqual([2, 5]);
    expect(result.current.visibleData).toEqual(data.slice(2, 6));
    expect(result.current.visibleData).toHaveLength(4);
  });

  it('setZoomRange 应更新可见窗口', () => {
    const { result } = renderHook(() => useZoomRange(data));

    act(() => {
      result.current.setZoomRange([0, 3]);
    });

    expect(result.current.visibleData).toEqual(data.slice(0, 4));
  });

  it('resetZoom 应恢复完整数据', () => {
    const { result } = renderHook(() => useZoomRange(data, [1, 4]));

    act(() => {
      result.current.resetZoom();
    });

    expect(result.current.zoomRange).toBeNull();
    expect(result.current.visibleData).toEqual(data);
  });

  it('data 变更后 visibleData 应跟随更新', () => {
    const initial = [{ v: 1 }, { v: 2 }];
    const { result, rerender } = renderHook(
      ({ rows, range }: { rows: typeof initial; range: [number, number] | undefined }) =>
        useZoomRange(rows, range),
      { initialProps: { rows: initial, range: [0, 1] as [number, number] } },
    );

    expect(result.current.visibleData).toEqual(initial);

    const updated = [{ v: 10 }, { v: 20 }, { v: 30 }];
    rerender({ rows: updated, range: [0, 1] });

    expect(result.current.visibleData).toEqual(updated.slice(0, 2));
  });
});
