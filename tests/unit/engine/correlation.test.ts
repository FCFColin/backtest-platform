import { describe, it, expect } from 'vitest';
import { calcCorrelationMatrix } from '../../../packages/backend/src/engine/correlation.js';

describe('calcCorrelationMatrix', () => {
  it('单个组合返回 1x1 矩阵 [1]', () => {
    const results = [
      {
        name: 'p1',
        growthCurve: [
          { date: '2020-01-01', value: 100 },
          { date: '2020-01-02', value: 110 },
        ],
      },
    ] as never;
    const matrix = calcCorrelationMatrix(results);
    expect(matrix).toEqual([[1]]);
  });

  it('两个完全正相关组合返回 [[1,1],[1,1]]', () => {
    const results = [
      {
        name: 'p1',
        growthCurve: [
          { date: '2020-01-01', value: 100 },
          { date: '2020-01-02', value: 110 },
          { date: '2020-01-03', value: 105 },
          { date: '2020-01-04', value: 115 },
          { date: '2020-01-05', value: 120 },
        ],
      },
      {
        name: 'p2',
        growthCurve: [
          { date: '2020-01-01', value: 200 },
          { date: '2020-01-02', value: 220 },
          { date: '2020-01-03', value: 210 },
          { date: '2020-01-04', value: 230 },
          { date: '2020-01-05', value: 240 },
        ],
      },
    ] as never;
    const matrix = calcCorrelationMatrix(results);
    expect(matrix).toHaveLength(2);
    expect(matrix[0][0]).toBe(1);
    expect(matrix[1][1]).toBe(1);
    expect(matrix[0][1]).toBeCloseTo(1, 5);
    expect(matrix[1][0]).toBeCloseTo(1, 5);
  });

  it('空组合列表返回空矩阵', () => {
    const matrix = calcCorrelationMatrix([]);
    expect(matrix).toEqual([]);
  });
});
