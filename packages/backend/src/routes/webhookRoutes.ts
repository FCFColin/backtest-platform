/**
 * Webhook 端点管理路由（P2-02）
 *
 * 挂载于 /api/v1/webhooks，鉴权链：jwtAuth → resolveTenant → requireTenant →
 * requirePermission(ADMIN_ACCESS)。webhook 配置含签名密钥，属组织管理操作，
 * 与 API Key 管理同权限级别（ADR-033）。
 *
 * 端点：
 * - GET    /                 列出本组织 webhook 端点
 * - POST   /                 创建 webhook（校验 HTTPS URL）
 * - PUT    /:id              更新（url/description/subscribed_events/is_active）
 * - DELETE /:id              删除 webhook
 * - POST   /:id/test         发送测试事件（立即投递一次）
 * - GET    /:id/deliveries   投递历史（最近 100 条，分页）
 *
 * 企业理由：所有查询经 withTenant 开启租户事务（即便 webhook 表未启用 RLS，
 * 也通过显式 WHERE org_id=$1 收敛，与 api_keys 同模式）；secret 永不返回响应体。
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { validate } from '../middleware/validate.js';
import { emptyBodySchema } from '../schemas/shared.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { crudRouteHandler, requireTenantId, requireUuidParam } from './routeUtils.js';
import { withTenant } from '../db/pool.js';
import { deliverWebhook, createWebhook } from '../application/webhookService.js';
import { decrypt } from '../utils/envelopeEncryption.js';

const router = Router();

/** 默认投递历史分页上限 */
const DELIVERIES_PAGE_SIZE = 100;

/** 创建 webhook 请求体校验（HTTPS URL 强制） */
const createWebhookSchema = z.object({
  url: z
    .string()
    .trim()
    .url('URL 格式非法')
    .refine((v) => v.startsWith('https://'), 'URL 必须为 HTTPS'),
  secret: z.string().min(32, 'secret 至少 32 字符以保证 HMAC-SHA256 安全强度').max(256, 'secret 过长'),
  description: z.string().trim().max(500).optional(),
  subscribedEvents: z.array(z.string().trim().min(1)).min(1, '至少订阅一个事件'),
});

/** 更新 webhook 请求体校验（所有字段可选） */
const updateWebhookSchema = z.object({
  url: z
    .string()
    .trim()
    .url('URL 格式非法')
    .refine((v) => v.startsWith('https://'), 'URL 必须为 HTTPS')
    .optional(),
  description: z.string().trim().max(500).optional(),
  subscribedEvents: z.array(z.string().trim().min(1)).optional(),
  isActive: z.boolean().optional(),
});

/** 投递历史行映射（不含 payload 全量，仅状态字段用于排障） */
interface DeliveryRow {
  id: string;
  eventType: string;
  status: string;
  responseCode: number | null;
  attemptCount: number;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

function mapDeliveryRow(row: {
  id: string;
  event_type: string;
  status: string;
  response_code: number | null;
  attempt_count: number;
  next_retry_at: Date | string | null;
  delivered_at: Date | string | null;
  created_at: Date | string;
}): DeliveryRow {
  return {
    id: row.id,
    eventType: row.event_type,
    status: row.status,
    responseCode: row.response_code,
    attemptCount: row.attempt_count,
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at).toISOString() : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * GET /api/v1/webhooks
 * 列出当前组织的全部 webhook 端点（不含 secret）。
 */
router.get(
  '/',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const endpoints = await withTenant(orgId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, url, description, is_active, subscribed_events,
                  failed_consecutive_count, disabled_at, created_at, updated_at
             FROM webhook_endpoints
            WHERE org_id = $1
            ORDER BY created_at DESC`,
          [orgId],
        );
        return rows.map(
          (r: {
            id: string;
            url: string;
            description: string | null;
            is_active: boolean;
            subscribed_events: string[];
            failed_consecutive_count: number;
            disabled_at: Date | string | null;
            created_at: Date | string;
            updated_at: Date | string;
          }) => ({
            id: r.id,
            url: r.url,
            description: r.description,
            isActive: r.is_active,
            subscribedEvents: r.subscribed_events,
            failedConsecutiveCount: r.failed_consecutive_count,
            disabledAt: r.disabled_at ? new Date(r.disabled_at).toISOString() : null,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
          }),
        );
      });
      res.json({ success: true, data: endpoints });
    },
    { logMsg: '[webhookRoutes] 列出 webhook 失败', code: 'WEBHOOK_LIST_FAILED' },
  ),
);

/**
 * POST /api/v1/webhooks
 * 创建 webhook 端点（自动生成签名 secret 时使用请求体提供的 secret）。
 */
router.post(
  '/',
  validate(createWebhookSchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const body = req.body as {
        url: string;
        secret: string;
        description?: string;
        subscribedEvents: string[];
      };
      // C-024：通过 createWebhook 在入库前加密 secret，DB 仅存密文
      const created = await withTenant(orgId, async (client) =>
        createWebhook(client, {
          orgId,
          url: body.url,
          secret: body.secret,
          description: body.description,
          subscribedEvents: body.subscribedEvents,
        }),
      );
      res.status(201).json({
        success: true,
        data: {
          id: created.id,
          url: created.url,
          description: created.description,
          isActive: created.isActive,
          subscribedEvents: created.subscribedEvents,
          createdAt: new Date(created.createdAt).toISOString(),
        },
      });
    },
    { logMsg: '[webhookRoutes] 创建 webhook 失败', code: 'WEBHOOK_CREATE_FAILED' },
  ),
);

/**
 * PUT /api/v1/webhooks/:id
 * 更新 webhook（url/description/subscribed_events/is_active）。
 */
router.put(
  '/:id',
  validate(updateWebhookSchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      if (!requireUuidParam(res, req.params.id)) return;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const webhookId = req.params.id;
      const body = req.body as {
        url?: string;
        description?: string;
        subscribedEvents?: string[];
        isActive?: boolean;
      };
      const updated = await withTenant(orgId, async (client) => {
        const { rows, rowCount } = await client.query(
          `UPDATE webhook_endpoints
              SET url = COALESCE($3, url),
                  description = COALESCE($4, description),
                  subscribed_events = COALESCE($5, subscribed_events),
                  is_active = COALESCE($6, is_active)
            WHERE id = $1 AND org_id = $2
           RETURNING id, url, description, is_active, subscribed_events, updated_at`,
          [
            webhookId,
            orgId,
            body.url ?? null,
            body.description ?? null,
            body.subscribedEvents ?? null,
            body.isActive ?? null,
          ],
        );
        return { rows, rowCount };
      });
      if (!updated.rowCount || updated.rowCount === 0) {
        sendProblem(res, 404, 'WEBHOOK_NOT_FOUND');
        return;
      }
      const r = updated.rows[0];
      res.json({
        success: true,
        data: {
          id: r.id,
          url: r.url,
          description: r.description,
          isActive: r.is_active,
          subscribedEvents: r.subscribed_events,
          updatedAt: new Date(r.updated_at).toISOString(),
        },
      });
    },
    { logMsg: '[webhookRoutes] 更新 webhook 失败', code: 'WEBHOOK_UPDATE_FAILED' },
  ),
);

/**
 * DELETE /api/v1/webhooks/:id
 * 删除 webhook（级联删除投递历史，由 FK ON DELETE CASCADE 保证）。
 */
router.delete(
  '/:id',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      if (!requireUuidParam(res, req.params.id)) return;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const webhookId = req.params.id;
      const deleted = await withTenant(orgId, async (client) => {
        const { rowCount } = await client.query(
          `DELETE FROM webhook_endpoints WHERE id = $1 AND org_id = $2`,
          [webhookId, orgId],
        );
        return rowCount ?? 0;
      });
      if (deleted === 0) {
        sendProblem(res, 404, 'WEBHOOK_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: { id: webhookId, deleted: true } });
    },
    { logMsg: '[webhookRoutes] 删除 webhook 失败', code: 'WEBHOOK_DELETE_FAILED' },
  ),
);

/**
 * POST /api/v1/webhooks/:id/test
 * 发送测试事件：立即投递一次 WebhookTest 事件并记录投递历史。
 */
router.post(
  '/:id/test',
  validate(emptyBodySchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      if (!requireUuidParam(res, req.params.id)) return;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const webhookId = req.params.id;
      const testPayload = {
        event: 'WebhookTest',
        message: 'Test event from backtesting platform',
        timestamp: new Date().toISOString(),
        nonce: crypto.randomUUID(),
      };
      // 加载端点（含 secret 用于签名），创建投递记录并立即投递
      const result = await withTenant(orgId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, url, secret, secret_iv, secret_tag, secret_kid FROM webhook_endpoints WHERE id = $1 AND org_id = $2`,
          [webhookId, orgId],
        );
        if (rows.length === 0) return { notFound: true as const };
        const endpoint = rows[0];
        // 创建 pending 投递记录以便测试结果可追溯
        const ins = await client.query(
          `INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, status)
           VALUES ($1, 'WebhookTest', $2::jsonb, 'pending')
           RETURNING id`,
          [webhookId, JSON.stringify(testPayload)],
        );
        const deliveryId = ins.rows[0].id;
        // 立即尝试投递（脱离事务，HTTP 不应占用 DB 连接）
        return { notFound: false as const, endpoint, deliveryId };
      });
      if (result.notFound) {
        sendProblem(res, 404, 'WEBHOOK_NOT_FOUND');
        return;
      }
      // C-024：从 DB 读出密文 secret 并 decrypt 为明文用于 HMAC 签名
      const plaintextSecret = await decrypt({
        ciphertext: Buffer.isBuffer(result.endpoint.secret)
          ? result.endpoint.secret
          : Buffer.from(result.endpoint.secret),
        iv: Buffer.isBuffer(result.endpoint.secret_iv)
          ? result.endpoint.secret_iv
          : Buffer.from(result.endpoint.secret_iv),
        tag: Buffer.isBuffer(result.endpoint.secret_tag)
          ? result.endpoint.secret_tag
          : Buffer.from(result.endpoint.secret_tag),
        kid: result.endpoint.secret_kid,
      });
      const delivery = await deliverWebhook(
        { url: result.endpoint.url, secret: plaintextSecret },
        'WebhookTest',
        testPayload,
      );
      // 更新投递记录为最终状态（成功/失败，测试不进入重试队列）
      await withTenant(orgId, async (client) => {
        await client.query(
          `UPDATE webhook_deliveries
              SET status = $1, response_code = $2, response_body = $3,
                  attempt_count = 1, delivered_at = NOW(), next_retry_at = NULL
            WHERE id = $4`,
          [
            delivery.success ? 'success' : 'failed',
            delivery.responseCode,
            delivery.responseBody,
            result.deliveryId,
          ],
        );
      });
      res.json({
        success: true,
        data: {
          deliveryId: result.deliveryId,
          delivered: delivery.success,
          responseCode: delivery.responseCode,
          responseBody: delivery.responseBody,
        },
      });
    },
    { logMsg: '[webhookRoutes] 测试 webhook 失败', code: 'WEBHOOK_TEST_FAILED' },
  ),
);

/**
 * GET /api/v1/webhooks/:id/deliveries
 * 投递历史（最近 100 条，按创建时间倒序）。
 */
router.get(
  '/:id/deliveries',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      if (!requireUuidParam(res, req.params.id)) return;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const webhookId = req.params.id;
      const deliveries = await withTenant(orgId, async (client) => {
        // 校验端点归属本组织（防跨租户读取投递历史）
        const { rows: own } = await client.query(
          `SELECT 1 FROM webhook_endpoints WHERE id = $1 AND org_id = $2`,
          [webhookId, orgId],
        );
        if (own.length === 0) return null;
        const { rows } = await client.query(
          `SELECT id, event_type, status, response_code, attempt_count,
                  next_retry_at, delivered_at, created_at
             FROM webhook_deliveries
            WHERE endpoint_id = $1
            ORDER BY created_at DESC
            LIMIT $2`,
          [webhookId, DELIVERIES_PAGE_SIZE],
        );
        return rows.map(mapDeliveryRow);
      });
      if (deliveries === null) {
        sendProblem(res, 404, 'WEBHOOK_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: deliveries });
    },
    { logMsg: '[webhookRoutes] 查询投递历史失败', code: 'WEBHOOK_DELIVERIES_FAILED' },
  ),
);

export default router;
