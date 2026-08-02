import { getRequestId, getTracePropagationHeaders } from './requestContext.js';
import { logger } from './logger.js';
import { errorMessage, UpstreamProblemError } from './errors.js';

/**
 * 解析上游 4xx 响应体为 UpstreamProblemError。
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
    /* ignore parse error */
  }
  return new UpstreamProblemError(status, code, title, detail);
}

/**
 * 调用外部 HTTP 服务，统一封装超时与降级处理。
 *
 * 降级行为（RO-045 细化）：
 * - **4xx 客户端错误**：解析上游 RFC 7807 ProblemDetails 响应体，抛出 `UpstreamProblemError`
 *   （携带原始 status/code/title/detail），由调用方（如 `callEngineStrict`）透传给路由层。
 *   4xx 是参数错误而非服务不可用，不应降级为 503 fail-closed。
 * - **5xx 服务端错误 / 超时 / 网络异常**：返回 `null`，由调用方走降级路径
 *   （如 Go 数据服务失败时降级到 PostgreSQL；Go 引擎失败时 fail-closed 503）。
 *
 * @param baseUrl - 目标服务基础地址，如 `http://127.0.0.1:15003`
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
      // 4xx 客户端错误：解析上游 ProblemDetails 并抛出。4xx 是参数错误（如请求格式错误、
      // portfolios 为空），不应降级为 503 fail-closed。透传原始状态码让客户端正确区分
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
