import { vi } from 'vitest';
import type { PortfolioResult } from '../../packages/shared/types/backtest.js';
import { useBacktestStore } from '../../packages/frontend/src/store/backtestStore.js';
import { mockPortfolio, mockBacktestParams, mockPortfolioResult } from './storeFixtures.js';

type MockFetch = ReturnType<typeof vi.fn>;

export function resetBacktestStoreState(mockFetch: MockFetch): void {
  mockFetch.mockReset();
  useBacktestStore.getState().loadFromShare({
    portfolios: [mockPortfolio()],
    parameters: mockBacktestParams(),
  });
}

export function mockFetchOnce(mockFetch: MockFetch, payload: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

export function mockFetchHttpError(mockFetch: MockFetch, status: number, payload?: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: payload ? () => Promise.resolve(payload) : undefined,
  });
}

export function mockFetchReject(mockFetch: MockFetch, error: unknown): void {
  mockFetch.mockRejectedValueOnce(error);
}

export function emptySuccessResponse(): unknown {
  return {
    success: true,
    data: { portfolios: [], correlations: [], benchmarkGrowth: [] },
  };
}

export function setSinglePortfolioResult(overrides: Partial<PortfolioResult> = {}): void {
  setResultsWith([mockPortfolioResult(overrides)]);
}

export function setResultsWith(portfolios: PortfolioResult[]): void {
  useBacktestStore.setState({
    results: { portfolios, correlations: [], benchmarkGrowth: [] },
  });
}
