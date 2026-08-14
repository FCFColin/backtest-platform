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
import { jobAccessGranted } from '../middleware/jobAccess.js';
import { backtestQueue } from '../queues/backtestQueue.js';
import { validate } from '../middleware/miscMiddleware.js';
import type { Warning } from '../application/backtest-helpers.js';

type BacktestResult = {
  data: unknown;
  warnings?: (Warning | string)[];
  dateRange?: unknown;
} & { degraded?: boolean; degradedWarning?: string };

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
    sendProblem(res, error.statusCode, error.errorCode, error.errorTitle);
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

export type Job = NonNullable<Awaited<ReturnType<typeof backtestQueue.getJob>>>;

// 查找 + IDOR 鉴权 + 404/400 响应一次性收敛（ADR-007），backtest/jobs 两条状态路由共用
export async function resolveAuthorizedJob(
  req: AuthenticatedRequest,
  res: Response,
  jobId: string,
): Promise<Job | null> {
  if (!jobId) {
    sendProblem(res, 400, 'INVALID_ID');
    return null;
  }
  const job = await backtestQueue.getJob(jobId);
  if (!job || !jobAccessGranted(job, req.user, req.tenantId)) {
    sendProblem(res, 404, 'JOB_NOT_FOUND');
    return null;
  }
  return job;
}

interface RouteErrorConfig {
  logMsg: string;
  code: string;
  endpoint?: string;
}

const recordEndpointError = (endpoint?: string) =>
  endpoint && recordBacktestRequest(endpoint, 'sync', 'error');
const recordDegraded = (endpoint?: string) => {
  if (!endpoint) return;
  recordBacktestRequest(endpoint, 'sync', 'error');
  recordDegradedResponse(endpoint, 'engine_unavailable');
};

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

// 服务返回 { data, degraded? } 形态时（与 dataRoutes 的 sendDegraded 契约一致），
// 在响应顶层透出 degraded，供前端 apiClient 全局提示（ADR-008 数据降级可观测性）。
// 判别依据：plainCompute 服务统一返回 DegradedResult（恒带 degraded key）；引擎 envelope 只有 success/data。
function isBacktestResult(r: unknown): r is BacktestResult {
  return typeof r === 'object' && r !== null && 'data' in r && 'degraded' in r;
}

function buildBacktestResponse(result: BacktestResult): Record<string, unknown> {
  const response: Record<string, unknown> = { success: true, data: result.data };
  if (result.warnings && result.warnings.length > 0)
    response.warnings = result.warnings.map((w: Warning | string): Warning =>
      typeof w === 'string' ? { code: 'WARNING', message: w } : w,
    );
  if (result.dateRange) response.dateRange = result.dateRange;
  if (result.degraded) response.degraded = true;
  if (result.degradedWarning) response.degradedWarning = result.degradedWarning;
  return response;
}

function syncCompute(
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
      res.json(
        opts.shape
          ? opts.shape(result)
          : isBacktestResult(result)
            ? buildBacktestResponse(result)
            : { success: true, data: result },
      );
      logger.info(`[${metric}] completed in ${Date.now() - startTime}ms`);
    },
    { logMsg: opts.logMsg ?? `[${metric}] 失败`, code, endpoint: metric },
  );
}

export const plainCompute = syncCompute;

export function computeRoute(
  metric: string,
  logMsg: string,
  code: string,
  fn: (req: AuthenticatedRequest) => Promise<BacktestResult>,
): RequestHandler {
  return syncCompute(metric, code, fn, {
    logMsg,
    recordSuccess: true,
    shape: (r) => buildBacktestResponse(r as BacktestResult),
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
