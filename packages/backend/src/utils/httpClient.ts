/**
 * HTTP 客户端工具 — 统一封装对外部服务（Go 数据服务 / Go 引擎等）的 HTTP 调用。
 *
 * 提供 callService 函数：超时控制、request_id 传播、降级约定（返回 null 而非抛异常）。
 */

import { getRequestId, getTracePropagationHeaders } from './requestContext.js';
import { logger } from './logger.js';
import { errorMessage, UpstreamProblemError } from './errors.js';

/**
 * 解析上游 4xx 响应体为 UpstreamProblemError（RO-045）。
 *
 * 优先读取 RFC 7807 标准字段（code/title/detail），
 * 兼容 Go 引擎旧格式 { error: "..." }，非 JSON 回退为原始文本。
 */
function parseUpstreamProblem(status: number, body: string): UpstreamProblemError {
  let code = 'UPSTREAM_ERROR';
  let title = 'Upstream Error';
  let detail = body.slice(0, 500) || `HTTP ${status}`;
  try {
    const parsed = JSON.parse(body) as {
      code?: string;
      title?: string;
      detail?: string;
      error?: string;
    };
    if (parsed.code) code = parsed.code;
    if (parsed.title) title = parsed.title;
    if (parsed.detail) {
      detail = parsed.detail;
    } else if (parsed.error) {
      detail = parsed.error;
    }
  } catch {
    // body 非 JSON，使用原始文本作为 detail
  }
  return new UpstreamProblemError(status, code, title, detail);
}

/**
 * 调用外部 HTTP 服务（Go 数据服务 / Go 引擎等），统一封装超时与降级处理。
 *
 * 调用流程：
 * 1. 使用 AbortController 在 `timeoutMs` 毫秒后中断请求；
 * 2. 若 HTTP 4xx，解析 ProblemDetails 并抛出 `UpstreamProblemError`（RO-045 透传）；
 * 3. 若 HTTP 5xx，记录告警并返回 `null`，由调用方走降级路径；
 * 4. 若发生超时（AbortError）或其他异常，记录告警并返回 `null`。
 *
 * 降级行为说明（RO-045 细化）：
 * - **4xx 客户端错误**：解析上游 RFC 7807 ProblemDetails 响应体，抛出 `UpstreamProblemError`
 *   （携带原始 status/code/title/detail），由调用方（如 `callEngineStrict`）透传给路由层。
 *   企业理由：4xx 是参数错误而非服务不可用，不应降级为 503 fail-closed。
 * - **5xx 服务端错误 / 超时 / 网络异常**：返回 `null`，由调用方走降级路径
 *   （如 Go 数据服务失败时降级到 PostgreSQL；Go 引擎失败时 fail-closed 503）。
 * - 超时默认 30 秒（适用于 Go 数据服务的批量行情请求），调用方可按场景覆盖；
 * - 所有 5xx 失败均通过 `logger.warn` 记录，便于排查降级原因。
 *
 * @param baseUrl - 目标服务基础地址，如 `http://127.0.0.1:5003`
 * @param endpoint - 接口路径（含 query string），会拼接在 `baseUrl` 之后
 * @param options - 透传给 `fetch` 的初始化参数（method/headers/body 等）
 * @param timeoutMs - 超时毫秒数，超时后触发 AbortController 中断请求，默认 30000ms
 * @returns 成功时返回解析后的 JSON 响应；5xx/超时/网络错误时返回 `null`
 * @throws {UpstreamProblemError} 当上游返回 4xx 客户端错误时
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
      // 4xx 客户端错误：解析上游 ProblemDetails 并抛出（RO-045 透传）
      // 企业理由：4xx 是参数错误（如请求格式错误、portfolios 为空），不应降级为 503 fail-closed。
      // 透传原始状态码让客户端正确区分"引擎宕机"与"参数错误"。
      if (resp.status >= 400 && resp.status < 500) {
        throw parseUpstreamProblem(resp.status, body);
      }
      // 5xx 服务端错误：返回 null，由调用方走降级路径（ADR-031 fail-closed）
      logger.warn(
        `[服务调用] ${baseUrl}${endpoint} HTTP ${resp.status}，响应体: ${body.slice(0, 500)}，返回 null`,
      );
      return null;
    }
    return await resp.json();
  } catch (err: unknown) {
    // 4xx 客户端错误透传（RO-045），不被外层降级逻辑吞没
    if (err instanceof UpstreamProblemError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      logger.warn(`[服务调用] ${baseUrl} 不可用，返回 null`);
    } else {
      const errMsg = errorMessage(err);
      logger.warn(`[服务调用] ${baseUrl}${endpoint} 调用失败，返回 null: ${errMsg}`);
    }
    return null;
  }
}
