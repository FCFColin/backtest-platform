import { Router } from 'express';
import { backtestQueue } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';

// Architecture: 任务状态查询端点
// 企业为何需要：异步任务提交后，客户端需轮询获取结果
// 权衡：轮询模式不如WebSocket实时，但实现简单且RESTful

export const jobRoutes = Router();

/** 授权上下文：包含任务所有权与多租户隔离判定所需的全部字段 */
interface JobAuthContext {
  ownerId: unknown;
  isOwner: boolean;
  isAdmin: boolean;
  jobTenant: unknown;
  tenantMatches: boolean;
  platformAdmin: boolean;
}

/** 判断请求方是否有权访问该任务（所有权 + 多租户隔离） */
function isJobAccessible(ctx: JobAuthContext): boolean {
  const hasOwnership = ctx.isOwner || ctx.isAdmin;
  const passesTenantCheck = ctx.tenantMatches || ctx.platformAdmin;
  return hasOwnership && passesTenantCheck;
}

/** 构建任务查询响应体 */
function buildJobResult(
  job: NonNullable<Awaited<ReturnType<typeof backtestQueue.getJob>>>,
  state: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: job.id,
    type: job.data.type,
    state,
    createdAt: job.timestamp,
    processedAt: job.processedOn,
    finishedAt: job.finishedOn,
  };

  if (state === 'completed' && job.returnvalue) {
    result.result = job.returnvalue;
  } else if (state === 'failed') {
    logger.error(
      { middleware: 'jobRoutes', jobId: job.id, failedReason: job.failedReason },
      '[jobRoutes] 任务执行失败',
    );
    result.error = 'Job execution failed';
  }

  return result;
}

/** 从请求与任务中构建授权上下文 */
function buildJobAuthContext(
  job: Awaited<ReturnType<typeof backtestQueue.getJob>>,
  requester: NonNullable<AuthenticatedRequest['user']>,
  reqTenantId: string | undefined,
): JobAuthContext {
  const ownerId = job?.data?.userId;
  const jobTenant = job?.data?.tenantId;
  return {
    ownerId,
    isOwner: ownerId !== undefined && ownerId === requester.sub,
    isAdmin: requester.role === 'admin',
    jobTenant,
    tenantMatches: !jobTenant || jobTenant === reqTenantId,
    platformAdmin: requester.platform_admin === true,
  };
}

/** 授权拒绝时的日志上下文 */
interface DenyLogCtx {
  jobId: string;
  requesterSub: string;
  reqTenantId: string | undefined;
}

/** 授权检查：不可访问时发送 404 并返回 true（已处理） */
function denyIfInaccessible(
  res: import('express').Response,
  job: Awaited<ReturnType<typeof backtestQueue.getJob>>,
  authCtx: JobAuthContext,
  logCtx: DenyLogCtx,
): boolean {
  const accessible = !!job && isJobAccessible(authCtx);
  if (job && !accessible) {
    logger.warn(
      {
        middleware: 'jobRoutes',
        jobId: logCtx.jobId,
        requester: logCtx.requesterSub,
        owner: authCtx.ownerId,
        jobTenant: authCtx.jobTenant,
        reqTenant: logCtx.reqTenantId,
      },
      '[jobRoutes] 拒绝越权访问任务结果',
    );
  }
  if (!accessible) {
    sendProblem(res, 404, 'JOB_NOT_FOUND', 'Not Found', {
      detail: `Job ${logCtx.jobId} not found`,
    });
    return true;
  }
  return false;
}

/**
 * GET /api/v1/jobs/:id — 查询异步任务状态与结果。
 *
 * Security (ADR-019): 修复 IDOR（OWASP API1 / Broken Object Level Authorization）。
 * 企业为何需要：任务结果可能包含用户私有的回测组合与参数。此前任何调用方只需遍历/猜测
 *   jobId 即可读取他人结果与内部失败原因（failedReason），属于水平越权。
 * 做法：要求认证（路由挂载 jwtAuth），仅任务提交者本人或 admin 可读取；缺少 owner 信息
 *   的历史/匿名任务对非 admin 一律视为不可见，返回 404（不泄露任务是否存在）。
 * 权衡：匿名提交的任务将无法通过本端点回取——生产环境 compute 端点强制认证后不存在匿名任务。
 */
jobRoutes.get('/jobs/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const requester = req.user;
    if (!requester) {
      sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', {
        detail: 'Authentication required to query job status',
      });
      return;
    }

    const job = await backtestQueue.getJob(req.params.id);
    if (!job) {
      sendProblem(res, 404, 'JOB_NOT_FOUND', 'Not Found', {
        detail: `Job ${req.params.id} not found`,
      });
      return;
    }
    const authCtx = buildJobAuthContext(job, requester, req.tenantId);

    if (
      denyIfInaccessible(res, job, authCtx, {
        jobId: req.params.id,
        requesterSub: requester.sub,
        reqTenantId: req.tenantId,
      })
    )
      return;

    const state = await job.getState();
    res.json(buildJobResult(job, state));
  } catch (error) {
    logger.error(
      { middleware: 'jobRoutes', err: (error as Error).message },
      '[jobRoutes] 查询任务状态失败',
    );
    sendProblem(res, 500, 'JOB_STATUS_ERROR', 'Internal Server Error', {
      detail: 'Failed to fetch job status',
    });
  }
});
