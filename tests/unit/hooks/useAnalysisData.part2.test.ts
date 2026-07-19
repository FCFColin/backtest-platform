/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// useMemo 直接执行工厂函数，不做缓存
vi.mock('react', () => ({
  useMemo: <T>(fn: () => T): T => fn(),
}));

import {
  useAnalysisData,
  // @ts-expect-error - 私有函数仅用于测试
} from '../../../packages/frontend/src/hooks/useAnalysisData.js';
import type { AssetAnalysisResult } from '../../../packages/shared/types/index.js';

// ===== 测试数据工厂 =====

function createAssetAnalysisResult(overrides?: Partial<AssetAnalysisResult>): AssetAnalysisResult {
  return {
    tickers: [],
    correlations: [],
    ...overrides,
  };
}

function createTicker(overrides?: Record<string, unknown>) {
  return {
    ticker: 'A',
    growthCurve: [],
    drawdownCurve: [],
    dailyReturns: [],
    annualReturns: [],
    monthlyReturns: [],
    rollingReturns: [],
    statistics: {},
    ...overrides,
  };
}

// ===== 全量批测 — 组合输出结构 =====

describe('useAnalysisData - 返回值结构', () => {
  it('返回所有字段', () => {
    const result = createAssetAnalysisResult({
      tickers: [createTicker({ ticker: 'A', dailyReturns: [1, 2, 3] })],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    const keys = Object.keys(hook.current).sort();
    expect(keys).toEqual([
      'betaMatrix',
      'growthData',
      'portfolioResults',
      'rollingCorrData',
      'scatterData',
      'tickerNames',
      'tickers',
    ]);
  });

  it('多资产时 rollingCorrData 返回数据', () => {
    const n = 60;
    const d1 = Array.from({ length: n }, (_, i) => Math.sin(i * 0.2));
    const d2 = Array.from({ length: n }, (_, i) => Math.cos(i * 0.2));
    const dates = Array.from({ length: n }, (_, i) => `d${i}`);
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          dailyReturns: d1,
          growthCurve: dates.map((d) => ({ date: d, value: 100 })),
        }),
        createTicker({
          ticker: 'B',
          dailyReturns: d2,
          growthCurve: dates.map((d) => ({ date: d, value: 200 })),
        }),
      ],
    });
    // correlationWindow=1 → windowDays ≈ 21, 60 > 21 所以有输出
    const { result: hook } = renderHook(() => useAnalysisData(result, 1, 60));
    expect(hook.current.rollingCorrData.length).toBeGreaterThan(0);
    for (const pt of hook.current.rollingCorrData) {
      expect(pt).toHaveProperty('date');
      expect(pt).toHaveProperty('value');
      expect(typeof pt.value).toBe('number');
    }
  });
});

// ===== 边界情况 =====

describe('useAnalysisData - 边界情况', () => {
  it('所有 dailyReturns 为常数时 rollingCorrData 全部为 0', () => {
    const constReturns = Array.from({ length: 50 }, () => 0.01);
    const dates = constReturns.map((_, i) => `d${i}`);
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          dailyReturns: constReturns,
          growthCurve: dates.map((d) => ({ date: d, value: 100 })),
        }),
        createTicker({
          ticker: 'B',
          dailyReturns: constReturns,
          growthCurve: dates.map((d) => ({ date: d, value: 100 })),
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    // 方差为 0 → 相关性为 0
    for (const pt of hook.current.rollingCorrData) {
      expect(pt.value).toBe(0);
    }
  });

  it('growthCurve 含相同日期来自多个资产时值被合并', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          growthCurve: [{ date: '2024-01-01', value: 10 }],
        }),
        createTicker({
          ticker: 'B',
          growthCurve: [{ date: '2024-01-01', value: 20 }],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.growthData).toHaveLength(1);
    expect(hook.current.growthData[0].A).toBe(10);
    expect(hook.current.growthData[0].B).toBe(20);
  });

  it('tickers 包含 10 个资产时仍能正常计算', () => {
    const tickers = Array.from({ length: 10 }, (_, i) =>
      createTicker({
        ticker: `T${i}`,
        dailyReturns: Array.from({ length: 20 }, (__, j) => Math.sin(j + i)),
        growthCurve: Array.from({ length: 20 }, (__, j) => ({ date: `d${j}`, value: 100 + i })),
        drawdownCurve: Array.from({ length: 20 }, (__, j) => ({
          date: `d${j}`,
          drawdown: -0.01 * i,
        })),
        annualReturns: [{ year: 2023, return: 0.1 * i }],
        statistics: { cagr: 0.05 * i },
      }),
    );
    const result = createAssetAnalysisResult({ tickers });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.tickerNames).toHaveLength(10);
    expect(hook.current.betaMatrix).toHaveLength(10);
    expect(hook.current.scatterData).toHaveLength(10);
    expect(hook.current.growthData.length).toBeGreaterThan(0);
  });
});
