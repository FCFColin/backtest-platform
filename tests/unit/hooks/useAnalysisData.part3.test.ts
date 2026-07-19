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
