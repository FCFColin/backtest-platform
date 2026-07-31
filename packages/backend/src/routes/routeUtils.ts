/**
 * 路由层共享工具 — HTTP 适配层关注点。
 * 错误翻译（应用错误 → HTTP 状态码）+ 统一异步路由包装 + 租户 CRUD 路由生成。
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

/** 引擎不可用 → 503 + Retry-After（ADR-031 fail-closed）。已处理返回 true。 */
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

/** 应用错误 → 对应 HTTP 状态码 + RFC 7807（消除路由层字符串匹配错误的反模式）。已处理返回 true。 */
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

function recordEndpointError(endpoint: string | undefined): void {
  if (endpoint) recordBacktestRequest(endpoint, 'sync', 'error');
}
function recordDegraded(endpoint: string | undefined): void {
  if (!endpoint) return;
  recordBacktestRequest(endpoint, 'sync', 'error');
  recordDegradedResponse(endpoint, 'engine_unavailable');
}

/**
 * 统一异步路由包装：错误优先级 EngineUnavailable→503/Retry-After、ApplicationError→对应状态码、其余→500。
 */
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

/** CRUD 路由包装：不耦合引擎指标，统一 500 兜底；handler 内 sendProblem 的 4xx/404 不被拦截。 */
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

/** 租户作用域 CRUD 仓储最小接口：所有方法以 tenantId 为首参（RLS 隔离边界），update 可选。 */
export interface TenantCrudRepo<T> {
  list(tenantId: string, limit?: number, offset?: number): Promise<T[]>;
  get(tenantId: string, id: string): Promise<T | null>;
  create(tenantId: string, ownerUserId: string | null, input: unknown): Promise<T>;
  update?(tenantId: string, id: string, input: unknown): Promise<T | null>;
  remove(tenantId: string, id: string): Promise<boolean>;
}

export interface TenantCrudConfig {
  resource: string; // 日志前缀，如 'configs' → '[configs] 列表失败'
  codePrefix: string; // 错误码前缀，如 'CONFIG' → CONFIG_LIST_FAILED
  notFoundCode: string; // 404 错误码，如 'CONFIG_NOT_FOUND'
  createSchema?: ZodSchema;
  updateSchema?: ZodSchema;
  metricPrefix?: string; // 设置则用 asyncRouteHandler（映射领域错误 + 记录计算指标），否则 crudRouteHandler
  beforeCreate?: (req: AuthenticatedRequest, res: Response) => Promise<boolean>; // 创建前钩子（如配额检查）；返回 false 表示已响应拒绝
}

/** 生成标准租户作用域 CRUD 路由（GET /、GET /:id、POST /、PUT /:id、DELETE /:id），消除重复样板。 */

export function tenantCrudRoutes<T>(service: TenantCrudRepo<T>, cfg: TenantCrudConfig): Router {
  const router = Router();
  const handler = cfg.metricPrefix ? asyncRouteHandler : crudRouteHandler;
  const endpoint = (action: string): string | undefined =>
    cfg.metricPrefix ? `${cfg.metricPrefix}-${action}` : undefined;
  const LABELS: Record<string, string> = {
    list: '列表',
    get: '获取',
    create: '创建',
    update: '更新',
    delete: '删除',
  };
  const h = (action: string, fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    handler(fn, {
      logMsg: `[${cfg.resource}] ${LABELS[action]}失败`,
      code: `${cfg.codePrefix}_${action.toUpperCase()}_FAILED`,
      endpoint: endpoint(action),
    });
  const tenantOf = (req: Request, res: Response): string | null =>
    requireTenantId(req as AuthenticatedRequest, res);

  router.get(
    '/',
    h('list', async (req, res) => {
      const tenantId = tenantOf(req, res);
      if (!tenantId) return;
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      res.json({ success: true, data: await service.list(tenantId, limit, offset) });
    }),
  );

  router.get(
    '/:id',
    h('get', async (req, res) => {
      const tenantId = tenantOf(req, res);
      if (!tenantId || !requireUuidParam(res, req.params.id)) return;
      const item = await service.get(tenantId, req.params.id);
      if (!item) {
        sendProblem(res, 404, cfg.notFoundCode);
        return;
      }
      res.json({ success: true, data: item });
    }),
  );

  router.post(
    '/',
    ...(cfg.createSchema ? [validate(cfg.createSchema)] : []),
    h('create', async (req, res) => {
      const tenantId = tenantOf(req, res);
      if (!tenantId) return;
      if (cfg.beforeCreate && !(await cfg.beforeCreate(req as AuthenticatedRequest, res))) return;
      res
        .status(201)
        .json({
          success: true,
          data: await service.create(tenantId, ownerOf(req as AuthenticatedRequest), req.body),
        });
    }),
  );

  if (service.update) {
    router.put(
      '/:id',
      ...(cfg.updateSchema ? [validate(cfg.updateSchema)] : []),
      h('update', async (req, res) => {
        const tenantId = tenantOf(req, res);
        if (!tenantId || !requireUuidParam(res, req.params.id)) return;
        const updated = await service.update!(tenantId, req.params.id, req.body);
        if (!updated) {
          sendProblem(res, 404, cfg.notFoundCode);
          return;
        }
        res.json({ success: true, data: updated });
      }),
    );
  }

  router.delete(
    '/:id',
    h('delete', async (req, res) => {
      const tenantId = tenantOf(req, res);
      if (!tenantId || !requireUuidParam(res, req.params.id)) return;
      const ok = await service.remove(tenantId, req.params.id);
      if (!ok) {
        sendProblem(res, 404, cfg.notFoundCode);
        return;
      }
      res.json({ success: true, data: { id: req.params.id, deleted: true } });
    }),
  );

  return router;
}
