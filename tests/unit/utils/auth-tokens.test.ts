import { describe, it, expect, vi, beforeEach } from 'vitest';

const STORAGE_KEY = 'bt_refresh_token';

let store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    store = {};
  }),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  refreshTokens,
} from '../../../packages/frontend/src/utils/authTokens.js';

const originalFetch = globalThis.fetch;

describe('authTokens', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getAccessToken / setTokens', () => {
    it('初始 accessToken 应为空', () => {
      expect(getAccessToken()).toBe('');
    });

    it('setTokens 应保存 accessToken 到内存', () => {
      setTokens('abc123', 'refresh-xyz');
      expect(getAccessToken()).toBe('abc123');
    });
  });

  describe('getRefreshToken', () => {
    it('未设置时应返回空字符串', () => {
      expect(getRefreshToken()).toBe('');
    });

    it('setTokens 应将 refreshToken 写入 localStorage', () => {
      setTokens('at', 'rt-123');
      expect(getRefreshToken()).toBe('rt-123');
      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'rt-123');
    });

    it('getRefreshToken 在 localStorage 异常时应返回空字符串', () => {
      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error('denied');
      });
      expect(getRefreshToken()).toBe('');
    });

    it('setTokens 在 localStorage 异常时应静默忽略', () => {
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('denied');
      });
      setTokens('at', 'rt');
      expect(getAccessToken()).toBe('at');
    });
  });

  describe('clearTokens', () => {
    it('应清空内存和 localStorage', () => {
      setTokens('at', 'rt');
      clearTokens();
      expect(getAccessToken()).toBe('');
      expect(getRefreshToken()).toBe('');
      expect(localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('clearTokens 在 localStorage 异常时应静默忽略', () => {
      mockLocalStorage.removeItem.mockImplementationOnce(() => {
        throw new Error('denied');
      });
      setTokens('at', 'rt');
      clearTokens();
      expect(getAccessToken()).toBe('');
    });
  });

  describe('refreshTokens', () => {
    it('应调用 /api/v1/auth/refresh 并更新令牌', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: 'new-at', refreshToken: 'new-rt' },
        }),
      });

      setTokens('old-at', 'old-rt');
      const result = await refreshTokens();

      expect(result).toBe(true);
      expect(getAccessToken()).toBe('new-at');
      expect(getRefreshToken()).toBe('new-rt');
    });

    it('刷新失败应 clearTokens 并返回 false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false }),
      });

      setTokens('old-at', 'old-rt');
      const result = await refreshTokens();

      expect(result).toBe(false);
      expect(getAccessToken()).toBe('');
      expect(getRefreshToken()).toBe('');
    });

    it('刷新异常应返回 false 但不清空令牌', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

      setTokens('old-at', 'old-rt');
      const result = await refreshTokens();

      expect(result).toBe(false);
      expect(getAccessToken()).toBe('old-at');
      expect(getRefreshToken()).toBe('old-rt');
    });

    it('无 refreshToken 时应返回 false', async () => {
      const result = await refreshTokens();
      expect(result).toBe(false);
    });

    it('响应缺少 data 时应 clearTokens 并返回 false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      setTokens('old-at', 'old-rt');
      const result = await refreshTokens();
      expect(result).toBe(false);
      expect(getAccessToken()).toBe('');
    });

    it('并发刷新请求应去重', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { accessToken: 'new-at', refreshToken: 'new-rt' },
          }),
        };
      });
      setTokens('old-at', 'old-rt');
      const [r1, r2] = await Promise.all([refreshTokens(), refreshTokens()]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(callCount).toBe(1);
    });
  });
});
