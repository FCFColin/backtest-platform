import { create } from 'zustand';
import { apiFetch } from '@/utils/apiClient';
import { setTokens, clearTokens, refreshTokens } from '@/utils/authTokens';
import i18n from '@/i18n/index.js';
interface AsyncSlice {
  loading: boolean;
  error: string | null;
}
function asyncStart(): Partial<AsyncSlice> {
  return { loading: true, error: null };
}
function asyncFail(error: unknown): Partial<AsyncSlice> {
  return { loading: false, error: String(error) };
}
function asyncSuccess(): Partial<AsyncSlice> {
  return { loading: false, error: null };
}
interface OrgSummary {
  orgId: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  role: string;
}
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
  idleTimeoutMs: number;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  loginPassword: (username: string, password: string) => Promise<boolean>;
  register: (input: { username: string; password: string; email: string; orgName: string }) => Promise<boolean>;
  acceptInvite: (token: string) => Promise<{ ok: boolean; orgId?: string }>;
  logout: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<boolean>;
  loadOrgs: () => Promise<void>;
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
    platformAdmin: d.platformAdmin === true
  };
}
async function loginPasswordAction(set: SetFn, get: GetFn, username: string, password: string): Promise<boolean> {
  set(asyncStart());
  try {
    const res = await fetch('/api/v1/auth/login/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    const body = await res.json();
    if (!res.ok || !body?.data?.accessToken) {
      set(asyncFail(body?.detail || i18n.t('errors.invalidCredentials')));
      return false;
    }
    setTokens(body.data.accessToken);
    const user = await fetchMe();
    set({
      user,
      org: body.data.org ?? null,
      idleTimeoutMs: body.data.idleTimeoutMs ?? 0,
      ...asyncSuccess()
    });
    await get().loadOrgs();
    return true;
  } catch (e) {
    set(asyncFail(e));
    return false;
  }
}
async function registerAction(set: SetFn, input: { username: string; password: string; email: string; orgName: string }): Promise<boolean> {
  set(asyncStart());
  try {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const body = await res.json();
    if (!res.ok) {
      set(asyncFail(body?.detail || i18n.t('errors.registerFailed')));
      return false;
    }
    set(asyncSuccess());
    return true;
  } catch (e) {
    set(asyncFail(e));
    return false;
  }
}
async function acceptInviteAction(set: SetFn, get: GetFn, token: string): Promise<{ ok: boolean; orgId?: string }> {
  set(asyncStart());
  try {
    const res = await apiFetch('/api/v1/orgs/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const body = await res.json();
    if (!res.ok) {
      set(asyncFail(body?.detail || i18n.t('errors.acceptInviteFailed')));
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
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'DELETE',
      credentials: 'include'
    });
    // eslint-disable-next-line no-empty -- 服务端撤销失败也要清空本地会话
  } catch {}
  clearTokens();
  set({ user: null, org: null, orgs: [], idleTimeoutMs: 0 });
}
async function switchOrgAction(set: SetFn, orgId: string): Promise<boolean> {
  set(asyncStart());
  try {
    const res = await apiFetch('/api/v1/auth/switch-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId })
    });
    const body = await res.json();
    if (!res.ok || !body?.data?.accessToken) {
      set(asyncFail(body?.detail || i18n.t('errors.switchOrgFailed')));
      return false;
    }
    setTokens(body.data.accessToken);
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
    // eslint-disable-next-line no-empty -- 组织列表拉取失败，保持现有状态
  } catch {}
}
async function initAction(set: SetFn, get: GetFn): Promise<void> {
  if (get().initialized) return;
  try {
    const ok = await refreshTokens();
    if (!ok) {
      set({ initialized: true });
      return;
    }
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
  idleTimeoutMs: 0,
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
  init: () => initAction(set, get)
}));
