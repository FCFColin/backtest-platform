/**
 * 管理后台审计日志查询路由（P2-03 不可篡改审计存储）
 *
 * 挂载于 /api/v1/admin/audit-logs，鉴权链：jwtAuth → resolveTenant →
 * requirePermission(ADMIN_ACCESS) → auditLog → idempotencyKey（由 adminMiddleware 提供）。
 * 审计日志含全量操作明细，属平台级管理操作，仅 ADMIN_ACCESS 权限可查询。
 *
 * 端点：
 * - GET /                分页查询审计日志（支持 org_id/event_type/user_id/action/日期范围过滤）
 * - GET /:id/verify      校验指定审计日志的 HMAC 完整性（篡改检测）
 *
 * 企业理由：管理后台需提供审计日志检索能力以满足合规审计与安全事件追溯需求。
 * HMAC 完整性校验端点使管理员可主动验证审计记录是否被篡改——重算 HMAC 并与
 * 存储签名比对，不匹配即表明 payload 被修改。这是双层防篡改体系（DB HMAC 检测 +
 * MinIO WORM 不可变）的 DB 层校验入口。
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { crudRouteHandler, requireUuidParam } from './routeUtils.js';
import { queryAuditLogs, verifyAuditIntegrity } from '../application/auditStorageService.js';
import { paginationQuerySchema } from '../schemas/shared.js';

const router = Router();

const querySchema = z.object({
  org_id: z.string().uuid().optional(),
  event_type: z.string().trim().max(100).optional(),
  user_id: z.string().uuid().optional(),
  action: z
    .enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'READ', 'EXPORT', 'CONFIG'])
    .optional(),
  // 接受 ISO 8601 日期或日期时间，由 PostgreSQL 自动解析（created_at >= / <=）
  start_date: z.string().min(1).optional(),
  end_date: z.string().min(1).optional(),
  ...paginationQuerySchema,
});

/**
 * GET /api/v1/admin/audit-logs
 * 分页查询审计日志（支持多过滤条件组合）。
 *
 * 查询参数：
 * - org_id: 组织 UUID
 * - event_type: 事件类型
 * - user_id: 用户 UUID
 * - action: 操作动作（CREATE/UPDATE/DELETE/LOGIN/LOGOUT/READ/EXPORT/CONFIG）
 * - start_date / end_date: 创建时间范围（ISO 8601，闭区间）
 * - page: 页码（默认 1）
 * - limit: 每页条数（默认 50，上限 200）
 */
router.get(
  '/',
  validateQuery(querySchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      // validateQuery 中间件已用 zod coerce 将 page/limit 转为 number，
      // 但 Express 的 req.query 类型仍是 ParsedQs（string 值），
      // 需经 unknown 中转才能赋值到 zod 推断出的强类型。
      const q = req.query as unknown as z.infer<typeof querySchema>;
      const result = await queryAuditLogs(
        {
          orgId: q.org_id,
          eventType: q.event_type,
          userId: q.user_id,
          action: q.action,
          startDate: q.start_date,
          endDate: q.end_date,
        },
        q.page,
        q.limit,
      );
      res.json({ success: true, data: result });
    },
    { logMsg: '[auditRoutes] 查询审计日志失败', code: 'AUDIT_LOG_QUERY_FAILED' },
  ),
);

/**
 * GET /api/v1/admin/audit-logs/:id/verify
 * 校验指定审计日志的 HMAC 完整性。
 *
 * 重算 payload 的 HMAC-SHA256 并与存储的 hmac_signature 比对。
 * 签名不匹配即表明 payload 被篡改。
 *
 * @returns { valid: boolean, expected: string, actual: string }
 *          - valid: 是否通过校验
 *          - expected: 重算的签名
 *          - actual: 存储的签名
 */
router.get(
  '/:id/verify',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      if (!requireUuidParam(res, req.params.id)) return;
      const logId = req.params.id;
      const result = await verifyAuditIntegrity(logId);
      if (!result.valid && result.expected === '' && result.actual === '') {
        // 日志不存在
        sendProblem(res, 404, 'AUDIT_LOG_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: result });
    },
    { logMsg: '[auditRoutes] 校验审计完整性失败', code: 'AUDIT_LOG_VERIFY_FAILED' },
  ),
);

export default router;
