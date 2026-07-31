import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('react', () => ({ useMemo: <T>(fn: () => T): T => fn() }));

import { useAnalysisData } from '../../../packages/frontend/src/hooks/useAnalysisData.js';
import { TRADING_DAYS_PER_YEAR } from '../../../packages/shared/constants.js';
import type { AssetAnalysisResult } from '../../../packages/shared/types/index.js';

function mkTicker(o: Record<string, unknown> = {}) {
  return { ticker: 'A', growthCurve: [], drawdownCurve: [], dailyReturns: [], annualReturns: [], monthlyReturns: [], rollingReturns: [], statistics: {}, ...o };
}
const mkResult = (t: ReturnType<typeof mkTicker>[] = []): AssetAnalysisResult => ({ tickers: t, correlations: [] });
const run = (r: AssetAnalysisResult, w = 12, b = 60) => renderHook(() => useAnalysisData(r, w, b)).result.current;
const range = (n: number, fn: (i: number) => number) => Array.from({ length: n }, (_, i) => fn(i));
const dates = (n: number, p = 'd') => Array.from({ length: n }, (_, i) => `${p}${i}`);

describe('useAnalysisData', () => {
  it.each([
    ['single asset', [mkTicker({ ticker: 'A', dailyReturns: [0.01, -0.02, 0.03] })]],
    ['empty tickers', []],
  ])('rollingCorrData 为空 when %s', (_n, t) => { expect(run(mkResult(t)).rollingCorrData).toEqual([]); });

  it.each([['undefined', undefined], ['null', null]])('tickers 为 %s 时使用空数组默认值', (_n, t) => {
    const h = run({ tickers: t, correlations: [] } as AssetAnalysisResult);
    expect(h.tickers).toEqual([]);
    expect(h.tickerNames).toEqual([]);
  });

  it('growthData 按键值合并并按日期排序', () => {
    const h = run(mkResult([
      mkTicker({ ticker: 'A', growthCurve: [{ date: '2024-01-02', value: 100 }, { date: '2024-01-01', value: 90 }] }),
      mkTicker({ ticker: 'B', growthCurve: [{ date: '2024-01-01', value: 200 }, { date: '2024-01-02', value: 210 }] }),
    ]));
    expect(h.growthData).toHaveLength(2);
    expect(h.growthData[0]).toMatchObject({ date: '2024-01-01', A: 90, B: 200 });
    expect(h.growthData[1]).toMatchObject({ date: '2024-01-02', A: 100, B: 210 });
  });

  it.each([
    ['growthCurve undefined', 'growthData', []],
    ['portfolioResults 缺失字段', 'portfolioResults', { growthCurve: [], drawdownCurve: [] }],
  ])('缺失字段时使用空默认值: %s', (_n, field, expected) => {
    const h = run(mkResult([mkTicker({ ticker: 'A', growthCurve: undefined, drawdownCurve: undefined })]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (field === 'growthData') expect((h as any)[field]).toEqual(expected);
    else expect(h.portfolioResults[0]).toMatchObject(expected);
  });

  it.each([
    ['1x1 对角矩阵（单资产）', [mkTicker({ ticker: 'A', dailyReturns: [0.01, -0.02, 0.03] })], 1],
    ['3x3 对角线为 1', [mkTicker({ ticker: 'A', dailyReturns: [1, 2, 3, 4, 5] }), mkTicker({ ticker: 'B', dailyReturns: [5, 4, 3, 2, 1] }), mkTicker({ ticker: 'C', dailyReturns: [2, 2, 3, 3, 4] })], 3],
  ])('betaMatrix %s', (_n, t, size) => {
    const m = run(mkResult(t)).betaMatrix;
    expect(m).toHaveLength(size);
    for (let i = 0; i < size; i++) expect(m[i][i]).toBe(1);
  });

  it.each([
    ['正常 cagr', { cagr: 0.1234 }, 12.34],
    ['cagr 为 undefined', {}, 0],
  ])('scatterData %s', (_n, stats, expected) => {
    expect(run(mkResult([mkTicker({ ticker: 'A', statistics: stats })])).scatterData).toEqual([{ name: 'A', cagr: expected }]);
  });

  it('scatterData 中 statistics 为 undefined 时抛出异常（源缺陷）', () => {
    expect(() => run(mkResult([mkTicker({ ticker: 'A', statistics: undefined })]))).toThrow();
  });

  it('rollingCorrData 使用 correlationWindow 计算窗口大小', () => {
    const dr = range(50, (i) => Math.sin(i * 0.1));
    const dt = dates(50, '2024-01-');
    const rcorr = run(mkResult([
      mkTicker({ ticker: 'A', dailyReturns: dr, growthCurve: dt.map((d) => ({ date: d, value: 100 })) }),
      mkTicker({ ticker: 'B', dailyReturns: dr.map((v) => -v), growthCurve: dt.map((d) => ({ date: d, value: 200 })) }),
    ]), 1).rollingCorrData;
    expect(rcorr.length).toBeGreaterThan(0);
    expect(rcorr.length).toBeLessThanOrEqual(50 - Math.round(TRADING_DAYS_PER_YEAR / 12) + 1);
  });

  it('portfolioResults 包含 name、growthCurve、drawdownCurve、statistics', () => {
    const curve = [{ date: '2024-01-01', value: 100 }];
    const dd = [{ date: '2024-01-01', drawdown: -0.1 }];
    expect(run(mkResult([mkTicker({ ticker: 'A', growthCurve: curve, drawdownCurve: dd, statistics: { cagr: 0.1 } })])).portfolioResults[0]).toMatchObject({ name: 'A', growthCurve: curve, drawdownCurve: dd, statistics: { cagr: 0.1 } });
  });

  it('返回所有字段', () => {
    const keys = Object.keys(run(mkResult([mkTicker({ ticker: 'A', dailyReturns: [1, 2, 3] })]))).sort();
    expect(keys).toEqual(['betaMatrix', 'growthData', 'portfolioResults', 'rollingCorrData', 'scatterData', 'tickerNames', 'tickers']);
  });

  it('多资产时 rollingCorrData 返回数据', () => {
    const n = 60;
    const dt = dates(n);
    const rcorr = run(mkResult([
      mkTicker({ ticker: 'A', dailyReturns: range(n, (i) => Math.sin(i * 0.2)), growthCurve: dt.map((d) => ({ date: d, value: 100 })) }),
      mkTicker({ ticker: 'B', dailyReturns: range(n, (i) => Math.cos(i * 0.2)), growthCurve: dt.map((d) => ({ date: d, value: 200 })) }),
    ]), 1).rollingCorrData;
    expect(rcorr.length).toBeGreaterThan(0);
    for (const pt of rcorr) { expect(pt).toHaveProperty('date'); expect(pt).toHaveProperty('value'); expect(typeof pt.value).toBe('number'); }
  });

  it('所有 dailyReturns 为常数时 rollingCorrData 全部为 0', () => {
    const dr = Array.from({ length: 50 }, () => 0.01);
    const dt = dates(50);
    for (const pt of run(mkResult([
      mkTicker({ ticker: 'A', dailyReturns: dr, growthCurve: dt.map((d) => ({ date: d, value: 100 })) }),
      mkTicker({ ticker: 'B', dailyReturns: dr, growthCurve: dt.map((d) => ({ date: d, value: 100 })) }),
    ])).rollingCorrData) expect(pt.value).toBe(0);
  });

  it('growthCurve 含相同日期来自多个资产时值被合并', () => {
    const gd = run(mkResult([
      mkTicker({ ticker: 'A', growthCurve: [{ date: '2024-01-01', value: 10 }] }),
      mkTicker({ ticker: 'B', growthCurve: [{ date: '2024-01-01', value: 20 }] }),
    ])).growthData;
    expect(gd).toHaveLength(1);
    expect(gd[0]).toMatchObject({ A: 10, B: 20 });
  });

  it('tickers 包含 10 个资产时仍能正常计算', () => {
    const h = run(mkResult(range(10, (i) => mkTicker({
      ticker: `T${i}`, dailyReturns: range(20, (j) => Math.sin(j + i)),
      growthCurve: range(20, (j) => ({ date: `d${j}`, value: 100 + i })),
      drawdownCurve: range(20, (j) => ({ date: `d${j}`, drawdown: -0.01 * i })),
      annualReturns: [{ year: 2023, return: 0.1 * i }], statistics: { cagr: 0.05 * i },
    }))));
    expect(h.tickerNames).toHaveLength(10);
    expect(h.betaMatrix).toHaveLength(10);
    expect(h.scatterData).toHaveLength(10);
    expect(h.growthData.length).toBeGreaterThan(0);
  });

  it('tickers 变化时所有派生数据重新计算（含 betaMatrix 依赖更新）', () => {
    const r1 = mkResult([mkTicker({ ticker: 'A', dailyReturns: [1, 2] })]);
    const r2 = mkResult([mkTicker({ ticker: 'A', dailyReturns: [1, 2] }), mkTicker({ ticker: 'B', dailyReturns: [3, 4] })]);
    const { result, rerender } = renderHook(({ data }: { data: AssetAnalysisResult }) => useAnalysisData(data, 12, 60), { initialProps: { data: r1 } });
    expect(result.current.tickerNames).toEqual(['A']);
    expect(result.current.betaMatrix).toHaveLength(1);
    rerender({ data: r2 });
    expect(result.current.tickerNames).toEqual(['A', 'B']);
    expect(result.current.betaMatrix).toHaveLength(2);
    expect(result.current.scatterData).toHaveLength(2);
  });

  it('correlationWindow 变化时 rollingCorrData 重新计算', () => {
    const dt = dates(60);
    const r = mkResult([
      mkTicker({ ticker: 'A', dailyReturns: range(60, (i) => Math.sin(i * 0.1)), growthCurve: dt.map((d) => ({ date: d, value: 100 })) }),
      mkTicker({ ticker: 'B', dailyReturns: range(60, (i) => Math.cos(i * 0.1)), growthCurve: dt.map((d) => ({ date: d, value: 100 })) }),
    ]);
    const { result, rerender } = renderHook(({ w }: { w: number }) => useAnalysisData(r, w, 60), { initialProps: { w: 1 } });
    const len1 = result.current.rollingCorrData.length;
    rerender({ w: 6 });
    expect(result.current.rollingCorrData.length).toBeLessThan(len1);
  });
});