import { vi } from 'vitest';

const engineModuleMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
  EngineUnavailableError: class EngineUnavailableError extends Error {
    readonly retryAfterSeconds: number;
    readonly code = 'ENGINE_UNAVAILABLE';
    constructor(endpoint = 'engine', retryAfterSeconds = 30) {
      super(`计算引擎暂不可用（${endpoint}），请稍后重试`);
      this.name = 'EngineUnavailableError';
      this.retryAfterSeconds = retryAfterSeconds;
    }
  },
}));

export const engineMocks = engineModuleMocks;
export const EngineUnavailableErrorStub = engineModuleMocks.EngineUnavailableError;
