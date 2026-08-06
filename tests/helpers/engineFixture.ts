import { vi } from 'vitest';
import { EngineUnavailableErrorStub } from './backtestRoutesFixtures.js';

const internalMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
}));

export const engineMocks = internalMocks;

export const engineModuleMock = {
  callEngineStrict: internalMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
  resetEngineAvailability: vi.fn(),
  unwrapEngineData: <T>(r: unknown): T => ((r as { data?: T })?.data ?? r) as T,
};
