/**
 * HTTP 客户端工具 — 统一封装对外部服务（Go 数据服务 / Go 引擎等）的 HTTP 调用。
 *
 * 提供 callService 函数：超时控制、request_id 传播、降级约定（返回 null 而非抛异常）。
 */

import { getRequestId } from './requestContext.js';
import { getTracePropagationHeaders } from './tracePropagation.js';
import { logger } from './logger.js';
import { errorMessage } from './errors.js';

/**
 * 调用外部 HTTP 服务（Go 数据服务 / Go 引擎等），统一封装超时与降级处理。
 *
 * 调用流程：
 * 1. 使用 AbortController 在 `timeoutMs` 毫秒后中断请求；
 * 2. 若 HTTP 状态非 2xx，记录告警并返回 `null`，由调用方走降级路径；
 * 3. 若发生超时（AbortError）或其他异常，记录告警并返回 `null`。
 *
 * 降级行为说明：
 * - 本函数**不抛异常**，任何失败均返回 `null`，调用方需通过判断 `null` 走降级逻辑
 *   （如 Go 数据服务失败时降级到 PostgreSQL）；
 * - 超时默认 30 秒（适用于 Go 数据服务的批量行情请求），调用方可按场景覆盖；
 * - 所有失败均通过 `logger.warn` 记录，便于排查降级原因。
 *
 * @param baseUrl - 目标服务基础地址，如 `http://127.0.0.1:5003`
 * @param endpoint - 接口路径（含 query string），会拼接在 `baseUrl` 之后
 * @param options - 透传给 `fetch` 的初始化参数（method/headers/body 等）
 * @param timeoutMs - 超时毫秒数，超时后触发 AbortController 中断请求，默认 30000ms
 * @returns 成功时返回解析后的 JSON 响应；失败（非 2xx / 超时 / 网络错误）时返回 `null`
 */
export async function callService(
  baseUrl: string,
  endpoint: string,
  options?: RequestInit,
  timeoutMs = 30000,
): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const requestId = getRequestId();
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string> | undefined),
      ...getTracePropagationHeaders(),
    };
    if (requestId) {
      headers['x-request-id'] = requestId;
    }
    const resp = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      logger.warn(
        `[服务调用] ${baseUrl}${endpoint} HTTP ${resp.status}，响应体: ${body.slice(0, 500)}，返回 null`,
      );
      return null;
    }
    return await resp.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.warn(`[服务调用] ${baseUrl} 不可用，返回 null`);
    } else {
      const errMsg = errorMessage(err);
      logger.warn(`[服务调用] ${baseUrl}${endpoint} 调用失败，返回 null: ${errMsg}`);
    }
    return null;
  }
}
