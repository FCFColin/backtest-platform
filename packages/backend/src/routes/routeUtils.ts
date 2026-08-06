import { Router } from 'express';
import type { Response, Request, RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { sendProblem, UpstreamProblemError, ApplicationError } from '../utils/errors.js';
import { EngineUnavailableError } from '../utils/engineClient.js';
import { TimeoutError, isUuid } from '../utils/misc.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest, recordDegradedResponse } from '../utils/metrics.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { hasTenant } from '../middleware/tenantContext.js';
import { validate } from '../middleware/miscMiddleware.js';
import type { Warning } from '../application/backtest-helpers.js';

type BacktestResult = { data: unknown; warnings?: (Warning | string)[]; dateRange?: unknown };

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

export function sendData(res: Response, data: unknown): void {
  res.json({ success: true, data });
}
export function sendDegraded(res: Response, data: unknown, warning?: string): void {
  res.json({ success: true, data, degraded: true, ...(warning && { degradedWarning: warning }) });
}

type SyncComputeOpts = {
  startLog?: (req: AuthenticatedRequest) => string;
  guard?: (req: AuthenticatedRequest, res: Response) => boolean | Promise<boolean>;
  recordSuccess?: boolean;
  logMsg?: string;
};

function buildBacktestResponse(
  data: unknown,
  warnings: (Warning | string)[] = [],
  dateRange?: unknown,
): Record<string, unknown> {
  const response: Record<string, unknown> = { success: true, data };
  if (warnings.length > 0)
    response.warnings = warnings.map((w: Warning | string): Warning =>
      typeof w === 'string' ? { code: 'WARNING', message: w } : w,
    );
  if (dateRange) response.dateRange = dateRange;
  return response;
}

export function syncCompute(
  metric: string,
  code: string,
  fn: (req: AuthenticatedRequest) => Promise<unknown>,
  opts: SyncComputeOpts & { shape?: (result: unknown) => unknown } = {},
): RequestHandler {
  return asyncRouteHandler(
    async (req, res) => {
      if (opts.guard && !(await opts.guard(req, res))) return;
      const startTime = Date.now();
      if (opts.startLog) logger.info(opts.startLog(req));
      const result = await fn(req);
      if (opts.recordSuccess) recordBacktestRequest(metric, 'sync', 'success');
      res.json(opts.shape ? opts.shape(result) : { success: true, data: result });
      logger.info(`[${metric}] completed in ${Date.now() - startTime}ms`);
    },
    { logMsg: opts.logMsg ?? `[${metric}] 失败`, code, endpoint: metric },
  );
}

export const plainCompute = (
  metric: string,
  code: string,
  fn: (req: AuthenticatedRequest) => Promise<unknown>,
  opts?: SyncComputeOpts,
): RequestHandler => syncCompute(metric, code, fn, opts);

export function computeRoute(
  metric: string,
  logMsg: string,
  code: string,
  fn: (req: AuthenticatedRequest) => Promise<BacktestResult>,
): RequestHandler {
  return syncCompute(metric, code, fn, {
    logMsg,
    recordSuccess: true,
    shape: (r) => {
      const { data, warnings, dateRange } = r as BacktestResult;
      return buildBacktestResponse(data, warnings, dateRange);
    },
  });
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

export function tenantCrudRoutes<T>(service: TenantCrudRepo<T>, cfg: TenantCrudConfig): Router {
  const router = Router();
  const handler = cfg.metricPrefix ? asyncRouteHandler : crudRouteHandler;
  const h = (action: string, fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    handler(fn as RouteHandlerFn, {
      logMsg: `[${cfg.resource}] ${action}失败`,
      code: `${cfg.codePrefix}_${action.toUpperCase()}_FAILED`,
      ...(cfg.metricPrefix ? { endpoint: `${cfg.metricPrefix}-${action}` } : {}),
    });
  const tenantOf = (req: Request, res: Response): string | null =>
    requireTenantId(req as AuthenticatedRequest, res);

  const list = h('list', async (req, res) => {
    const tenantId = tenantOf(req, res);
    if (!tenantId) return;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    sendData(res, await service.list(tenantId, limit, offset));
  });
  const get = h('get', async (req, res) => {
    const tenantId = tenantOf(req, res);
    if (!tenantId || !requireUuidParam(res, req.params.id)) return;
    const item = await service.get(tenantId, req.params.id);
    if (!item) return sendProblem(res, 404, cfg.notFoundCode);
    sendData(res, item);
  });
  const create = h('create', async (req, res) => {
    const tenantId = tenantOf(req, res);
    if (!tenantId) return;
    if (cfg.beforeCreate && !(await cfg.beforeCreate(req as AuthenticatedRequest, res))) return;
    res.status(201).json({
      success: true,
      data: await service.create(tenantId, ownerOf(req as AuthenticatedRequest), req.body),
    });
  });
  const update = h('update', async (req, res) => {
    const tenantId = tenantOf(req, res);
    if (!tenantId || !requireUuidParam(res, req.params.id)) return;
    const updated = await service.update!(tenantId, req.params.id, req.body);
    if (!updated) return sendProblem(res, 404, cfg.notFoundCode);
    sendData(res, updated);
  });
  const remove = h('delete', async (req, res) => {
    const tenantId = tenantOf(req, res);
    if (!tenantId || !requireUuidParam(res, req.params.id)) return;
    if (!(await service.remove(tenantId, req.params.id)))
      return sendProblem(res, 404, cfg.notFoundCode);
    sendData(res, { id: req.params.id, deleted: true });
  });

  router.get('/', list);
  router.get('/:id', get);
  router.post('/', ...(cfg.createSchema ? [validate(cfg.createSchema)] : []), create);
  if (service.update)
    router.put('/:id', ...(cfg.updateSchema ? [validate(cfg.updateSchema)] : []), update);
  router.delete('/:id', remove);
  return router;
}
