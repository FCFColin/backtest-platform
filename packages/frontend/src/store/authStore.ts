/**
 * 认证 / 多租户会话状态（ADR-034）
 *
 * 管理登录态、当前用户、活跃组织与可切换组织列表。令牌本身由 authTokens 模块持有
 * （access 内存、refresh localStorage）；本 store 只保存可展示的会话元数据，并暴露
 * 登录 / 登出 / 刷新会话 / 切换组织的动作供 UI 调用。
 */
import { create } from 'zustand';
import { apiFetch } from '@/utils/apiClient';
import { setTokens, clearTokens, getRefreshToken, refreshTokens } from '@/utils/authTokens';
import { asyncStart, asyncFail, asyncSuccess } from './utils/asyncSlice.js';

/** 组织摘要（与后端 orgSummary 对齐） */
interface OrgSummary {
  orgId: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  role: string;
}

/** 当前用户会话信息 */
interface AuthUser {
  userId: string;
  role: string;
  tenantId: string | null;
  orgRole: string | null;
  platformAdmin: boolean;
}

interface AuthState {
  user: AuthUser | null;
  org: OrgSummary | null;
  orgs: OrgSummary[];
  /** 是否已完成初始会话恢复（避免首屏闪烁） */
  initialized: boolean;
  loading: boolean;
  error: string | null;

  loginPassword: (username: string, password: string) => Promise<boolean>;
  /** 自助注册：创建用户 + 组织 + owner 成员，并触发验证邮件。成功不自动登录。 */
  register: (input: {
    username: string;
    password: string;
    email: string;
    orgName: string;
  }) => Promise<boolean>;
  /** 接受组织邀请（需已登录）。成功后刷新 orgs 列表。 */
  acceptInvite: (token: string) => Promise<{ ok: boolean; orgId?: string }>;
  logout: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<boolean>;
  loadOrgs: () => Promise<void>;
  /** 应用启动时调用：若 localStorage 有 refresh token 则尝试静默恢复会话 */
  init: () => Promise<void>;
  isAuthenticated: () => boolean;
}

type SetFn = (partial: Partial<AuthState> | ((state: AuthState) => Partial<AuthState>)) => void;
type GetFn = () => AuthState;

async function fetchMe(): Promise<AuthUser | null> {
  const res = await apiFetch('/api/v1/auth/me', { silent: true });
  if (!res.ok) return null;
  const body = await res.json();
  const d = body?.data;
  if (!d) return null;
  return {
    userId: d.userId,
    role: d.role,
    tenantId: d.tenantId ?? null,
    orgRole: d.orgRole ?? null,
    platformAdmin: d.platformAdmin === true,
  };
}

async function loginPasswordAction(
  set: SetFn,
  get: GetFn,
  username: string,
  password: string,
): Promise<boolean> {
  set(asyncStart());
  try {
    const res = await fetch('/api/v1/auth/login/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    if (!res.ok || !body?.data?.accessToken) {
      set(asyncFail(body?.detail || '用户名或密码错误'));
      return false;
    }
    setTokens(body.data.accessToken, body.data.refreshToken);
    const user = await fetchMe();
    set({ user, org: body.data.org ?? null, ...asyncSuccess() });
    await get().loadOrgs();
    return true;
  } catch (e) {
    set(asyncFail(e));
    return false;
  }
}

async function registerAction(
  set: SetFn,
  input: { username: string; password: string; email: string; orgName: string },
): Promise<boolean> {
  set(asyncStart());
  try {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) {
      set(asyncFail(body?.detail || '注册失败'));
      return false;
    }
    set(asyncSuccess());
    return true;
  } catch (e) {
    set(asyncFail(e));
    return false;
  }
}

async function acceptInviteAction(
  set: SetFn,
  get: GetFn,
  token: string,
): Promise<{ ok: boolean; orgId?: string }> {
  set(asyncStart());
  try {
    const res = await apiFetch('/api/v1/orgs/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const body = await res.json();
    if (!res.ok) {
      set(asyncFail(body?.detail || '接受邀请失败'));
      return { ok: false };
    }
    set(asyncSuccess());
    await get().loadOrgs();
    return { ok: true, orgId: body?.data?.orgId };
  } catch (e) {
    set(asyncFail(e));
    return { ok: false };
  }
}

async function logoutAction(set: SetFn): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await fetch('/api/v1/auth/logout', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    /* 即便服务端撤销失败，也要清空本地会话 */
  }
  clearTokens();
  set({ user: null, org: null, orgs: [] });
}

async function switchOrgAction(set: SetFn, orgId: string): Promise<boolean> {
  set(asyncStart());
  try {
    const res = await apiFetch('/api/v1/auth/switch-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    const body = await res.json();
    if (!res.ok || !body?.data?.accessToken) {
      set(asyncFail(body?.detail || '切换组织失败'));
      return false;
    }
    setTokens(body.data.accessToken, body.data.refreshToken);
    const user = await fetchMe();
    set({ user, org: body.data.org ?? null, ...asyncSuccess() });
    return true;
  } catch (e) {
    set(asyncFail(e));
    return false;
  }
}

async function loadOrgsAction(set: SetFn): Promise<void> {
  try {
    const res = await apiFetch('/api/v1/auth/orgs', { silent: true });
    if (!res.ok) return;
    const body = await res.json();
    const orgs: OrgSummary[] = body?.data?.orgs ?? [];
    const activeOrgId: string | null = body?.data?.activeOrgId ?? null;
    const active = orgs.find((o) => o.orgId === activeOrgId) ?? null;
    set((s) => ({ orgs, org: active ?? s.org }));
  } catch {
    /* ignore */
  }
}

async function initAction(set: SetFn, get: GetFn): Promise<void> {
  if (get().initialized) return;
  if (!getRefreshToken()) {
    set({ initialized: true });
    return;
  }
  try {
    const ok = await refreshTokens();
    if (!ok) return;
    const user = await fetchMe();
    set({ user });
    if (user) await get().loadOrgs();
  } finally {
    set({ initialized: true });
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  org: null,
  orgs: [],
  initialized: false,
  loading: false,
  error: null,

  isAuthenticated: () => get().user !== null,
  loginPassword: (username, password) => loginPasswordAction(set, get, username, password),
  register: (input) => registerAction(set, input),
  acceptInvite: (token) => acceptInviteAction(set, get, token),
  logout: () => logoutAction(set),
  switchOrg: (orgId) => switchOrgAction(set, orgId),
  loadOrgs: () => loadOrgsAction(set),
  init: () => initAction(set, get),
}));
