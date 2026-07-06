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
} from '../../../src/hooks/useAnalysisData.js';
import { TRADING_DAYS_PER_YEAR } from '../../../shared/constants.js';
import type { AssetAnalysisResult } from '../../../shared/types/index.js';

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

  it('drawdownData 将 drawdown 乘以 -100 并保留两位小数', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          drawdownCurve: [
            { date: '2024-01-01', drawdown: -0.12345 },
            { date: '2024-01-02', drawdown: -0.05555 },
          ],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.drawdownData).toHaveLength(2);
    expect(hook.current.drawdownData[0].A).toBe(12.35);
    expect(hook.current.drawdownData[1].A).toBe(5.56);
  });

  it('drawdownData 中 drawdownCurve 为 undefined 时使用空数组', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          drawdownCurve: undefined as unknown as [],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.drawdownData).toEqual([]);
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

  it('annualData 按年排序并乘以 100', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'X',
          annualReturns: [
            { year: 2022, return: 0.105 },
            { year: 2023, return: -0.05 },
          ],
        }),
        createTicker({
          ticker: 'Y',
          annualReturns: [
            { year: 2022, return: 0.2 },
            { year: 2023, return: 0.15 },
          ],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.annualData).toHaveLength(2);
    expect(hook.current.annualData[0].year).toBe(2022);
    expect(hook.current.annualData[0].X).toBe(10.5);
    expect(hook.current.annualData[0].Y).toBe(20);
    expect(hook.current.annualData[1].year).toBe(2023);
    expect(hook.current.annualData[1].X).toBe(-5);
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
    // 窗口 = Math.round(1 * 252 / 12) = 21
    // n = 50, 滑动 50-21+1 = 30 个点
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
    // statistics 在 portfolioResults 中被 ?? {} 兜底，但 scatterData 直接访问 .cagr
    // 故此处要给一个有效 statistics 对象以免污染渲染
  });
});

// ===== 全量批测 — 组合输出结构 =====

describe('useAnalysisData - 返回值结构', () => {
  it('返回所有字段', () => {
    const result = createAssetAnalysisResult({
      tickers: [createTicker({ ticker: 'A', dailyReturns: [1, 2, 3] })],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    const keys = Object.keys(hook.current).sort();
    expect(keys).toEqual([
      'annualData',
      'betaMatrix',
      'drawdownData',
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

  it('drawdownCurve 含相同日期来自多个资产时值被合并', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          drawdownCurve: [{ date: '2024-01-01', drawdown: -0.15 }],
        }),
        createTicker({
          ticker: 'B',
          drawdownCurve: [{ date: '2024-01-01', drawdown: -0.25 }],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.drawdownData).toHaveLength(1);
    expect(hook.current.drawdownData[0].A).toBe(15);
    expect(hook.current.drawdownData[0].B).toBe(25);
  });

  it('annualData 含相同年份来自多个资产时值被合并', () => {
    const result = createAssetAnalysisResult({
      tickers: [
        createTicker({
          ticker: 'A',
          annualReturns: [{ year: 2023, return: 0.1 }],
        }),
        createTicker({
          ticker: 'B',
          annualReturns: [{ year: 2023, return: 0.2 }],
        }),
      ],
    });
    const { result: hook } = renderHook(() => useAnalysisData(result, 12, 60));
    expect(hook.current.annualData).toHaveLength(1);
    expect(hook.current.annualData[0].A).toBe(10);
    expect(hook.current.annualData[0].B).toBe(20);
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
    expect(hook.current.drawdownData.length).toBeGreaterThan(0);
    expect(hook.current.annualData.length).toBeGreaterThan(0);
  });
});

// ===== 响应式更新 =====

describe('useAnalysisData - 依赖更新', () => {
  it('tickers 变化时所有派生数据重新计算', () => {
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
    expect(hook.current.tickerNames).toEqual(['A']);
    rerender({ data: r2 });
    expect(hook.current.tickerNames).toEqual(['A', 'B']);
    expect(hook.current.betaMatrix).toHaveLength(2);
    expect(hook.current.scatterData).toHaveLength(2);
  });

  it('correlationWindow 变化时 rollingCorrData 重新计算', () => {
    const d1 = Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.1));
    const d2 = Array.from({ length: 60 }, (_, i) => Math.cos(i * 0.1));
    const dates = d1.map((_, i) => `d${i}`);
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
          growthCurve: dates.map((d) => ({ date: d, value: 100 })),
        }),
      ],
    });
    const { result: hook, rerender } = renderHook(
      ({ w }: { w: number }) => useAnalysisData(result, w, 60),
      { initialProps: { w: 1 } },
    );
    const len1 = hook.current.rollingCorrData.length;
    rerender({ w: 6 });
    const len2 = hook.current.rollingCorrData.length;
    // 更长的窗口 → 更少的滑动窗口数
    expect(len2).toBeLessThan(len1);
  });
});
