/**
 * RFC 7807 Problem Details 统一错误响应
 *
 * 企业理由：路由层三种错误格式混用（字符串/{code,message}/自由文本），
 * 前端需处理多种格式。RFC 7807 是 HTTP API 错误标准。
 * 权衡：需改动所有路由，但前端错误处理简化。
 */

export interface ProblemDetail {
  type: string;    // 错误类型 URI
  title: string;   // 人类可读标题
  status: number;  // HTTP 状态码
  code?: string;   // 应用特定错误码
  detail?: string; // 详细信息
  instance?: string; // 请求路径
}

export function sendProblem(
  res: any,
  status: number,
  code: string,
  title: string,
  detail?: string
): void {
  res.status(status)
    .header('Content-Type', 'application/problem+json')
    .json({
      type: `https://backtest.platform/errors/${code}`,
      title,
      status,
      code,
      detail,
      instance: res.req?.path,
    });
}
