/**
 * URL 状态序列化工具
 *
 * 将回测配置（portfolios + parameters）编码为 URL 安全的 base64 字符串，
 * 实现 testfol.io 风格的 `?d=<base64>` 分享链接。
 *
 * 编码流程：state → JSON → UTF-8 → base64url
 * 解码流程：base64url → UTF-8 → JSON → state
 */
import type { Portfolio, BacktestParameters } from '@backtest/shared/types';

export interface ShareableState {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
}

/**
 * 将状态序列化为 base64url 字符串
 */
export function encodeState(state: ShareableState): string {
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  // base64url：+ → -，/ → _，去掉末尾 =
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 从 base64url 字符串反序列化状态
 * 解码失败返回 null
 */
export function decodeState(encoded: string): ShareableState | null {
  try {
    // base64url → base64
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.portfolios) || parsed.portfolios.length === 0) return null;
    if (!parsed.parameters || typeof parsed.parameters !== 'object') return null;
    // Validate each portfolio has assets
    for (const p of parsed.portfolios) {
      if (!Array.isArray(p.assets) || p.assets.length === 0) return null;
    }
    return parsed as ShareableState;
  } catch {
    return null;
  }
}

/**
 * 从当前 URL 的 ?d= 参数读取状态
 * 无参数返回 null
 */
export function readStateFromURL(): ShareableState | null {
  const params = new URLSearchParams(window.location.search);
  const d = params.get('d');
  if (!d) return null;
  return decodeState(d);
}

/**
 * 将状态写入 URL（不触发页面刷新）
 * 返回完整的分享 URL
 */
export function writeStateToURL(state: ShareableState): string {
  const encoded = encodeState(state);
  const url = new URL(window.location.href);
  url.searchParams.set('d', encoded);
  window.history.replaceState({}, '', url.toString());
  return url.toString();
}

/**
 * 清除 URL 中的 ?d= 参数
 */
export function clearStateFromURL(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('d');
  window.history.replaceState({}, '', url.toString());
}
