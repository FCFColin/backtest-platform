/**
 * 管理后台 API 客户端
 *
 * 封装 fetch，自动读取 API Key 并附加到请求头 `x-api-key`，
 * 用于访问需要 `x-api-key` 鉴权的管理类接口
 * （`/api/admin/*`、`/api/data/manage/*`）。
 *
 * 密钥存储策略（按优先级）：
 * 1. sessionStorage（标签页生命周期，关闭后自动清除）
 * 2. localStorage（持久化存储，不推荐用于生产，base64 编码非加密）
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

/** Storage 中存储 API Key 的键名（仅 apiClient 内部使用） */
const ADMIN_API_KEY_STORAGE = 'admin_api_key';

/**
 * 读取当前保存的 API Key。
 *
 * 优先级：sessionStorage → localStorage
 *
 * @returns API Key 字符串；未设置时返回空字符串
 */
function getApiKey(): string {
  // 1. sessionStorage（标签页生命周期）
  try {
    const stored = sessionStorage.getItem(ADMIN_API_KEY_STORAGE);
    if (stored) return atob(stored);
  } catch {
    /* ignore */
  }

  // 2. localStorage（持久化回退）
  try {
    const stored = localStorage.getItem(ADMIN_API_KEY_STORAGE);
    return stored ? atob(stored) : '';
  } catch {
    return '';
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
 * - 响应拦截：非 2xx 含 error.detail 时弹错误 Toast；degraded=true 时弹警告 Toast。
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

  // 响应拦截：自动检测 error/degraded 并显示 Toast。
  // 仅对非 2xx 显示错误 Toast，避免 200 成功响应误带 error 字段时误报；
  // degraded 无论状态码都需提示。res 可能为 null（fetch 容错），需先判空。
  if (res) {
    try {
      const cloned = res.clone();
      const body = await cloned.json();
      if (!res.ok && body?.error?.detail) {
        useToastStore.getState().addToast('error', body.error.detail);
      }
      if (body?.degraded === true) {
        useToastStore.getState().addToast('warning', body.degradedWarning ?? '系统运行在降级模式');
      }
    } catch {
      // 非 JSON 响应，跳过
    }
  }

  return res;
}

/**
 * POST JSON 请求封装（基于 apiFetch）。
 *
 * 统一封装前端高频调用模式：发送 JSON body、HTTP 非 2xx 抛错、
 * `success=false` 抛错、返回 `data` 字段。鉴权与降级提示由 apiFetch 处理。
 *
 * @typeParam T - 期望的 `data` 字段类型
 * @param url - 请求 URL
 * @param body - 请求体对象，将被 `JSON.stringify`
 * @param errorMsg - 当 `success=false` 且响应无 `error` 字段时的兜底错误消息
 * @returns 响应体的 `data` 字段
 * @throws {Error} HTTP 非 2xx 时抛 `HTTP ${status}`；`success=false` 时抛 `error || errorMsg`
 */
export async function apiPostJSON<T>(
  url: string,
  body: unknown,
  errorMsg = '请求失败',
): Promise<T> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || errorMsg);
  return json.data as T;
}
