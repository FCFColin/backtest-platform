import { getRequestId, getTracePropagationHeaders } from './requestContext.js';
import { logger } from './logger.js';
import { errorMessage, UpstreamProblemError } from './errors.js';

// 优先 RFC 7807 字段，兼容 Go { error: "..." } 格式
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

// 4xx: 参数错误，抛 UpstreamProblemError 透传原始状态码（不降级为 503）
// 5xx/超时/网络异常: 返回 null，由调用方走降级路径（ADR-008 fail-closed）
export async function callService(
  baseUrl: string,
  endpoint: string,
  options?: RequestInit,
  timeoutMs = 30000,
): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
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
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        // 4xx: 参数错误，透传原始状态码
        if (resp.status >= 400 && resp.status < 500) {
          throw parseUpstreamProblem(resp.status, body);
        }
        // 5xx: 返回 null，由调用方走降级路径
        logger.warn(
          `[服务调用] ${baseUrl}${endpoint} HTTP ${resp.status}，响应体: ${body.slice(0, 500)}，返回 null`,
        );
        return null;
      }
      return await resp.json();
    } finally {
      clearTimeout(timeout);
    }
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
