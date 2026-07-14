/**
 * RFC 7807 Problem Details 统一错误响应
 *
 * 企业理由：路由层三种错误格式混用（字符串/{code,message}/自由文本），
 * 前端需处理多种格式。RFC 7807 是 HTTP API 错误标准。
 * 权衡：需改动所有路由，但前端错误处理简化。
 */
import type { Response } from 'express';

export interface ProblemDetail {
  type: string; // 错误类型 URI
  title: string; // 人类可读标题
  status: number; // HTTP 状态码
  code?: string; // 应用特定错误码
  detail?: string; // 详细信息
  instance?: string; // 请求路径
}

/** sendProblem 的可选扩展项 */
export interface SendProblemOptions {
  /** 详细错误描述 */
  detail?: string;
  /** 额外响应头（如 Retry-After），用于 fail-closed 降级（ADR-031） */
  headers?: Record<string, string>;
  /** 降级标记，为 true 时在响应体中包含 degraded: true（ADR-031） */
  degraded?: boolean;
  /** 降级原因说明，前端 apiClient 读取此字段展示 Toast（ADR-031） */
  degradedWarning?: string;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 上游服务 4xx 错误（RO-045 / RFC 7807 透传）。
 *
 * 企业理由：Go 引擎对参数错误返回 4xx（如 400 Bad Request / 422 Unprocessable），
 * 此前 httpClient 在 !resp.ok 时统一返回 null，engineClient 包装为 EngineUnavailableError → 503，
 * 使客户端无法区分"引擎宕机"与"参数错误"。本错误携带上游原始 status/code/title/detail，
 * 由 callEngineStrict 透传给路由层，路由用 sendProblem 返回原始 4xx 状态码。
 *
 * 与 EngineUnavailableError 的边界（ADR-031 细化）：
 * - 4xx（客户端错误）→ UpstreamProblemError，透传原始状态码（不重试、不 fail-closed）
 * - 5xx / 网络错误（服务不可用）→ EngineUnavailableError → 503 + Retry-After（fail-closed）
 */
export class UpstreamProblemError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  constructor(status: number, code: string, title: string, detail: string) {
    super(detail || title);
    this.name = 'UpstreamProblemError';
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
  }
}

/**
 * 发送 RFC 7807 Problem Details JSON 错误响应
 *
 * @param res Express Response 对象
 * @param status HTTP 状态码
 * @param code 应用特定错误码
 * @param title 人类可读标题
 * @param options 可选扩展项（detail 详细描述、headers 额外响应头）
 */
export function sendProblem(
  res: Response,
  status: number,
  code: string,
  title: string,
  options?: SendProblemOptions,
): void {
  const { detail, headers, degraded, degradedWarning } = options ?? {};
  const r = res.status(status).header('Content-Type', 'application/problem+json');
  // 附加额外响应头（如 Retry-After），用于 fail-closed 降级（ADR-031）。
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      r.header(key, value);
    }
  }
  const body: Record<string, unknown> = {
    success: false,
    error: {
      type: `https://backtest.platform/errors/${code}`,
      title,
      status,
      code,
      detail,
      instance: res.req?.path,
    },
  };
  if (degraded !== undefined) {
    body.degraded = degraded;
  }
  if (degradedWarning !== undefined) {
    body.degradedWarning = degradedWarning;
  }
  r.json(body);
}
