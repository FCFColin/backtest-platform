import { vi } from 'vitest';
import { engineMocks } from './engineFixture.js';

vi.mock('../../packages/backend/src/utils/engineClient.js', () => engineMocks);

const dataFacadeMocksInternal = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

export const dataFacadeMocks = dataFacadeMocksInternal;

vi.mock('../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataFacadeMocksInternal.fetchHistoryData,
}));

export const mockEngine = (result: unknown) =>
  engineMocks.callEngineStrict.mockResolvedValue(result);

export const mockFetchHistoryData = (data: unknown, degraded = false) => {
  dataFacadeMocksInternal.fetchHistoryData.mockResolvedValue({ data, degraded });
};

export const resetAppServiceMocks = () => {
  vi.clearAllMocks();
  dataFacadeMocksInternal.fetchHistoryData.mockReset();
};
