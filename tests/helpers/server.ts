/**
 * 测试辅助：服务器可用性检查
 *
 * 企业理由：engineConsistency.test.ts 和 rust-engine.test.ts 各自实现了
 * 略有不同的服务器探活逻辑（一个用 AbortController 超时，一个无超时）。
 * 本模块提供统一的 checkServerAvailable 函数，支持超时控制，
 * 以及 shouldSkip 辅助函数，简化 it.skipIf 模式。
 */

/**
 * 检查服务器是否可用（HTTP 探活）
 *
 * 判定逻辑：能建立连接且响应状态码 < 500 即视为可用。
 * 4xx（如 404）视为可用，因为服务本身在运行，只是路径不存在。
 *
 * @param url - 探活 URL（如 `${ENGINE_GO_BASE_URL}/api/engine/health`）
 * @param timeoutMs - 超时毫秒数，默认 2000ms
 * @returns 服务器可用返回 true，否则 false
 */
export async function checkServerAvailable(
  url: string,
  timeoutMs: number = 2000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

/**
 * 根据服务器可用性决定是否跳过测试
 *
 * 用法：
 *   let serverAvailable = false;
 *   beforeAll(async () => {
 *     serverAvailable = await checkServerAvailable(ENGINE_GO_BASE_URL);
 *   });
 *   it.skipIf(shouldSkip(serverAvailable))('测试名', () => { ... });
 *
 * @param serverAvailable - checkServerAvailable 的返回值
 * @returns 应跳过测试时返回 true
 */
export function shouldSkip(serverAvailable: boolean): boolean {
  return !serverAvailable;
}
