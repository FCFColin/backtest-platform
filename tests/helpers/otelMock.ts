import { vi } from 'vitest';

export function mockOtelApi() {
  const noopSpan = {
    setAttribute: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  return {
    trace: {
      getTracer: () => ({
        startActiveSpan: async <T>(_name: string, fn: (span: typeof noopSpan) => Promise<T>) =>
          fn(noopSpan),
      }),
    },
  };
}
