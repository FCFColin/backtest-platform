import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockSetTokens: vi.fn(),
  mockClearTokens: vi.fn(),
  mockRefreshTokens: vi.fn(),
  mockFetch: vi.fn(),
}));
vi.mock('../../../packages/frontend/src/utils/apiClient.js', () => ({
  apiFetch: mocks.mockApiFetch,
  setTokens: mocks.mockSetTokens,
  clearTokens: mocks.mockClearTokens,
  refreshTokens: mocks.mockRefreshTokens,
}));
globalThis.fetch = mocks.mockFetch;

import { useAuthStore } from '../../../packages/frontend/src/store/authStore.js';

const mockUser = (overrides: Record<string, unknown> = {}) => ({
  userId: 'u1',
  role: 'admin',
  tenantId: 't1',
  orgRole: 'owner',
  platformAdmin: false,
  ...overrides,
});
const mockOrg = (overrides: Record<string, unknown> = {}) => ({
  orgId: 'o1',
  name: 'Org',
  slug: 'org',
  plan: 'free',
  status: 'active',
  role: 'owner',
  ...overrides,
});
const mockFetchRes = (ok: boolean, data: unknown, detail?: string) => ({
  ok,
  json: async () => (ok ? { success: true, data } : { success: false, detail: detail ?? 'error' }),
});
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
      useAuthStore.setState({ user: mockUser() });
      expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    });
  });

  describe('init', () => {
    it('refreshTokens 返回 false 时直接标记 initialized 且不调用 fetchMe', async () => {
      mocks.mockRefreshTokens.mockResolvedValue(false);
      await useAuthStore.getState().init();
      expect(useAuthStore.getState().initialized).toBe(true);
      expect(mocks.mockApiFetch).not.toHaveBeenCalled();
    });
    it('refreshTokens 返回 true 时应尝试 fetchMe', async () => {
      mocks.mockRefreshTokens.mockResolvedValue(true);
      mocks.mockApiFetch.mockResolvedValue(mockFetchRes(true, mockUser()));
      await useAuthStore.getState().init();
      expect(useAuthStore.getState().initialized).toBe(true);
      expect(useAuthStore.getState().user?.userId).toBe('u1');
    });
    it('已初始化时应直接返回', async () => {
      useAuthStore.setState({ initialized: true });
      await useAuthStore.getState().init();
      expect(mocks.mockRefreshTokens).not.toHaveBeenCalled();
    });
    it('refreshTokens 失败时仍应标记 initialized', async () => {
      mocks.mockRefreshTokens.mockResolvedValue(false);
      await useAuthStore.getState().init();
      expect(useAuthStore.getState().initialized).toBe(true);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('loginPassword', () => {
    it('成功登录应 setTokens 并设置 user', async () => {
      mocks.mockFetch.mockResolvedValue(mockFetchRes(true, { accessToken: 'at', org: mockOrg() }));
      mocks.mockApiFetch.mockResolvedValue(mockFetchRes(true, mockUser()));
      const ok = await useAuthStore.getState().loginPassword('testuser', 'pass123');
      expect(ok).toBe(true);
      expect(mocks.mockSetTokens).toHaveBeenCalledWith('at');
      expect(useAuthStore.getState().user?.userId).toBe('u1');
      expect(useAuthStore.getState().loading).toBe(false);
      expect(useAuthStore.getState().error).toBeNull();
    });
    it('登录失败应设置 error 并返回 false', async () => {
      mocks.mockFetch.mockResolvedValue(mockFetchRes(false, null, '用户名或密码错误'));
      const ok = await useAuthStore.getState().loginPassword('bad', 'wrong');
      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('用户名或密码错误');
    });
    it('无 accessToken 时应返回 false', async () => {
      mocks.mockFetch.mockResolvedValue(mockFetchRes(true, {}));
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
    const regBody = { username: 'newuser', password: 'pass', email: 'a@b.com', orgName: 'MyOrg' };
    it('成功注册应返回 true', async () => {
      mocks.mockFetch.mockResolvedValue(mockFetchRes(true, null));
      expect(await useAuthStore.getState().register(regBody)).toBe(true);
    });
    it('注册失败应返回 false', async () => {
      mocks.mockFetch.mockResolvedValue(mockFetchRes(false, null, '用户名已存在'));
      const ok = await useAuthStore.getState().register({ ...regBody, username: 'dup' });
      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('用户名已存在');
    });
    it('catch 异常时应返回 false', async () => {
      mocks.mockFetch.mockRejectedValue(new Error('网络错误'));
      expect(await useAuthStore.getState().register({ ...regBody, username: 'u' })).toBe(false);
    });
  });

  describe('logout', () => {
    it('应调用服务端撤销并清空本地状态', async () => {
      useAuthStore.setState({ user: mockUser(), org: mockOrg() });
      await useAuthStore.getState().logout();
      expect(mocks.mockClearTokens).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
    });
    it('logout 应始终调用服务端并清除状态', async () => {
      mocks.mockFetch.mockResolvedValue({ ok: true });
      await useAuthStore.getState().logout();
      expect(mocks.mockFetch).toHaveBeenCalled();
      expect(mocks.mockClearTokens).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
    });
    it('服务端撤销失败时也应清除本地状态', async () => {
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
      mocks.mockApiFetch.mockResolvedValue(mockFetchRes(true, { orgs, activeOrgId: 'o1' }));
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
      mocks.mockApiFetch.mockResolvedValueOnce(
        mockFetchRes(true, {
          accessToken: 'new-at',
          org: mockOrg({ orgId: 'o2', name: 'B', slug: 'b', plan: 'pro', role: 'member' }),
        }),
      );
      mocks.mockApiFetch.mockResolvedValueOnce(
        mockFetchRes(true, mockUser({ role: 'member', tenantId: 'o2', orgRole: 'member' })),
      );
      const ok = await useAuthStore.getState().switchOrg('o2');
      expect(ok).toBe(true);
      expect(mocks.mockSetTokens).toHaveBeenCalledWith('new-at');
    });
    it('切换失败应返回 false', async () => {
      mocks.mockApiFetch.mockResolvedValue(mockFetchRes(false, null, '无权切换'));
      expect(await useAuthStore.getState().switchOrg('o2')).toBe(false);
    });
    it('无 accessToken 时应返回 false', async () => {
      mocks.mockApiFetch.mockResolvedValue(mockFetchRes(true, {}));
      expect(await useAuthStore.getState().switchOrg('o2')).toBe(false);
    });
    it('catch 异常时应返回 false', async () => {
      mocks.mockApiFetch.mockRejectedValue(new Error('网络错误'));
      expect(await useAuthStore.getState().switchOrg('o2')).toBe(false);
    });
  });

  describe('acceptInvite', () => {
    it('接受邀请成功后应加载组织列表', async () => {
      mocks.mockApiFetch.mockResolvedValueOnce(mockFetchRes(true, { orgId: 'o3' }));
      mocks.mockApiFetch.mockResolvedValueOnce(mockFetchRes(true, { orgs: [], activeOrgId: null }));
      const result = await useAuthStore.getState().acceptInvite('token123');
      expect(result.ok).toBe(true);
      expect(result.orgId).toBe('o3');
    });
    it('接受失败应返回 ok: false', async () => {
      mocks.mockApiFetch.mockResolvedValue(mockFetchRes(false, null, '邀请已过期'));
      expect((await useAuthStore.getState().acceptInvite('expired')).ok).toBe(false);
    });
    it('catch 异常时应返回 ok: false', async () => {
      mocks.mockApiFetch.mockRejectedValue(new Error('网络错误'));
      expect((await useAuthStore.getState().acceptInvite('fail')).ok).toBe(false);
    });
  });
});
