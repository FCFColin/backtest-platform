import { vi } from 'vitest';
// ε-3 预留夹具入口：当前仅 2 辅助供测试组装使用（R-13 合规：实态=预留，非在线体系）
export const mkApp = () => ({
  db: {
    query: vi.fn(),
    withTenant: vi.fn((_t: string, fn: (c: unknown) => Promise<unknown>) => fn({ query: vi.fn() })),
  },
  reset: () => vi.clearAllMocks(),
});
export const resetTestKit = () => vi.clearAllMocks();
