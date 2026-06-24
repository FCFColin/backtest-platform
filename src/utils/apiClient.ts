/**
 * 管理后台 API 客户端
 *
 * 封装 fetch，自动从 localStorage 读取 API Key 并附加到请求头 `x-api-key`，
 * 用于访问受 `requireApiKey` 中间件保护的管理类接口
 * （`/api/admin/*`、`/api/data/manage/*`）。
 *
 * 相关约定：
 * - localStorage key：`admin_api_key`
 * - 请求头名：`x-api-key`
 * - 未设置 API Key 时不附加该头，由后端在开发环境自动放行
 */

/** localStorage 中存储 API Key 的键名 */
export const ADMIN_API_KEY_STORAGE = 'admin_api_key';

/**
 * 读取当前保存的 API Key。
 *
 * @returns API Key 字符串；未设置时返回空字符串
 */
export function getApiKey(): string {
  try {
    const stored = localStorage.getItem(ADMIN_API_KEY_STORAGE);
    return stored ? atob(stored) : '';
  } catch {
    return '';
  }
}

/**
 * 保存 API Key 到 localStorage。
 *
 * @param key - API Key 字符串
 */
export function setApiKey(key: string): void {
  try {
    localStorage.setItem(ADMIN_API_KEY_STORAGE, btoa(key));
  } catch {
    // 忽略 localStorage 不可用的情况
  }
}

/**
 * 清除已保存的 API Key。
 */
export function clearApiKey(): void {
  try {
    localStorage.removeItem(ADMIN_API_KEY_STORAGE);
  } catch {
    // 忽略 localStorage 不可用的情况
  }
}

/**
 * 自动附加 `x-api-key` 请求头的 fetch 封装。
 *
 * 行为：
 * - 从 localStorage 读取 API Key，存在时附加到请求头
 * - 调用方显式传入的 `x-api-key` 头不会被覆盖
 * - 其余参数与原生 fetch 一致
 *
 * @param input - 请求 URL 或 Request 对象
 * @param init - fetch 初始化配置
 * @returns fetch 返回的 Response Promise
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const apiKey = getApiKey();
  const headers = new Headers(init?.headers);

  if (apiKey && !headers.has('x-api-key')) {
    headers.set('x-api-key', apiKey);
  }

  return fetch(input, { ...init, headers });
}
