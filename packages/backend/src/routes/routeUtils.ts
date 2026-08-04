/** 路由层共享工具 — 错误翻译 + 异步路由包装 + 租户 CRUD 路由生成。 */
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

function translateError(res: Response, error: unknown): 'engine' | 'app' | null {
  if (error instanceof EngineUnavailableError) {
    sendProblem(res, 503, 'ENGINE_UNAVAILABLE', undefined, {
      headers: { 'Retry-After': String(error.retryAfterSeconds) },
    });
    return 'engine';
  }
  if (error instanceof UpstreamProblemError) {
    sendProblem(res, error.status, error.code);
    return 'engine';
  }
  if (error instanceof ApplicationError) {
    sendProblem(res, error.statusCode, error.errorCode);
    return 'app';
  }
  if (error instanceof TimeoutError) {
    sendProblem(res, 503, 'COMPUTE_TIMEOUT');
    return 'app';
  }
  return null;
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

type RouteHandlerFn = (req: AuthenticatedRequest, res: Response) => Promise<void>;

function baseHandler(
  fn: RouteHandlerFn,
  errorConfig: RouteErrorConfig,
  mode: 'translate' | 'plain',
): RequestHandler {
  return async (req, res): Promise<void> => {
    try {
      await fn(req as AuthenticatedRequest, res);
    } catch (error) {
      const translated = mode === 'translate' ? translateError(res, error) : null;
      if (translated) {
        if (translated === 'engine') recordDegraded(errorConfig.endpoint);
        else recordEndpointError(errorConfig.endpoint);
        return;
      }
      recordEndpointError(errorConfig.endpoint);
      logger.error(
        {
          err: error as Error,
          ...(mode === 'plain' ? { path: req.path, method: req.method } : {}),
        },
        errorConfig.logMsg,
      );
      sendProblem(res, 500, errorConfig.code);
    }
  };
}

export const asyncRouteHandler = (
  fn: RouteHandlerFn,
  errorConfig: RouteErrorConfig,
): RequestHandler => baseHandler(fn, errorConfig, 'translate');
export const crudRouteHandler = (
  fn: RouteHandlerFn,
  errorConfig: RouteErrorConfig,
): RequestHandler => baseHandler(fn, errorConfig, 'plain');

export function tenantHandler(
  logMsg: string,
  code: string,
  fn: (req: AuthenticatedRequest, res: Response, tenantId: string) => Promise<void>,
): RequestHandler {
  return crudRouteHandler(
    async (req, res) => {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      await fn(req, res, tenantId);
    },
    { logMsg, code },
  );
}

export function jsonRoute(
  logMsg: string,
  code: string,
  fn: (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
): RequestHandler {
  return crudRouteHandler(
    async (req, res) => {
      res.json({ success: true, data: await fn(req, res) });
    },
    { logMsg, code },
  );
}

/** 租户作用域 CRUD 仓储最小接口（RLS 隔离边界） */
interface TenantCrudRepo<T> {
  list(tenantId: string, limit?: number, offset?: number): Promise<T[]>;
  get(tenantId: string, id: string): Promise<T | null>;
  create(tenantId: string, ownerUserId: string | null, input: unknown): Promise<T>;
  update?(tenantId: string, id: string, input: unknown): Promise<T | null>;
  remove(tenantId: string, id: string): Promise<boolean>;
}

interface TenantCrudConfig {
  resource: string;
  codePrefix: string;
  notFoundCode: string;
  createSchema?: ZodSchema;
  updateSchema?: ZodSchema;
  metricPrefix?: string;
  beforeCreate?: (req: AuthenticatedRequest, res: Response) => Promise<boolean>;
}

const CRUD_LABELS: Record<string, string> = {
  list: '列表',
  get: '获取',
  create: '创建',
  update: '更新',
  delete: '删除',
};

export function tenantCrudRoutes<T>(service: TenantCrudRepo<T>, cfg: TenantCrudConfig): Router {
  const router = Router();
  const handler = cfg.metricPrefix ? asyncRouteHandler : crudRouteHandler;
  const h = (action: string, fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    handler(fn, {
      logMsg: `[${cfg.resource}] ${CRUD_LABELS[action]}失败`,
      code: `${cfg.codePrefix}_${action.toUpperCase()}_FAILED`,
      ...(cfg.metricPrefix ? { endpoint: `${cfg.metricPrefix}-${action}` } : {}),
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
      res.status(201).json({
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
