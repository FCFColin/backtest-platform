/**
 * 前端错误统一上报工具（P1-3 错误监控完整性）。
 *
 * 设计要点：
 * - 开发环境：`console.error` 输出到控制台，便于即时调试
 * - 生产环境：fire-and-forget 发送到 `POST /api/v1/errors`，后端写入 Pino 结构化日志
 * - 错误上报本身失败时静默处理，避免无限递归
 * - 使用 `keepalive: true` 确保页面卸载时仍能发送
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   reportError(err, { component: 'MyComponent', action: 'riskyOperation' });
 * }
 * ```
 */

/** 错误上下文信息，用于辅助排查 */
export interface ErrorContext {
  /** 发生错误的组件名 */
  component?: string;
  /** 发生错误的操作名 */
  action?: string;
  /** 关联的 jobId（如回测任务） */
  jobId?: string;
  /** 其他上下文字段 */
  [key: string]: unknown;
}

/** 错误上报请求体结构 */
interface ErrorReportPayload {
  message: string;
  stack?: string;
  context: ErrorContext;
  timestamp: string;
  url: string;
  userAgent: string;
}

/** 上报端点 URL */
const ERROR_REPORT_ENDPOINT = '/api/v1/errors';

/** 防止递归上报的标志 */
let isReporting = false;

/**
 * 构建错误上报 payload。
 *
 * @param error - 错误对象或原始值
 * @param context - 错误上下文
 * @returns 序列化后的 payload 对象
 */
function buildPayload(error: unknown, context: ErrorContext): ErrorReportPayload {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };
}

/**
 * 统一错误上报函数。
 *
 * 开发环境输出到 `console.error`；生产环境 fire-and-forget 发送到后端。
 * 上报本身失败时静默处理，不抛出二次错误。
 *
 * @param error - 错误对象或原始值
 * @param context - 错误上下文（组件名、操作名等）
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  const payload = buildPayload(error, context);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- 开发环境直接输出到控制台，便于即时调试
    console.error('[ErrorReporter]', payload);
    return;
  }

  // 防止递归上报（上报本身的 fetch 失败不应再次触发 reportError）
  if (isReporting) return;
  isReporting = true;

  fetch(ERROR_REPORT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  })
    .catch(() => {
      // 上报失败时静默处理，避免无限递归
    })
    .finally(() => {
      isReporting = false;
    });
}
