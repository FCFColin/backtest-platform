import { Router } from 'express';
import type { Response, Request, RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { sendProblem } from '../utils/errors.js';
import { EngineUnavailableError } from '../utils/engineClient.js';
import { isUuid } from '../utils/misc.js';
import { translateToProblem } from '../utils/errorMapper.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest, recordDegradedResponse } from '../utils/metrics.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { hasTenant } from '../middleware/tenantContext.js';
import { jobAccessGranted } from '../middleware/jobAccess.js';
import { backtestQueue } from '../queues/backtestQueue.js';
import { getRun } from '../repositories/backtestRunRepo.js';
import { validate } from '../middleware/miscMiddleware.js';
import type { Warning } from '../application/backtest-helpers.js';
type BacktestResult = { data: unknown; warnings?: (Warning | string)[]; dateRange?: unknown } & {
  degraded?: boolean;
  degradedWarning?: string;
};
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
type Job = NonNullable<Awaited<ReturnType<typeof backtestQueue.getJob>>>;
function mapJobState(bullmqState: string): 'queued' | 'running' | 'completed' | 'failed' {
  if (bullmqState === 'completed') return 'completed';
  if (bullmqState === 'failed') return 'failed';
  if (bullmqState === 'delayed') return 'queued';
  return 'running';
}
export function buildJobStatus(job: Job, state: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: job.id,
    status: mapJobState(state),
    progress: typeof job.progress === 'number' ? job.progress : 0,
    createdAt: job.timestamp,
    processedAt: job.processedOn,
    finishedAt: job.finishedOn,
  };
  if (state === 'completed' && job.returnvalue) {
    const rv = job.returnvalue as { status?: string; result?: unknown; error?: string };
    if (rv.status === 'completed' && rv.result) data.result = rv.result;
    else if (rv.status === 'failed') data.error = rv.error;
    else data.result = rv;
  } else if (state === 'failed') data.error = 'Job execution failed';
  return data;
}
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
  if (job) {
    if (jobAccessGranted(job, req.user, req.tenantId)) return job;
    sendProblem(res, 404, 'JOB_NOT_FOUND');
    return null;
  }
  return resolveAuthorizedJobFromDb(req, res, jobId);
}

// DB 兜底：BullMQ 已 removeOnComplete/数据丢失但 backtest_runs 有行时，用 DB 行拼出
// buildJobStatus 可消费的形状。owner/tenant 校验与 jobAccessGranted 同语义（fail-closed）。
async function resolveAuthorizedJobFromDb(
  req: AuthenticatedRequest,
  res: Response,
  jobId: string,
): Promise<Job | null> {
  if (!isUuid(jobId) || !req.tenantId) {
    sendProblem(res, 404, 'JOB_NOT_FOUND');
    return null;
  }
  let run: Awaited<ReturnType<typeof getRun>> | null = null;
  try {
    run = await getRun(req.tenantId, jobId);
  } catch (err) {
    logger.warn({ err, jobId }, '[routeUtils] 状态查询 DB 兜底失败');
  }
  if (!run) {
    sendProblem(res, 404, 'JOB_NOT_FOUND');
    return null;
  }
  // getRun 已按租户 RLS 查询（withTenant），租户匹配由此保证；将 tenantId 注入 data
  // 使 jobAccessGranted 的租户判定与 BullMQ 路径同语义
  if (!jobAccessGranted({ data: { ...run, tenantId: req.tenantId } }, req.user, req.tenantId)) {
    sendProblem(res, 404, 'JOB_NOT_FOUND');
    return null;
  }
  // DB 行 status=pending 且队列已无此任务 → 与清扫语义一致：队列中消失的 pending 即 stale 失败
  const state = run.status === 'pending' ? 'failed' : run.status;
  return {
    id: jobId,
    data: run,
    timestamp: Date.parse(run.createdAt),
    processedOn: Date.parse(run.createdAt),
    finishedOn: state === 'completed' || state === 'failed' ? Date.parse(run.createdAt) : undefined,
    progress: 0,
    state,
    getState: async () => state,
    returnvalue: state === 'completed' ? { status: 'completed', result: run.result } : undefined,
  } as unknown as Job;
}
interface RouteErrorConfig {
  logMsg: string;
  code: string;
  endpoint?: string;
}
const recordEndpointError = (endpoint?: string) =>
  endpoint && recordBacktestRequest(endpoint, 'sync', 'error');
type RouteHandlerFn = (req: AuthenticatedRequest, res: Response) => Promise<void>;
function baseHandler(fn: RouteHandlerFn, errorConfig: RouteErrorConfig): RequestHandler {
  return async (req, res): Promise<void> => {
    try {
      await fn(req as AuthenticatedRequest, res);
    } catch (error) {
      if (translateToProblem(res, error)) {
        if (error instanceof EngineUnavailableError && errorConfig.endpoint) {
          recordBacktestRequest(errorConfig.endpoint, 'sync', 'error');
          recordDegradedResponse(errorConfig.endpoint, 'engine_unavailable');
        } else recordEndpointError(errorConfig.endpoint);
        return;
      }
      recordEndpointError(errorConfig.endpoint);
      logger.error({ err: error as Error, path: req.path, method: req.method }, errorConfig.logMsg);
      sendProblem(res, 500, errorConfig.code);
    }
  };
}
export function sendData(res: Response, data: unknown): void {
  res.json({ success: true, data });
}
export function sendCreated(res: Response, data: unknown): void {
  res.status(201).json({ success: true, data });
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
function buildBacktestResponse({
  data,
  warnings,
  dateRange,
  degraded,
  degradedWarning,
}: BacktestResult): Record<string, unknown> {
  const resp: Record<string, unknown> = { success: true, data };
  if (warnings && warnings.length > 0)
    resp.warnings = warnings.map((w: Warning | string): Warning =>
      typeof w === 'string' ? { code: 'WARNING', message: w } : w,
    );
  if (dateRange) resp.dateRange = dateRange;
  if (degraded) resp.degraded = true;
  if (degradedWarning) resp.degradedWarning = degradedWarning;
  return resp;
}
export function plainCompute(
  metric: string,
  code: string,
  fn: (req: AuthenticatedRequest) => Promise<unknown>,
  opts: SyncComputeOpts & { shape?: (result: unknown) => unknown } = {},
): RequestHandler {
  return crudRouteHandler(
    async (req, res) => {
      if (opts.guard && !(await opts.guard(req, res))) return;
      const startTime = Date.now();
      if (opts.startLog) logger.info(opts.startLog(req));
      const result = await fn(req);
      if (opts.recordSuccess) recordBacktestRequest(metric, 'sync', 'success');
      res.json(
        opts.shape
          ? opts.shape(result)
          : typeof result === 'object' &&
              result !== null &&
              'data' in result &&
              'degraded' in result
            ? buildBacktestResponse(result as BacktestResult)
            : { success: true, data: result },
      );
      logger.info(`[${metric}] completed in ${Date.now() - startTime}ms`);
    },
    { logMsg: opts.logMsg ?? `[${metric}] 失败`, code, endpoint: metric },
  );
}
export function computeRoute(
  metric: string,
  logMsg: string,
  code: string,
  fn: (req: AuthenticatedRequest) => Promise<BacktestResult>,
): RequestHandler {
  return plainCompute(metric, code, fn, {
    logMsg,
    recordSuccess: true,
    shape: (r) => buildBacktestResponse(r as BacktestResult),
  });
}
export const crudRouteHandler = baseHandler;
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
export interface TenantCrudRepo<T> {
  list(tenantId: string, limit?: number, offset?: number): Promise<T[]>;
  get(tenantId: string, id: string): Promise<T | null>;
  create(tenantId: string, ownerUserId: string | null, input: unknown): Promise<T>;
  update?(tenantId: string, id: string, input: unknown): Promise<T | null>;
  remove(tenantId: string, id: string): Promise<boolean>;
}
export interface TenantCrudConfig {
  resource: string;
  codePrefix: string;
  notFoundCode: string;
  createSchema?: ZodSchema;
  updateSchema?: ZodSchema;
  metricPrefix?: string;
  beforeCreate?: (req: AuthenticatedRequest, res: Response) => Promise<boolean>;
}
export function tenantCrudRoutes<T>(service: TenantCrudRepo<T>, cfg: TenantCrudConfig): Router {
  const router = Router(),
    handler = crudRouteHandler,
    h = (action: string, fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
      handler(fn as RouteHandlerFn, {
        logMsg: `[${cfg.resource}] ${action}失败`,
        code: `${cfg.codePrefix}_${action.toUpperCase()}_FAILED`,
        ...(cfg.metricPrefix ? { endpoint: `${cfg.metricPrefix}-${action}` } : {}),
      }),
    tenantOf = (req: Request, res: Response): string | null =>
      requireTenantId(req as AuthenticatedRequest, res);
  const list = h('list', async (req, res) => {
    const tenantId = tenantOf(req, res);
    if (!tenantId) return;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200)),
      offset = Math.max(Number(req.query.offset) || 0, 0);
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
    const created = await service.create(tenantId, ownerOf(req as AuthenticatedRequest), req.body);
    sendCreated(res, created);
  });
  const update = h('update', async (req, res) => {
    const tenantId = tenantOf(req, res);
    if (!tenantId || !requireUuidParam(res, req.params.id)) return;
    const updated = service.update
      ? await service.update(tenantId, req.params.id, req.body)
      : await service.get(tenantId, req.params.id);
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
