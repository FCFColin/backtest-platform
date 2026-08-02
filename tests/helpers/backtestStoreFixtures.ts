import { vi } from 'vitest';
import type { PortfolioResult } from '../../packages/shared/types/backtest.js';
import { useBacktestStore } from '../../packages/frontend/src/store/backtestStore.js';
import { mockPortfolio, mockBacktestParams, mockPortfolioResult } from './storeFixtures.js';

type MockFetch = ReturnType<typeof vi.fn>;

/**
 * 重置 mockFetch 并加载默认 portfolio + params 到 store
 *
 * @param mockFetch - 测试文件顶部的 `const mockFetch = vi.fn();` 引用
 */
export function resetBacktestStoreState(mockFetch: MockFetch): void {
  mockFetch.mockReset();
  useBacktestStore.getState().loadFromShare({
    portfolios: [mockPortfolio()],
    parameters: mockBacktestParams(),
  });
}

/**
 * mock fetch 一次性成功响应
 *
 * @param mockFetch - 测试文件顶部的 mockFetch 引用
 * @param payload - json() 返回值
 */
export function mockFetchOnce(mockFetch: MockFetch, payload: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

/**
 * mock fetch 一次性 HTTP 错误
 *
 * @param mockFetch - 测试文件顶部的 mockFetch 引用
 * @param status - HTTP 状态码
 * @param payload - 可选 json() 返回值
 */
export function mockFetchHttpError(mockFetch: MockFetch, status: number, payload?: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: payload ? () => Promise.resolve(payload) : undefined,
  });
}

/**
 * mock fetch 一次性 reject
 *
 * @param mockFetch - 测试文件顶部的 mockFetch 引用
 * @param error - reject 的错误值
 */
export function mockFetchReject(mockFetch: MockFetch, error: unknown): void {
  mockFetch.mockRejectedValueOnce(error);
}

export function emptySuccessResponse(): unknown {
  return {
    success: true,
    data: { portfolios: [], correlations: [], benchmarkGrowth: [] },
  };
}

/**
 * 设置单 portfolio 结果（用于 enrichSeries 测试）
 *
 * @param overrides - 覆盖 mockPortfolioResult 默认字段
 */
export function setSinglePortfolioResult(overrides: Partial<PortfolioResult> = {}): void {
  setResultsWith([mockPortfolioResult(overrides)]);
}

/**
 * 设置多 portfolio 结果（用于 enrichSeries 测试）
 *
 * @param portfolios - portfolio 结果数组
 */
export function setResultsWith(portfolios: PortfolioResult[]): void {
  useBacktestStore.getState().setResults({
    portfolios,
    correlations: [],
    benchmarkGrowth: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}
