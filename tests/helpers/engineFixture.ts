import { vi } from 'vitest';

const engineModuleMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
  EngineUnavailableError: class EngineUnavailableError extends Error {
    readonly retryAfterSeconds = 30;
    readonly code = 'ENGINE_UNAVAILABLE';
    constructor(endpoint = 'engine') {
      super(`计算引擎暂不可用（${endpoint}），请稍后重试`);
      this.name = 'EngineUnavailableError';
    }
  },
}));

export const engineMocks = engineModuleMocks;
export const engineModuleMock = engineModuleMocks;
