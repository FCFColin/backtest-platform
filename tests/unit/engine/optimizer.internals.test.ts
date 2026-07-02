/**
 * optimizer 内部算法直接单测（构造输入覆盖 clipNegativeWeights 等分支）
 */
import { describe, it, expect } from 'vitest';
import { __optimizerTestOnly } from '../../../api/engine/optimizer.js';

const {
  clipNegativeWeights,
  solveTargetReturn,
  solveMaxSharpeClosedForm,
  calcCovariance,
  applyWeightConstraints,
} = __optimizerTestOnly;

describe('optimizer 内部算法', () => {
  it('calcCovariance 长度不一致应抛出', () => {
    expect(() => calcCovariance([0.01, 0.02], [0.01])).toThrow(/equal-length/);
  });

  it('applyWeightConstraints 裁剪后零和应回退等权', () => {
    const result = applyWeightConstraints([-0.4, -0.3, -0.2], 0, 0.6);
    expect(result).toHaveLength(3);
    for (const w of result) {
      expect(w).toBeCloseTo(1 / 3, 4);
    }
  });

  it('solveMaxSharpeClosedForm 全负权重裁剪后零和应回退最小方差', () => {
    const meanReturns = [0.05, 0.04, 0.03];
    const covMatrix = [
      [0.02, 0.008, 0.004],
      [0.008, 0.015, 0.003],
      [0.004, 0.003, 0.01],
    ];
    const weights = solveMaxSharpeClosedForm(meanReturns, covMatrix, 0.2, 3);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 4);
    expect(weights.every((w) => w >= 0)).toBe(true);
  });

  it('clipNegativeWeights 应迭代剔除负权重并归一化', () => {
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

  it('clipNegativeWeights 高目标收益应收敛到非负权重', () => {
    const meanReturns = [0.2, 0.01];
    const covMatrix = [
      [0.04, 0.001],
      [0.001, 0.02],
    ];
    const weights = clipNegativeWeights(0.19, meanReturns, covMatrix, 2);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 4);
    expect(weights.every((w) => w >= 0)).toBe(true);
    expect(weights[0]).toBeGreaterThan(weights[1]);
  });

  it('clipNegativeWeights 病态子矩阵应回退最小方差', () => {
    const meanReturns = [0.1, 0.1, 0.1];
    const covMatrix = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ];
    const weights = clipNegativeWeights(0.1, meanReturns, covMatrix, 3);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 4);
  });

  it('solveTargetReturn 闭式解负权重且 QP 失败时应回退 clipNegativeWeights', () => {
    const meanReturns = [0.16, 0.05, 0.03];
    const covMatrix = [
      [0.06, 0.015, 0.01],
      [0.015, 0.025, 0.006],
      [0.01, 0.006, 0.018],
    ];
    const n = 3;
    const minVolWeights = [0.2, 0.5, 0.3];
    const maxRetWeights = [1, 0, 0];
    const minVolReturn = 0.065;
    const maxReturn = 0.16;
    const targetReturn = 0.14;

    const weights = solveTargetReturn(targetReturn, meanReturns, covMatrix, n, {
      minVolWeights,
      maxRetWeights,
      minVolReturn,
      maxReturn,
    });
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 3);
    expect(weights.every((w) => w >= -1e-6)).toBe(true);
  });
});
