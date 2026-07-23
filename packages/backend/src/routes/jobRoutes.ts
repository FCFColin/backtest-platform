import { Router, type Request, type Response } from 'express';
import { backtestQueue } from '../queues/backtestQueue.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { crudRouteHandler } from './routeUtils.js';

// Architecture: 任务状态查询端点
// 企业为何需要：异步任务提交后，客户端需轮询获取结果
// 权衡：轮询模式不如WebSocket实时，但实现简单且RESTful

export const jobRoutes = Router();

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

/**
 * 授权检查：构建上下文 + 验证所有权/租户隔离；不可访问时发送 404。
 *
 * @returns true 表示已拒绝（响应已发送），false 表示授权通过
 */
function authorizeJob(
  res: Response,
  job: NonNullable<Awaited<ReturnType<typeof backtestQueue.getJob>>>,
  requester: NonNullable<AuthenticatedRequest['user']>,
  reqTenantId: string | undefined,
  jobId: string,
): boolean {
  const ownerId = job.data?.userId;
  const jobTenant = job.data?.tenantId;
  const hasOwnership =
    (ownerId !== undefined && ownerId === requester.sub) || requester.role === 'admin';
  const passesTenantCheck =
    !jobTenant || jobTenant === reqTenantId || requester.platform_admin === true;

  if (!hasOwnership || !passesTenantCheck) {
    logger.warn(
      {
        middleware: 'jobRoutes',
        jobId,
        requester: requester.sub,
        owner: ownerId,
        jobTenant,
        reqTenant: reqTenantId,
      },
      '[jobRoutes] 拒绝越权访问任务结果',
    );
    sendProblem(res, 404, 'JOB_NOT_FOUND');
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
jobRoutes.get(
  '/jobs/:id',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const requester = authReq.user;
      if (!requester) {
        sendProblem(res, 401, 'UNAUTHORIZED');
        return;
      }

      const job = await backtestQueue.getJob(req.params.id);
      if (!job) {
        sendProblem(res, 404, 'JOB_NOT_FOUND');
        return;
      }

      if (authorizeJob(res, job, requester, authReq.tenantId, req.params.id)) return;

      const state = await job.getState();
      res.json({ success: true, data: buildJobResult(job, state) });
    },
    {
      logMsg: '[jobRoutes] 查询任务状态失败',
      code: 'JOB_STATUS_ERROR',
    },
  ),
);
