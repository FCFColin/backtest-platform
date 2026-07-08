/**
 * 管理后台 API 客户端
 *
 * 封装 fetch，自动读取 API Key 并附加到请求头 `x-api-key`，
 * 用于访问受 `requireApiKey` 中间件保护的管理类接口
 * （`/api/admin/*`、`/api/data/manage/*`）。
 *
 * 密钥存储策略（按优先级）：
 * 1. 内存变量（进程生命周期，最安全，优先使用）
 * 2. sessionStorage（标签页生命周期，关闭后自动清除）
 * 3. localStorage（持久化存储，不推荐用于生产，base64 编码非加密）
 *
 * 安全理由：API Key 是静态凭证，泄露后无法按用户细粒度撤销。
 * localStorage 中的密钥可被同源 XSS 窃取。
 * 生产环境应使用 JWT 认证替代 API Key，并将 token 保存在内存中。
 *
 * 相关约定：
 * - localStorage/sessionStorage key：`admin_api_key`
 * - 请求头名：`x-api-key`
 * - 未设置 API Key 时不附加该头，由后端在开发环境自动放行
 */

import { getAccessToken, refreshTokens } from './authTokens.js';
import { useToastStore } from '../store/toastStore.js';

/** Storage 中存储 API Key 的键名 */
export const ADMIN_API_KEY_STORAGE = 'admin_api_key';

/** 内存变量（优先使用，进程生命周期） */
let inMemoryApiKey = '';

/**
 * 读取当前保存的 API Key。
 *
 * 优先级：内存变量 → sessionStorage → localStorage
 *
 * @returns API Key 字符串；未设置时返回空字符串
 */
export function getApiKey(): string {
  // 1. 内存变量
  if (inMemoryApiKey) return inMemoryApiKey;

  // 2. sessionStorage
  try {
    const stored = sessionStorage.getItem(ADMIN_API_KEY_STORAGE);
    if (stored) return atob(stored);
  } catch {
    /* ignore */
  }

  // 3. localStorage（迁移回退）
  try {
    const stored = localStorage.getItem(ADMIN_API_KEY_STORAGE);
    return stored ? atob(stored) : '';
  } catch {
    return '';
  }
}

/**
 * 保存 API Key。
 *
 * 默认写入内存变量 + sessionStorage。
 * localStorage 写入需显式传入 `persist: true`，并会输出安全警告。
 *
 * @param key - API Key 字符串
 * @param persist - 是否持久化到 localStorage（默认 false）
 */
export function setApiKey(key: string, persist = false): void {
  // 始终写入内存
  inMemoryApiKey = key;

  // 写入 sessionStorage（标签页生命周期）
  try {
    sessionStorage.setItem(ADMIN_API_KEY_STORAGE, btoa(key));
  } catch {
    /* ignore */
  }

  // 写入 localStorage 需显式选择
  if (persist) {
    if (typeof window !== 'undefined' && window.console) {
      console.warn(
        '[SECURITY] API Key 已持久化到 localStorage。' +
          '同源 XSS 攻击可窃取此密钥。生产环境建议使用 JWT 认证。',
      );
    }
    try {
      localStorage.setItem(ADMIN_API_KEY_STORAGE, btoa(key));
    } catch {
      /* ignore */
    }
  }
}

/**
 * 清除已保存的 API Key（内存 + sessionStorage + localStorage）。
 */
export function clearApiKey(): void {
  inMemoryApiKey = '';
  try {
    sessionStorage.removeItem(ADMIN_API_KEY_STORAGE);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(ADMIN_API_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

/**
 * 认证 fetch 封装（ADR-034）。
 *
 * 认证优先级与行为：
 * 1. JWT Bearer——若已登录（内存有 Access Token），附加 `Authorization: Bearer`。
 *    收到 401 时尝试用 Refresh Token 静默刷新一次并重试原请求（auto-refresh）。
 * 2. x-api-key 兼容——为管理工具/未登录态保留：存在 API Key 且未显式覆盖时附加。
 * - 调用方显式传入的同名头不会被覆盖。
 * - 其余参数与原生 fetch 一致。
 *
 * @param input - 请求 URL 或 Request 对象
 * @param init - fetch 初始化配置
 * @returns fetch 返回的 Response Promise
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const doFetch = (): Promise<Response> => {
    const headers = new Headers(init?.headers);

    const accessToken = getAccessToken();
    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const apiKey = getApiKey();
    if (apiKey && !headers.has('x-api-key')) {
      headers.set('x-api-key', apiKey);
    }

    return fetch(input, { ...init, headers });
  };

  let res = await doFetch();

  // 仅当本次请求确实带了 Bearer（即处于登录态）时，才在 401 上尝试刷新重试，
  // 避免对匿名/仅 x-api-key 请求做无谓刷新。（res 可能为 null：见调用方对异常的容错）
  if (res?.status === 401 && getAccessToken()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      res = await doFetch();
    }
  }

  // 响应拦截：错误 Toast + degraded 警告
  if (res) {
    const cloned = res.clone();
    try {
      const body = await cloned.json();
      if (!res.ok && body?.error?.detail) {
        useToastStore.getState().addToast('error', body.error.detail);
      }
      if (body?.degraded === true) {
        useToastStore.getState().addToast('warning', body.degradedWarning ?? '系统运行在降级模式');
      }
    } catch {
      // 非 JSON 响应，跳过拦截
    }
  }

  return res;
}
