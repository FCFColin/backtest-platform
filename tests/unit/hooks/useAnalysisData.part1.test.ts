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
import { TRADING_DAYS_PER_YEAR } from '../../../packages/shared/constants.js';
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

describe('useAnalysisData - 计算逻辑验证', () => {
  it('single asset 时 rollingCorrData 为空', () => {
    const result = createAssetAnalysisResult({
      tickers: [createTicker({ ticker: 'A', dailyReturns: [0.01, -0.02, 0.03] })],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.rollingCorrData).toEqual([]);
  });

  it('tickers 为空时 tickerNames 为空数组', () => {
    const result = createAssetAnalysisResult({ tickers: [] });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.tickerNames).toEqual([]);
  });

  it('tickers 未定义时使用空数组默认值', () => {
    const result = createAssetAnalysisResult({ tickers: undefined as unknown as [] });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.tickers).toEqual([]);
    expect(hook.current.tickerNames).toEqual([]);
  });

  it('tickers 为 null 时使用空数组默认值', () => {
    const result = createAssetAnalysisResult({ tickers: null as unknown as [] });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.tickerNames).toEqual([]);
  });

  it('growthData 按键值合并并按日期排序', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          growthCurve: [
            { date: '2024-01-02', value: 100 },
            { date: '2024-01-01', value: 90 },
          ],
        }),
        createTicker({
          ticker: 'B',
          growthCurve: [
            { date: '2024-01-01', value: 200 },
            { date: '2024-01-02', value: 210 },
          ],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.growthData).toHaveLength(2);
    expect(hook.current.growthData[0].date).toBe('2024-01-01');
    expect(hook.current.growthData[0].A).toBe(90);
    expect(hook.current.growthData[0].B).toBe(200);
    expect(hook.current.growthData[1].date).toBe('2024-01-02');
    expect(hook.current.growthData[1].A).toBe(100);
    expect(hook.current.growthData[1].B).toBe(210);
  });

  it('growthData 中 growthCurve 为 undefined 时使用空数组', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          growthCurve: undefined as unknown as [],
          drawdownCurve: undefined as unknown as [],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.growthData).toEqual([]);
  });

  it('betaMatrix 为 1x1 对角矩阵（单资产）', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          dailyReturns: [0.01, -0.02, 0.03],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.betaMatrix).toEqual([[1]]);
  });

  it('betaMatrix 对角线元素均为 1', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({ ticker: 'A', dailyReturns: [1, 2, 3, 4, 5] }),
        createTicker({ ticker: 'B', dailyReturns: [5, 4, 3, 2, 1] }),
        createTicker({ ticker: 'C', dailyReturns: [2, 2, 3, 3, 4] }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    const m = hook.current.betaMatrix;
    for (let i = 0; i < 3; i++) {
      expect(m[i][i]).toBe(1);
    }
  });

  it('betaMatrix 随 tickers 依赖更新', () => {
    const r1 = createAssetAnalysisResult({
      tickers: [createTicker({ ticker: 'A', dailyReturns: [1, 2] })],
    });
    const r2 = createAssetAnalysisResult({
      tickers: [
        createTicker({ ticker: 'A', dailyReturns: [1, 2] }),
        createTicker({ ticker: 'B', dailyReturns: [3, 4] }),
      ],
    });
    const { result: hook, rerender } = renderHook(
      ({ data }: { data: AssetAnalysisResult }) => useAnalysisData(data, 12, 60),
      { initialProps: { data: r1 } },
    );
    expect(hook.current.betaMatrix).toHaveLength(1);
    rerender({ data: r2 });
    expect(hook.current.betaMatrix).toHaveLength(2);
  });

  it('scatterData 提取 cagr 并乘以 100', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          statistics: { cagr: 0.1234 },
        }),
        createTicker({
          ticker: 'B',
          statistics: { cagr: 0.05678 },
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.scatterData).toEqual([
      { name: 'A', cagr: 12.34 },
      { name: 'B', cagr: 5.68 },
    ]);
  });

  it('scatterData 中 cagr 为 undefined 时默认 0', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          statistics: {},
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.scatterData).toEqual([{ name: 'A', cagr: 0 }]);
  });

  it('scatterData 中 statistics 为 undefined 时抛出异常（源缺陷）', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({ ticker: 'A', statistics: undefined as unknown as Record<string, number> }),
      ],
    });
    expect(() => renderHook(() => useAnalysisData(result, 12, 60))).toThrow();
  });

  it('rollingCorrData 使用 correlationWindow 计算窗口大小', () => {
    const dailyReturns = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.1));
    const growthDates = Array.from(
      { length: 50 },
      (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`,
    );
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          dailyReturns,
          growthCurve: growthDates.map((d) => ({ date: d, value: 100 })),
        }),
        createTicker({
          ticker: 'B',
          dailyReturns: dailyReturns.map((v) => -v),
          growthCurve: growthDates.map((d) => ({ date: d, value: 200 })),
        }),
      ],
    });
    const windowMonths = 1;
    const expectedWindow = Math.round((windowMonths * TRADING_DAYS_PER_YEAR) / 12);
    const { result: hook } = renderHook(() => useAnalysisData(result, windowMonths, 60));
    expect(hook.current.rollingCorrData.length).toBeGreaterThan(0);
    expect(hook.current.rollingCorrData.length).toBeLessThanOrEqual(50 - expectedWindow + 1);
  });

  it('portfolioResults 包含 name、growthCurve、drawdownCurve、statistics', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          growthCurve: [{ date: '2024-01-01', value: 100 }],
          drawdownCurve: [{ date: '2024-01-01', drawdown: -0.1 }],
          statistics: { cagr: 0.1 },
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.portfolioResults).toHaveLength(1);
    expect(hook.current.portfolioResults[0].name).toBe('A');
    expect(hook.current.portfolioResults[0].growthCurve).toEqual([
      { date: '2024-01-01', value: 100 },
    ]);
    expect(hook.current.portfolioResults[0].drawdownCurve).toEqual([
      { date: '2024-01-01', drawdown: -0.1 },
    ]);
    expect(hook.current.portfolioResults[0].statistics).toEqual({ cagr: 0.1 });
  });

  it('portfolioResults 缺失字段时使用空默认值', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          growthCurve: undefined as unknown as [],
          drawdownCurve: undefined as unknown as [],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.portfolioResults[0].growthCurve).toEqual([]);
    expect(hook.current.portfolioResults[0].drawdownCurve).toEqual([]);
  });
});
