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
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  const { detail, headers, degraded } = options ?? {};
  const r = res.status(status).header('Content-Type', 'application/problem+json');
  // 附加额外响应头（如 Retry-After），用于 fail-closed 降级（ADR-031）。
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      r.header(key, value);
    }
  }
  const body: Record<string, unknown> = {
    type: `https://backtest.platform/errors/${code}`,
    title,
    status,
    code,
    detail,
    instance: res.req?.path,
  };
  if (degraded !== undefined) {
    body.degraded = degraded;
  }
  r.json(body);
}
