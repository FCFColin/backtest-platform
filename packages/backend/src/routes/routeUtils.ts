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
import { Router } from 'express';
import type { ZodSchema } from 'zod';
import { sendProblem, UpstreamProblemError, ApplicationError } from '../utils/errors.js';
import { EngineUnavailableError } from '../utils/engineClient.js';
import { TimeoutError, isUuid } from '../utils/misc.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest, recordDegradedResponse } from '../utils/metrics.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { hasTenant } from '../middleware/tenantContext.js';
import { validate } from '../middleware/miscMiddleware.js';

/**
 * 将引擎不可用错误翻译为 503 + Retry-After（ADR-031 fail-closed）。
 *
 * @returns 若已处理该错误返回 true，调用方应 return。
 */
function handleEngineUnavailable(res: Response, error: unknown): boolean {
  if (error instanceof EngineUnavailableError) {
    sendProblem(res, 503, 'ENGINE_UNAVAILABLE', undefined, {
      headers: { 'Retry-After': String(error.retryAfterSeconds) },
    });
    return true;
  }
  if (error instanceof UpstreamProblemError) {
    sendProblem(res, error.status, error.code);
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
    sendProblem(res, error.statusCode, error.errorCode);
    return true;
  }
  if (error instanceof TimeoutError) {
    sendProblem(res, 503, 'COMPUTE_TIMEOUT');
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
    sendProblem(res, 401, 'TENANT_REQUIRED');
    return null;
  }
  return req.tenantId;
}

export function requireUuidParam(res: Response, id: string | undefined): boolean {
  if (!id || !isUuid(id)) {
    sendProblem(res, 400, 'INVALID_ID');
    return false;
  }
  return true;
}

interface RouteErrorConfig {
  logMsg: string;
  code: string;
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
      sendProblem(res, 500, errorConfig.code);
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
 * @param errorConfig - 错误处理配置（logMsg 日志消息、code 错误码、endpoint 可选端点标识）
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
      sendProblem(res, 500, errorConfig.code);
    }
  };
}

/**
 * 租户作用域 CRUD 仓储的最小统一接口。
 *
 * 所有方法以 tenantId 为首参（RLS 隔离边界），update 可选（只读资源无更新语义）。
 */
export interface TenantCrudRepo<T> {
  list(tenantId: string, limit?: number, offset?: number): Promise<T[]>;
  get(tenantId: string, id: string): Promise<T | null>;
  create(tenantId: string, ownerUserId: string | null, input: unknown): Promise<T>;
  update?(tenantId: string, id: string, input: unknown): Promise<T | null>;
  remove(tenantId: string, id: string): Promise<boolean>;
}

export interface TenantCrudConfig {
  /** 日志前缀，如 'configs' → '[configs] 列表失败' */
  resource: string;
  /** 错误码前缀，如 'CONFIG' → CONFIG_LIST_FAILED */
  codePrefix: string;
  /** 404 错误码，如 'CONFIG_NOT_FOUND' */
  notFoundCode: string;
  createSchema?: ZodSchema;
  updateSchema?: ZodSchema;
  /** 若设置则使用 asyncRouteHandler（映射领域错误 + 记录计算指标），否则 crudRouteHandler */
  metricPrefix?: string;
  /** 创建前钩子（如配额检查）：返回 false 表示已发送拒绝响应，终止创建 */
  beforeCreate?: (req: AuthenticatedRequest, res: Response) => Promise<boolean>;
}

/**
 * 生成标准租户作用域 CRUD 路由（GET /、GET /:id、POST /、PUT /:id、DELETE /:id）。
 *
 * 消除 config/portfolio/run/tactical-config 等路由文件里重复的
 * requireTenantId + requireUuidParam + 404 sendProblem 样板。
 */
// eslint-disable-next-line max-lines-per-function
export function tenantCrudRoutes<T>(
  service: TenantCrudRepo<T>,
  cfg: TenantCrudConfig,
): Router {
  const router = Router();
  const handler = cfg.metricPrefix ? asyncRouteHandler : crudRouteHandler;
  const endpoint = (action: string): string | undefined =>
    cfg.metricPrefix ? `${cfg.metricPrefix}-${action}` : undefined;

  router.get(
    '/',
    handler(
      async (req: Request, res: Response): Promise<void> => {
        const tenantId = requireTenantId(req as AuthenticatedRequest, res);
        if (!tenantId) return;
        const limit = req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : 50;
        const offset = req.query.offset ? Math.max(Number(req.query.offset) || 0, 0) : 0;
        res.json({
          success: true,
          data: await service.list(tenantId, Math.max(1, limit), offset),
        });
      },
      { logMsg: `[${cfg.resource}] 列表失败`, code: `${cfg.codePrefix}_LIST_FAILED`, endpoint: endpoint('list') },
    ),
  );

  router.get(
    '/:id',
    handler(
      async (req: Request, res: Response): Promise<void> => {
        const tenantId = requireTenantId(req as AuthenticatedRequest, res);
        if (!tenantId) return;
        if (!requireUuidParam(res, req.params.id)) return;
        const item = await service.get(tenantId, req.params.id);
        if (!item) {
          sendProblem(res, 404, cfg.notFoundCode);
          return;
        }
        res.json({ success: true, data: item });
      },
      { logMsg: `[${cfg.resource}] 获取失败`, code: `${cfg.codePrefix}_GET_FAILED`, endpoint: endpoint('get') },
    ),
  );

  router.post(
    '/',
    ...(cfg.createSchema ? [validate(cfg.createSchema)] : []),
    handler(
      async (req: Request, res: Response): Promise<void> => {
        const tenantId = requireTenantId(req as AuthenticatedRequest, res);
        if (!tenantId) return;
        if (cfg.beforeCreate && !(await cfg.beforeCreate(req as AuthenticatedRequest, res))) return;
        const created = await service.create(
          tenantId,
          ownerOf(req as AuthenticatedRequest),
          req.body,
        );
        res.status(201).json({ success: true, data: created });
      },
      { logMsg: `[${cfg.resource}] 创建失败`, code: `${cfg.codePrefix}_CREATE_FAILED`, endpoint: endpoint('create') },
    ),
  );

  if (service.update) {
    router.put(
      '/:id',
      ...(cfg.updateSchema ? [validate(cfg.updateSchema)] : []),
      handler(
        async (req: Request, res: Response): Promise<void> => {
          const tenantId = requireTenantId(req as AuthenticatedRequest, res);
          if (!tenantId) return;
          if (!requireUuidParam(res, req.params.id)) return;
          const updated = await service.update!(tenantId, req.params.id, req.body);
          if (!updated) {
            sendProblem(res, 404, cfg.notFoundCode);
            return;
          }
          res.json({ success: true, data: updated });
        },
        { logMsg: `[${cfg.resource}] 更新失败`, code: `${cfg.codePrefix}_UPDATE_FAILED`, endpoint: endpoint('update') },
      ),
    );
  }

  router.delete(
    '/:id',
    handler(
      async (req: Request, res: Response): Promise<void> => {
        const tenantId = requireTenantId(req as AuthenticatedRequest, res);
        if (!tenantId) return;
        if (!requireUuidParam(res, req.params.id)) return;
        const ok = await service.remove(tenantId, req.params.id);
        if (!ok) {
          sendProblem(res, 404, cfg.notFoundCode);
          return;
        }
        res.json({ success: true, data: { id: req.params.id, deleted: true } });
      },
      { logMsg: `[${cfg.resource}] 删除失败`, code: `${cfg.codePrefix}_DELETE_FAILED`, endpoint: endpoint('delete') },
    ),
  );

  return router;
}
