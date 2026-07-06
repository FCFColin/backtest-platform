import { describe, it, expect } from 'vitest';
import { performPCA, jacobiEigen } from '../../../packages/backend/src/engine/pca.js';

// ===== performPCA 边界条件 =====
describe('performPCA - 边界条件', () => {
  it('空 ticker 列表应抛出错误（commonDates 不足）', () => {
    expect(() => performPCA([], {})).toThrow('有效价格数据不足');
  });

  it('单个交易日应抛出错误（至少需要2个交易日）', () => {
    const priceData = {
      A: { '2020-01-02': 100 },
      B: { '2020-01-02': 200 },
    };
    expect(() => performPCA(['A', 'B'], priceData)).toThrow('有效价格数据不足');
  });

  it('ticker 在 priceData 中不存在应抛出错误', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101 },
    };
    // B 不在 priceData 中，commonDates 为空
    expect(() => performPCA(['A', 'B'], priceData)).toThrow('有效价格数据不足');
  });

  it('日期不交集应抛出错误', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101 },
      B: { '2020-01-04': 200, '2020-01-05': 201 },
    };
    expect(() => performPCA(['A', 'B'], priceData)).toThrow('有效价格数据不足');
  });

  it('NaN 元素应产生 NaN 结果（不抛出）', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': NaN, '2020-01-04': 102 },
      B: { '2020-01-02': 200, '2020-01-03': 201, '2020-01-04': 202 },
    };
    // NaN 参与运算后协方差矩阵含 NaN，特征值也为 NaN
    const result = performPCA(['A', 'B'], priceData);
    expect(result.eigenvalues.length).toBe(2);
    // 至少一个特征值为 NaN
    expect(result.eigenvalues.some((v) => Number.isNaN(v))).toBe(true);
  });

  it('numComponents 截断：指定保留1个主成分', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101, '2020-01-04': 102, '2020-01-05': 103 },
      B: { '2020-01-02': 200, '2020-01-03': 201, '2020-01-04': 202, '2020-01-05': 203 },
    };
    const result = performPCA(['A', 'B'], priceData, 1);
    expect(result.eigenvalues).toHaveLength(1);
    expect(result.cumulativeVariance).toHaveLength(1);
    expect(result.loadings[0]).toHaveLength(1);
    expect(result.scores[0]).toHaveLength(1);
  });
});

// ===== performPCA 正常计算 =====
describe('performPCA - 正常计算', () => {
  it('完全正相关资产：第一主成分解释全部方差', () => {
    // A 和 B 完全正相关（同涨同跌）
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101, '2020-01-04': 102, '2020-01-05': 103 },
      B: { '2020-01-02': 200, '2020-01-03': 202, '2020-01-04': 204, '2020-01-05': 206 },
    };
    const result = performPCA(['A', 'B'], priceData);
    expect(result.eigenvalues).toHaveLength(2);
    expect(result.cumulativeVariance).toHaveLength(2);
    // 第一主成分应解释接近100%的方差
    expect(result.cumulativeVariance[0]).toBeCloseTo(1, 5);
    // 第二主成分特征值接近0
    expect(Math.abs(result.eigenvalues[1])).toBeLessThan(1e-6);
    // 累计方差最终为1
    expect(result.cumulativeVariance[1]).toBeCloseTo(1, 5);
  });

  it('特征值降序排列', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 110, '2020-01-04': 95, '2020-01-05': 105 },
      B: { '2020-01-02': 200, '2020-01-03': 195, '2020-01-04': 210, '2020-01-05': 200 },
      C: { '2020-01-02': 300, '2020-01-03': 305, '2020-01-04': 298, '2020-01-05': 302 },
    };
    const result = performPCA(['A', 'B', 'C'], priceData);
    expect(result.eigenvalues).toHaveLength(3);
    // 特征值应降序
    for (let i = 1; i < result.eigenvalues.length; i++) {
      expect(result.eigenvalues[i]).toBeLessThanOrEqual(result.eigenvalues[i - 1]);
    }
  });

  it('累计方差解释率单调递增且最终为1', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 110, '2020-01-04': 95, '2020-01-05': 105 },
      B: { '2020-01-02': 200, '2020-01-03': 195, '2020-01-04': 210, '2020-01-05': 200 },
    };
    const result = performPCA(['A', 'B'], priceData);
    for (let i = 1; i < result.cumulativeVariance.length; i++) {
      expect(result.cumulativeVariance[i]).toBeGreaterThanOrEqual(result.cumulativeVariance[i - 1]);
    }
    expect(result.cumulativeVariance.at(-1)).toBeCloseTo(1, 5);
  });

  it('载荷矩阵维度正确', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101, '2020-01-04': 102 },
      B: { '2020-01-02': 200, '2020-01-03': 201, '2020-01-04': 202 },
      C: { '2020-01-02': 300, '2020-01-03': 305, '2020-01-04': 310 },
    };
    const result = performPCA(['A', 'B', 'C'], priceData);
    // loadings[tickerIdx][componentIdx]，3 tickers × 3 components
    expect(result.loadings).toHaveLength(3);
    expect(result.loadings[0]).toHaveLength(3);
  });

  it('得分矩阵维度正确', () => {
    const priceData = {
      A: { '2020-01-02': 100, '2020-01-03': 101, '2020-01-04': 102, '2020-01-05': 103 },
      B: { '2020-01-02': 200, '2020-01-03': 201, '2020-01-04': 202, '2020-01-05': 203 },
    };
    const result = performPCA(['A', 'B'], priceData);
    // scores[dateIdx][componentIdx]，(nDates-1) × nTickers
    expect(result.scores).toHaveLength(3); // 4 dates - 1 = 3 returns
    expect(result.scores[0]).toHaveLength(2);
  });

  it('返回的 tickers 与输入一致', () => {
    const priceData = {
      X: { '2020-01-02': 100, '2020-01-03': 101 },
      Y: { '2020-01-02': 200, '2020-01-03': 201 },
    };
    const result = performPCA(['X', 'Y'], priceData);
    expect(result.tickers).toEqual(['X', 'Y']);
  });
});

// ===== jacobiEigen 单元测试 =====
describe('jacobiEigen', () => {
  it('单位矩阵的特征值全为1，特征向量为单位阵', () => {
    const identity = [
      [1, 0],
      [0, 1],
    ];
    const { eigenvalues, eigenvectors } = jacobiEigen(identity);
    expect(eigenvalues[0]).toBeCloseTo(1, 10);
    expect(eigenvalues[1]).toBeCloseTo(1, 10);
    // 特征向量应为单位阵的某种排列
    expect(Math.abs(eigenvectors[0][0])).toBeCloseTo(1, 10);
    expect(Math.abs(eigenvectors[1][1])).toBeCloseTo(1, 10);
  });

  it('对角矩阵的特征值等于对角元', () => {
    const diag = [
      [3, 0],
      [0, 5],
    ];
    const { eigenvalues } = jacobiEigen(diag);
    // jacobiEigen 不排序，特征值按对角元顺序返回
    expect(eigenvalues[0]).toBeCloseTo(3, 10);
    expect(eigenvalues[1]).toBeCloseTo(5, 10);
  });

  it('对称2x2矩阵的特征值正确', () => {
    // [[2, 1], [1, 2]] 的特征值为 3 和 1
    const matrix = [
      [2, 1],
      [1, 2],
    ];
    const { eigenvalues } = jacobiEigen(matrix);
    expect(eigenvalues[0]).toBeCloseTo(3, 10);
    expect(eigenvalues[1]).toBeCloseTo(1, 10);
  });

  it('空矩阵返回空结果', () => {
    const { eigenvalues, eigenvectors } = jacobiEigen([]);
    expect(eigenvalues).toEqual([]);
    expect(eigenvectors).toEqual([]);
  });

  it('1x1 矩阵特征值等于自身', () => {
    const { eigenvalues } = jacobiEigen([[42]]);
    expect(eigenvalues).toEqual([42]);
  });
});
