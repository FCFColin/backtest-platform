/**
 * BacktestApiError — SDK 统一错误类型
 *
 * 后端返回的非 2xx 响应（RFC 7807 Problem Details）以及网络层故障
 * 都会被包装为 BacktestApiError 抛出，便于调用方通过 `instanceof` 判断
 * 并访问 `status` / `body` 进行分支处理。
 */

export interface BacktestApiErrorOptions {
  /** HTTP 状态码；网络层故障时为 0 */
  status: number;
  /** HTTP 状态文本（如 "Unauthorized"） */
  statusText?: string;
  /** 解析后的响应体（通常为 ProblemDetail 对象），网络故障时为 undefined */
  body?: unknown;
  /** 自定义错误消息，未提供时按 status/statusText 生成 */
  message?: string;
}

export class BacktestApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;

  constructor(options: BacktestApiErrorOptions) {
    const statusText = options.statusText ?? '';
    const fallback =
      statusText.length > 0
        ? `Backtest API error: ${options.status} ${statusText}`
        : `Backtest API error: ${options.status}`;
    super(options.message ?? fallback);
    this.name = 'BacktestApiError';
    this.status = options.status;
    this.statusText = statusText;
    this.body = options.body;
  }
}
