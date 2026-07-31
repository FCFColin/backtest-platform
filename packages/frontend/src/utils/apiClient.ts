import { getAccessToken, refreshTokens } from './authTokens.js';
import { useToastStore } from '../store/toastStore.js';
import i18n from '../i18n/index.js';
import { getErrorI18nKey } from './errorReporter.js';
import { trackApiCall } from './performanceReporter.js';
const ADMIN_API_KEY_STORAGE = 'admin_api_key';
const FETCH_TIMEOUT_MS = 10_000;
function getApiKey(): string {
  try {
    const stored = sessionStorage.getItem(ADMIN_API_KEY_STORAGE);
    if (stored) return atob(stored);
    // eslint-disable-next-line no-empty -- sessionStorage 可能不可用（隐私模式/SSR），静默回退到 localStorage
  } catch {}
  try {
    const stored = localStorage.getItem(ADMIN_API_KEY_STORAGE);
    return stored ? atob(stored) : '';
  } catch {
    return '';
  }
}
function buildFetchInit(init: (RequestInit & { silent?: boolean }) | undefined): {
  headers: Headers;
  signal: AbortSignal;
  timeoutId?: ReturnType<typeof setTimeout>;
} {
  const headers = new Headers(init?.headers);
  const accessToken = getAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  const apiKey = getApiKey();
  if (apiKey && !headers.has('x-api-key')) {
    headers.set('x-api-key', apiKey);
  }
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (init?.signal) {
    const callerSignal = init.signal;
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  } else {
    timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  }
  return { headers, signal: controller.signal, timeoutId };
}
function resolveErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  const e = (err ?? {}) as Record<string, unknown>;
  if (typeof e.detail === 'string' && e.detail) return e.detail;
  return i18n.t(getErrorI18nKey(typeof e.code === 'string' ? e.code : undefined));
}
async function handleResponseToast(res: Response): Promise<void> {
  try {
    const cloned = res.clone();
    const body = await cloned.json();
    if (!res.ok && body?.error) {
      useToastStore.getState().addToast('error', resolveErrorMessage(body.error));
    }
    if (body?.degraded === true) {
      const warning = body.degradedWarning;
      useToastStore.getState().addToast('warning', typeof warning === 'string' ? warning : i18n.t('errors.dataDegraded'));
    }
    // eslint-disable-next-line no-empty -- 非 JSON 响应体无法解析为 { error, degraded } 结构，跳过 Toast 处理
  } catch {}
}
export async function apiFetch(input: RequestInfo | URL, init?: (RequestInit & { silent?: boolean }) | undefined): Promise<Response> {
  const silent = init?.silent === true;
  const { headers, signal, timeoutId } = buildFetchInit(init);
  const { signal: _origSignal, ...restInit } = init || {};
  const doFetch = () =>
    fetch(input, { ...restInit, headers, signal, credentials: 'include' }).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  const fetchPromise = doFetch();
  trackApiCall(fetchPromise, input instanceof Request ? input.url : String(input), init?.method || 'GET');
  let res = await fetchPromise;
  if (res?.status === 401 && getAccessToken()) {
    const refreshed = await refreshTokens();
    if (refreshed) res = await doFetch();
  }
  if (res && !silent) await handleResponseToast(res);
  return res;
}
export async function apiPostJSON<T>(url: string, body: unknown, errorMsg = i18n.t('errors.requestFailed')): Promise<T> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || errorMsg);
  return json.data as T;
}
export async function apiGetJSON<T>(url: string, errorMsg = i18n.t('errors.requestFailed')): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || errorMsg);
  return json.data as T;
}
export async function apiPutJSON<T>(url: string, body: unknown, errorMsg = i18n.t('errors.requestFailed')): Promise<T> {
  const res = await apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || errorMsg);
  return json.data as T;
}
export async function apiDeleteJSON<T>(url: string, errorMsg = i18n.t('errors.requestFailed')): Promise<T> {
  const res = await apiFetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || errorMsg);
  return json.data as T;
}
