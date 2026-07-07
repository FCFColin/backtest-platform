import { describe, it, expect } from 'vitest';
import { calculateDrag } from '../../../packages/backend/src/engine/drag.js';

describe('calculateDrag', () => {
  it('空组合返回零拖拽', () => {
    const result = calculateDrag([], [], 'none');
    expect(result.totalDrag).toBe(0);
    expect(result.annualDrag).toBe(0);
    expect(result.dragSeries).toEqual([]);
  });

  it('等值序列累积非零拖拽', () => {
    const result = calculateDrag([100, 100, 100], [], 'none');
    expect(result.totalDrag).toBeGreaterThan(0);
    expect(result.dragSeries).toHaveLength(3);
    expect(result.dragSeries[0]).toBeGreaterThan(0);
    expect(result.dragSeries[1]).toBeGreaterThan(result.dragSeries[0]);
  });

  it('递增序列拖拽逐年增加', () => {
    const result = calculateDrag([100, 110, 121], [], 'none');
    expect(result.dragSeries[2]).toBeGreaterThan(result.dragSeries[1]);
  });

  it('自定义 dragPct', () => {
    const result1 = calculateDrag([100, 100], [], 'none', 0.001);
    const result2 = calculateDrag([100, 100], [], 'none', 0.002);
    expect(result2.totalDrag).toBeGreaterThan(result1.totalDrag);
  });
});
