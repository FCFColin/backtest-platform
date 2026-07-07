import { describe, it, expect } from 'vitest';
import {
  solveMinVariance,
  solveMaxSharpe,
  solveTargetReturn,
  clipNegativeWeights,
} from '../../../packages/backend/src/engine/optimizerSolvers.js';

describe('solveMinVariance', () => {
  it('对角协方差矩阵返回等权', () => {
    const cov = [
      [0.1, 0],
      [0, 0.2],
    ];
    const weights = solveMinVariance(cov, 2);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 4);
    expect(weights[0]).toBeGreaterThan(weights[1]);
  });

  it('病态矩阵回退等权', () => {
    const cov = [
      [0, 0],
      [0, 0],
    ];
    const weights = solveMinVariance(cov, 3);
    expect(weights).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('空协方差矩阵', () => {
    const weights = solveMinVariance([], 0);
    expect(weights).toEqual([]);
  });
});

describe('solveMaxSharpe', () => {
  it('单一资产返回 [1]', () => {
    const weights = solveMaxSharpe([0.1], [[0.05]], 0.02, 1);
    expect(weights).toEqual([1]);
  });

  it('零资产返回空数组', () => {
    expect(solveMaxSharpe([], [], 0.02, 0)).toEqual([]);
  });

  it('两个资产应分配非负权重', () => {
    const meanReturns = [0.12, 0.08];
    const covMatrix = [
      [0.1, 0.02],
      [0.02, 0.08],
    ];
    const weights = solveMaxSharpe(meanReturns, covMatrix, 0.02, 2);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 4);
    expect(weights.every((w) => w >= -1e-8)).toBe(true);
  });
});

describe('solveTargetReturn', () => {
  it('返回目标收益率的非负权重', () => {
    const meanReturns = [0.12, 0.08, 0.06];
    const covMatrix = [
      [0.1, 0.02, 0.01],
      [0.02, 0.08, 0.015],
      [0.01, 0.015, 0.06],
    ];
    const weights = solveTargetReturn(0.09, meanReturns, covMatrix, 3);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 4);
    expect(weights.every((w) => w >= -1e-6)).toBe(true);
  });

  it('病态矩阵回退等权', () => {
    const weights = solveTargetReturn(
      0.1,
      [0.1, 0.1],
      [
        [0, 0],
        [0, 0],
      ],
      2,
    );
    expect(weights).toEqual([0.5, 0.5]);
  });
});

describe('clipNegativeWeights', () => {
  it('应剔除负权重并归一化', () => {
    const meanReturns = [0.14, 0.06, 0.04];
    const covMatrix = [
      [0.05, 0.012, 0.008],
      [0.012, 0.02, 0.005],
      [0.008, 0.005, 0.015],
    ];
    const weights = clipNegativeWeights(0.09, meanReturns, covMatrix, 3);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 4);
    expect(weights.every((w) => w >= 0)).toBe(true);
  });

  it('高目标收益应更集中高收益资产', () => {
    const meanReturns = [0.2, 0.01];
    const covMatrix = [
      [0.04, 0.001],
      [0.001, 0.02],
    ];
    const weights = clipNegativeWeights(0.19, meanReturns, covMatrix, 2);
    expect(weights[0]).toBeGreaterThan(weights[1]);
  });
});
