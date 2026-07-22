/**
 * 路由层共享工具 — HTTP 适配层关注点。
 *
 * 仅包含与 HTTP 请求/响应直接相关的工具函数：
 * - 错误翻译（应用错误 → HTTP 状态码）
 * - 统一异步路由处理器包装器
 *
 * P0 统一错误处理：asyncRouteHandler 自动捕获 ApplicationError 子类，
 * 消除路由层字符串匹配错误的反模式。所有计算端点路由统一使用此包装器。
 */
import type { Request, Response, RequestHandler } from 'express';
import {
  sendProblem,
  UpstreamProblemError,
  ApplicationError,
  type SendProblemOptions,
} from '../utils/errors.js';
import { EngineUnavailableError } from '../utils/engineClient.js';
import { TimeoutError } from '../utils/timeout.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest, recordDegradedResponse } from '../utils/metrics.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { hasTenant } from '../middleware/tenantContext.js';
import { isUuid } from '../utils/validation.js';

/**
 * 将引擎不可用错误翻译为 503 + Retry-After（ADR-031 fail-closed）。
 *
 * @returns 若已处理该错误返回 true，调用方应 return。
 */
function handleEngineUnavailable(res: Response, error: unknown): boolean {
  if (error instanceof EngineUnavailableError) {
    sendProblem(res, 503, 'ENGINE_UNAVAILABLE', 'Service Unavailable', {
      detail: error.message,
      headers: { 'Retry-After': String(error.retryAfterSeconds) },
      degraded: true,
      degradedWarning: error.message,
    });
    return true;
  }
  if (error instanceof UpstreamProblemError) {
    sendProblem(res, error.status, error.code, error.title, {
      detail: error.detail,
    });
    return true;
  }
  return false;
}

/**
 * 统一应用错误翻译。
 *
 * 自动将 ApplicationError 子类翻译为对应的 HTTP 状态码 + RFC 7807 响应体。
 * 消除路由层字符串匹配错误的反模式。
 *
 * @returns 若已处理该错误返回 true，调用方应 return。
 */
function handleApplicationError(res: Response, error: unknown): boolean {
  if (error instanceof ApplicationError) {
    const options: SendProblemOptions = { detail: error.message };
    sendProblem(res, error.statusCode, error.errorCode, error.errorTitle, options);
    return true;
  }
  if (error instanceof TimeoutError) {
    sendProblem(res, 503, 'COMPUTE_TIMEOUT', 'Service Unavailable', {
      detail: '计算超时，请缩小参数空间或稍后重试',
    });
    return true;
  }
  return false;
}

export function ownerOf(req: AuthenticatedRequest): string | null {
  const sub = req.user?.sub;
  return sub && !sub.startsWith('apikey:') && !sub.startsWith('platform:') ? sub : null;
}

export function requireTenantId(req: AuthenticatedRequest, res: Response): string | null {
  if (!hasTenant(req)) {
    sendProblem(res, 401, 'TENANT_REQUIRED', 'Unauthorized', { detail: '组织上下文缺失' });
    return null;
  }
  return req.tenantId;
}

export function requireUuidParam(res: Response, id: string | undefined): boolean {
  if (!id || !isUuid(id)) {
    sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
    return false;
  }
  return true;
}

interface RouteErrorConfig {
  logMsg: string;
  code: string;
  title: string;
  detail: string;
  endpoint?: string;
}

/**
 * 统一异步路由处理器包装：捕获应用错误并格式化 HTTP 响应。
 *
 * 错误处理优先级：
 * 1. EngineUnavailableError → 503 + Retry-After（fail-closed，ADR-031）
 * 2. UpstreamProblemError → 透传上游 4xx 状态码
 * 3. ApplicationError（ValidationError/DataNotFoundError）→ 对应 HTTP 状态码
 * 4. 其他 Error → 500 + 通用错误消息
 *
 * 所有计算端点路由统一使用此包装器，确保错误处理模式一致。
 */
function recordEndpointError(endpoint: string | undefined): void {
  if (!endpoint) return;
  recordBacktestRequest(endpoint, 'sync', 'error');
}

function recordDegraded(endpoint: string | undefined): void {
  if (!endpoint) return;
  recordBacktestRequest(endpoint, 'sync', 'error');
  recordDegradedResponse(endpoint, 'engine_unavailable');
}

export function asyncRouteHandler(
  fn: (req: Request, res: Response) => Promise<void>,
  errorConfig: RouteErrorConfig,
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error) {
      if (handleEngineUnavailable(res, error)) {
        recordDegraded(errorConfig.endpoint);
        return;
      }
      if (handleApplicationError(res, error)) {
        recordEndpointError(errorConfig.endpoint);
        return;
      }
      recordEndpointError(errorConfig.endpoint);
      logger.error({ err: error as Error }, errorConfig.logMsg);
      const detail = error instanceof Error && error.message ? error.message : errorConfig.detail;
      sendProblem(res, 500, errorConfig.code, errorConfig.title, { detail });
    }
  };
}

/**
 * 包装 CRUD 路由处理器，提供统一的错误处理。
 *
 * 与 {@link asyncRouteHandler} 的区别：不耦合引擎指标记录
 * （recordBacktestRequest/recordDegradedResponse），适用于非计算端点
 * 的 CRUD 路由（配置/组合/任务/数据管理等）。
 *
 * 行为：捕获 handler 抛出的任意错误，记录日志（含请求路径与方法），
 * 统一返回 500 + RFC 7807 错误响应。handler 内部仍可直接调用 sendProblem
 * 返回 4xx/404 等业务错误——这些不会被本包装器拦截。
 *
 * @param fn - 路由业务逻辑，接收 Request/Response
 * @param errorConfig - 错误处理配置（logMsg 日志消息、code 错误码、title 标题、detail 详情）
 * @returns Express RequestHandler
 */
export function crudRouteHandler(
  fn: (req: Request, res: Response) => Promise<void>,
  errorConfig: RouteErrorConfig,
): RequestHandler {
  return async (req, res): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      logger.error({ err: err as Error, path: req.path, method: req.method }, errorConfig.logMsg);
      const detail = err instanceof Error && err.message ? err.message : errorConfig.detail;
      sendProblem(res, 500, errorConfig.code, errorConfig.title, {
        detail,
      });
    }
  };
}
