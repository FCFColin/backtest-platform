import { create } from 'zustand';
import { apiFetch, setTokens, clearTokens, refreshTokens } from '@/utils/apiClient';
import i18n from '@/i18n/index.js';
interface AsyncSlice {
  loading: boolean;
  error: string | null;
}
const asyncStart = (): Partial<AsyncSlice> => ({ loading: true, error: null });
const asyncFail = (error: unknown): Partial<AsyncSlice> => ({
  loading: false,
  error: String(error),
});
const asyncSuccess = (): Partial<AsyncSlice> => ({ loading: false, error: null });
async function withAsync<T>(set: SetFn, onFail: T, fn: () => Promise<T>): Promise<T> {
  set(asyncStart());
  try {
    return await fn();
  } catch (e) {
    set(asyncFail(e));
    return onFail;
  }
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
  register: (input: {
    username: string;
    password: string;
    email: string;
    orgName: string;
  }) => Promise<boolean>;
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
  const d = (await res.json())?.data;
  if (!d) return null;
  return {
    userId: d.userId,
    role: d.role,
    tenantId: d.tenantId ?? null,
    orgRole: d.orgRole ?? null,
    platformAdmin: d.platformAdmin === true,
  };
}
function loginPasswordAction(
  set: SetFn,
  get: GetFn,
  username: string,
  password: string,
): Promise<boolean> {
  return withAsync(set, false, async () => {
    const res = await fetch('/api/v1/auth/login/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    if (!res.ok || !body?.data?.accessToken) {
      set(asyncFail(body?.detail || i18n.t('Invalid username or password')));
      return false;
    }
    setTokens(body.data.accessToken);
    const user = await fetchMe();
    set({
      user,
      org: body.data.org ?? null,
      idleTimeoutMs: body.data.idleTimeoutMs ?? 0,
      ...asyncSuccess(),
    });
    await get().loadOrgs();
    return true;
  });
}
function registerAction(
  set: SetFn,
  input: { username: string; password: string; email: string; orgName: string },
): Promise<boolean> {
  return withAsync(set, false, async () => {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) {
      set(asyncFail(body?.detail || i18n.t('Registration failed')));
      return false;
    }
    set(asyncSuccess());
    return true;
  });
}
function acceptInviteAction(
  set: SetFn,
  get: GetFn,
  token: string,
): Promise<{ ok: boolean; orgId?: string }> {
  return withAsync(set, { ok: false }, async () => {
    const res = await apiFetch('/api/v1/orgs/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const body = await res.json();
    if (!res.ok) {
      set(asyncFail(body?.detail || i18n.t('Failed to accept invitation')));
      return { ok: false };
    }
    set(asyncSuccess());
    await get().loadOrgs();
    return { ok: true, orgId: body?.data?.orgId };
  });
}
async function logoutAction(set: SetFn): Promise<void> {
  try {
    await fetch('/api/v1/auth/logout', { method: 'DELETE', credentials: 'include' });
  } catch {}
  clearTokens();
  set({ user: null, org: null, orgs: [], idleTimeoutMs: 0 });
}
function switchOrgAction(set: SetFn, orgId: string): Promise<boolean> {
  return withAsync(set, false, async () => {
    const res = await apiFetch('/api/v1/auth/switch-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    const body = await res.json();
    if (!res.ok || !body?.data?.accessToken) {
      set(asyncFail(body?.detail || i18n.t('Failed to switch organization')));
      return false;
    }
    setTokens(body.data.accessToken);
    const user = await fetchMe();
    set({ user, org: body.data.org ?? null, ...asyncSuccess() });
    return true;
  });
}
async function loadOrgsAction(set: SetFn): Promise<void> {
  try {
    const res = await apiFetch('/api/v1/auth/orgs', { silent: true });
    if (!res.ok) return;
    const body = await res.json();
    const orgs: OrgSummary[] = body?.data?.orgs ?? [];
    const active = orgs.find((o) => o.orgId === (body?.data?.activeOrgId ?? null)) ?? null;
    set((s) => ({ orgs, org: active ?? s.org }));
  } catch {}
}
async function initAction(set: SetFn, get: GetFn): Promise<void> {
  if (get().initialized) return;
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
  idleTimeoutMs: 0,
  initialized: false,
  loading: false,
  error: null,
  isAuthenticated: () => get().user !== null,
  loginPassword: (u, p) => loginPasswordAction(set, get, u, p),
  register: (input) => registerAction(set, input),
  acceptInvite: (t) => acceptInviteAction(set, get, t),
  logout: () => logoutAction(set),
  switchOrg: (o) => switchOrgAction(set, o),
  loadOrgs: () => loadOrgsAction(set),
  init: () => initAction(set, get),
}));
