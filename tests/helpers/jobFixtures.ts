import { vi } from 'vitest';

export function createMockJob(overrides: Record<string, unknown> = {}) {
  const { state, ...rest } = overrides;
  return {
    id: 'job-123',
    data: { type: 'optimizer' },
    timestamp: 1700000000000,
    processedOn: 1700000001000,
    finishedOn: 1700000005000,
    returnvalue: undefined,
    failedReason: undefined,
    progress: 0,
    getState: vi.fn().mockResolvedValue(state ?? 'completed'),
    ...rest,
  };
}
