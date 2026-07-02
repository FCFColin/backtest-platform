/**
 * 前端认证令牌管理（ADR-034）
 *
 * 设计取舍（安全 vs 体验）：
 * - Access Token 仅存内存（模块级变量）——刷新页面即丢，但避免 XSS 持久窃取。
 * - Refresh Token 存 localStorage——换页/重开标签页可静默恢复会话；它是长期凭证，
 *   但服务端实现了轮换 + 复用检测（Token Family），泄露风险相对可控，这是无后端
 *   会话 Cookie 时常见的 SPA 折中。
 *
 * 该模块被 apiClient 与 authStore 共享，独立成文件以避免二者循环依赖。
 */

const REFRESH_TOKEN_STORAGE = 'bt_refresh_token';

/** Access Token（仅内存） */
let accessToken = '';

/** 读取当前 Access Token（未登录时为空字符串） */
export function getAccessToken(): string {
  return accessToken;
}

/** 读取持久化的 Refresh Token（localStorage） */
export function getRefreshToken(): string {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE) ?? '';
  } catch {
    return '';
  }
}

/**
 * 设置令牌对：access 入内存，refresh 入 localStorage。
 *
 * @param access - 新的 Access Token
 * @param refresh - 新的 Refresh Token
 */
export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  try {
    localStorage.setItem(REFRESH_TOKEN_STORAGE, refresh);
  } catch {
    /* ignore */
  }
}

/** 清除全部令牌（登出 / 刷新失败时调用） */
export function clearTokens(): void {
  accessToken = '';
  try {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE);
  } catch {
    /* ignore */
  }
}

/** 刷新去重：并发请求共享同一个刷新 Promise，避免 token 轮换竞态 */
let inflightRefresh: Promise<boolean> | null = null;

/**
 * 使用 Refresh Token 换取新的令牌对。
 *
 * 并发安全：多处同时 401 时只发起一次刷新请求，其余等待同一结果。
 *
 * @returns 是否刷新成功（失败时已清空令牌）
 */
export function refreshTokens(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(false);

  inflightRefresh = (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const body = await res.json();
      const data = body?.data;
      if (data?.accessToken && data?.refreshToken) {
        setTokens(data.accessToken, data.refreshToken);
        return true;
      }
      clearTokens();
      return false;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}
