import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  getAccessToken,
  setTokens,
  clearTokens,
  refreshTokens,
} from '../../../packages/frontend/src/utils/apiClient.js';

const originalFetch = globalThis.fetch;

function mockRefresh(ok: boolean, body: Record<string, unknown> = {}) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok, json: async () => body });
}

describe('authTokens', () => {
  beforeEach(() => {
    clearTokens();
    vi.clearAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getAccessToken / setTokens', () => {
    it('初始 accessToken 应为空字符串', () => {
      expect(getAccessToken()).toBe('');
    });
    it('setTokens(access) 应仅保存 access token 到内存', () => {
      setTokens('abc123');
      expect(getAccessToken()).toBe('abc123');
    });
  });

  it('clearTokens 应清空内存中的 access token', () => {
    setTokens('at');
    clearTokens();
    expect(getAccessToken()).toBe('');
  });

  describe('refreshTokens', () => {
    it('应使用 POST + credentials:include 调用 /api/v1/auth/refresh，且不发送 body', async () => {
      mockRefresh(true, { success: true, data: { accessToken: 'new-at' } });
      await refreshTokens();
      const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/api/v1/auth/refresh');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(init.body).toBeUndefined();
    });

    it('成功 (200 + data.accessToken) 应更新 access token 并返回 true', async () => {
      mockRefresh(true, { success: true, data: { accessToken: 'new-at' } });
      setTokens('old-at');
      expect(await refreshTokens()).toBe(true);
      expect(getAccessToken()).toBe('new-at');
    });

    it('失败 (非 200) 应 clearTokens 并返回 false', async () => {
      mockRefresh(false, { success: false });
      setTokens('old-at');
      expect(await refreshTokens()).toBe(false);
      expect(getAccessToken()).toBe('');
    });

    it('网络异常应返回 false 但不清空令牌', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));
      setTokens('old-at');
      expect(await refreshTokens()).toBe(false);
      expect(getAccessToken()).toBe('old-at');
    });

    it('响应缺少 data.accessToken 应 clearTokens 并返回 false', async () => {
      mockRefresh(true, { success: true });
      setTokens('old-at');
      expect(await refreshTokens()).toBe(false);
      expect(getAccessToken()).toBe('');
    });

    it('并发刷新请求应去重（只发起一次 fetch）', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return { ok: true, json: async () => ({ success: true, data: { accessToken: 'new-at' } }) };
      });
      setTokens('old-at');
      const [r1, r2] = await Promise.all([refreshTokens(), refreshTokens()]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(callCount).toBe(1);
    });
  });
});
