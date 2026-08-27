import { vi } from 'vitest';
export const mkApp = () => ({ db: { query: vi.fn(), withTenant: vi.fn((t: string, fn: (c: unknown) => Promise<unknown>) => fn({ query: vi.fn() })) }, reset: () => vi.clearAllMocks() });
export const resetTestKit = () => vi.clearAllMocks();
