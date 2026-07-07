import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockSetTokens: vi.fn(),
  mockClearTokens: vi.fn(),
  mockGetRefreshToken: vi.fn(),
  mockRefreshTokens: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('../../../packages/frontend/src/utils/apiClient.js', () => ({
  apiFetch: mocks.mockApiFetch,
}));

vi.mock('../../../packages/frontend/src/utils/authTokens.js', () => ({
  setTokens: mocks.mockSetTokens,
  clearTokens: mocks.mockClearTokens,
  getRefreshToken: mocks.mockGetRefreshToken,
  refreshTokens: mocks.mockRefreshTokens,
}));

globalThis.fetch = mocks.mockFetch;

import { useAuthStore } from '../../../packages/frontend/src/store/authStore.js';

function resetState() {
  useAuthStore.setState({
    user: null,
    org: null,
    orgs: [],
    initialized: false,
    loading: false,
    error: null,
  });
}

describe('authStore', () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  describe('isAuthenticated', () => {
    it('无 user 时应返回 false', () => {
      expect(useAuthStore.getState().isAuthenticated()).toBe(false);
    });

    it('有 user 时应返回 true', () => {
      useAuthStore.setState({
        user: {
          userId: 'u1',
          role: 'admin',
          tenantId: 't1',
          orgRole: 'owner',
          platformAdmin: false,
        },
      });
      expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    });
  });

  describe('init', () => {
    it('无 refreshToken 时直接标记 initialized', async () => {
      mocks.mockGetRefreshToken.mockReturnValue('');
      await useAuthStore.getState().init();
      expect(useAuthStore.getState().initialized).toBe(true);
      expect(mocks.mockRefreshTokens).not.toHaveBeenCalled();
    });

    it('有 refreshToken 且刷新成功时尝试 fetchMe', async () => {
      mocks.mockGetRefreshToken.mockReturnValue('rt-valid');
      mocks.mockRefreshTokens.mockResolvedValue(true);
      mocks.mockApiFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            userId: 'u1',
            role: 'admin',
            tenantId: 't1',
            orgRole: 'owner',
            platformAdmin: false,
          },
        }),
      });
      await useAuthStore.getState().init();

      const s = useAuthStore.getState();
      expect(s.initialized).toBe(true);
      expect(s.user?.userId).toBe('u1');
    });

    it('已初始化时应直接返回', async () => {
      useAuthStore.setState({ initialized: true });
      await useAuthStore.getState().init();
      expect(mocks.mockGetRefreshToken).not.toHaveBeenCalled();
    });

    it('refreshTokens 失败时仍应标记 initialized', async () => {
      mocks.mockGetRefreshToken.mockReturnValue('rt-expired');
      mocks.mockRefreshTokens.mockResolvedValue(false);
      await useAuthStore.getState().init();
      expect(useAuthStore.getState().initialized).toBe(true);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('loginPassword', () => {
    it('成功登录应 setTokens 并设置 user', async () => {
      mocks.mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            accessToken: 'at',
            refreshToken: 'rt',
            org: {
              orgId: 'o1',
              name: 'Org',
              slug: 'org',
              plan: 'free',
              status: 'active',
              role: 'owner',
            },
          },
        }),
      });
      mocks.mockApiFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            userId: 'u1',
            role: 'admin',
            tenantId: 't1',
            orgRole: 'owner',
            platformAdmin: false,
          },
        }),
      });

      const ok = await useAuthStore.getState().loginPassword('testuser', 'pass123');
      expect(ok).toBe(true);
      expect(mocks.mockSetTokens).toHaveBeenCalledWith('at', 'rt');
      expect(useAuthStore.getState().user?.userId).toBe('u1');
      expect(useAuthStore.getState().loading).toBe(false);
      expect(useAuthStore.getState().error).toBeNull();
    });

    it('登录失败应设置 error 并返回 false', async () => {
      mocks.mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, detail: '用户名或密码错误' }),
      });

      const ok = await useAuthStore.getState().loginPassword('bad', 'wrong');
      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('用户名或密码错误');
    });

    it('无 accessToken 时应返回 false', async () => {
      mocks.mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { refreshToken: 'rt' } }),
      });
      const ok = await useAuthStore.getState().loginPassword('u', 'p');
      expect(ok).toBe(false);
    });

    it('catch 异常时应返回 false', async () => {
      mocks.mockFetch.mockRejectedValue(new Error('网络错误'));
      const ok = await useAuthStore.getState().loginPassword('u', 'p');
      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toContain('网络错误');
    });
  });

  describe('register', () => {
    it('成功注册应返回 true', async () => {
      mocks.mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const ok = await useAuthStore.getState().register({
        username: 'newuser',
        password: 'pass',
        email: 'a@b.com',
        orgName: 'MyOrg',
      });
      expect(ok).toBe(true);
    });

    it('注册失败应返回 false', async () => {
      mocks.mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, detail: '用户名已存在' }),
      });

      const ok = await useAuthStore.getState().register({
        username: 'dup',
        password: 'pass',
        email: 'a@b.com',
        orgName: 'MyOrg',
      });
      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('用户名已存在');
    });

    it('catch 异常时应返回 false', async () => {
      mocks.mockFetch.mockRejectedValue(new Error('网络错误'));
      const ok = await useAuthStore.getState().register({
        username: 'u',
        password: 'p',
        email: 'a@b.com',
        orgName: 'O',
      });
      expect(ok).toBe(false);
    });
  });

  describe('logout', () => {
    it('应调用服务端撤销并清空本地状态', async () => {
      mocks.mockGetRefreshToken.mockReturnValue('rt-logout');
      useAuthStore.setState({
        user: {
          userId: 'u1',
          role: 'admin',
          tenantId: 't1',
          orgRole: 'owner',
          platformAdmin: false,
        },
        org: {
          orgId: 'o1',
          name: 'Org',
          slug: 'org',
          plan: 'free',
          status: 'active',
          role: 'owner',
        },
      });

      await useAuthStore.getState().logout();
      expect(mocks.mockClearTokens).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('无 refreshToken 时也应清除状态', async () => {
      mocks.mockGetRefreshToken.mockReturnValue('');
      await useAuthStore.getState().logout();
      expect(mocks.mockClearTokens).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('服务端撤销失败时也应清除本地状态', async () => {
      mocks.mockGetRefreshToken.mockReturnValue('rt');
      mocks.mockFetch.mockRejectedValue(new Error('网络错误'));
      await useAuthStore.getState().logout();
      expect(mocks.mockClearTokens).toHaveBeenCalled();
    });
  });

  describe('loadOrgs', () => {
    it('应加载组织列表并设置活跃组织', async () => {
      const orgs = [
        { orgId: 'o1', name: 'A', slug: 'a', plan: 'free', status: 'active', role: 'owner' },
        { orgId: 'o2', name: 'B', slug: 'b', plan: 'pro', status: 'active', role: 'member' },
      ];
      mocks.mockApiFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { orgs, activeOrgId: 'o1' },
        }),
      });

      await useAuthStore.getState().loadOrgs();
      expect(useAuthStore.getState().orgs).toHaveLength(2);
      expect(useAuthStore.getState().org?.orgId).toBe('o1');
    });

    it('响应 not ok 时应直接返回', async () => {
      mocks.mockApiFetch.mockResolvedValue({ ok: false });
      await useAuthStore.getState().loadOrgs();
      expect(useAuthStore.getState().orgs).toHaveLength(0);
    });

    it('catch 异常时应静默忽略', async () => {
      mocks.mockApiFetch.mockRejectedValue(new Error('网络错误'));
      await useAuthStore.getState().loadOrgs();
      expect(useAuthStore.getState().orgs).toHaveLength(0);
    });
  });

  describe('switchOrg', () => {
    it('切换成功后应更新 token 和 user', async () => {
      mocks.mockApiFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            accessToken: 'new-at',
            refreshToken: 'new-rt',
            org: {
              orgId: 'o2',
              name: 'B',
              slug: 'b',
              plan: 'pro',
              status: 'active',
              role: 'member',
            },
          },
        }),
      });
      mocks.mockApiFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            userId: 'u1',
            role: 'member',
            tenantId: 'o2',
            orgRole: 'member',
            platformAdmin: false,
          },
        }),
      });

      const ok = await useAuthStore.getState().switchOrg('o2');
      expect(ok).toBe(true);
      expect(mocks.mockSetTokens).toHaveBeenCalledWith('new-at', 'new-rt');
    });

    it('切换失败应返回 false', async () => {
      mocks.mockApiFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, detail: '无权切换' }),
      });

      const ok = await useAuthStore.getState().switchOrg('o2');
      expect(ok).toBe(false);
    });

    it('无 accessToken 时应返回 false', async () => {
      mocks.mockApiFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });
      const ok = await useAuthStore.getState().switchOrg('o2');
      expect(ok).toBe(false);
    });

    it('catch 异常时应返回 false', async () => {
      mocks.mockApiFetch.mockRejectedValue(new Error('网络错误'));
      const ok = await useAuthStore.getState().switchOrg('o2');
      expect(ok).toBe(false);
    });
  });

  describe('acceptInvite', () => {
    it('接受邀请成功后应加载组织列表', async () => {
      mocks.mockApiFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { orgId: 'o3' },
        }),
      });
      mocks.mockApiFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { orgs: [], activeOrgId: null } }),
      });

      const result = await useAuthStore.getState().acceptInvite('token123');
      expect(result.ok).toBe(true);
      expect(result.orgId).toBe('o3');
    });

    it('接受失败应返回 ok: false', async () => {
      mocks.mockApiFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, detail: '邀请已过期' }),
      });

      const result = await useAuthStore.getState().acceptInvite('expired');
      expect(result.ok).toBe(false);
    });

    it('catch 异常时应返回 ok: false', async () => {
      mocks.mockApiFetch.mockRejectedValue(new Error('网络错误'));
      const result = await useAuthStore.getState().acceptInvite('fail');
      expect(result.ok).toBe(false);
    });
  });
});
