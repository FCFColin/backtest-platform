/**
 * Webhook 端点管理路由（P2-02）。
 * 挂载于 /api/v1/webhooks，鉴权链：jwtAuth → resolveTenant → requireTenant → requirePermission(ADMIN_ACCESS)。
 * webhook 配置含签名密钥，属组织管理操作，与 API Key 管理同权限级别（ADR-033）。
 * 所有查询经 withTenant 开启租户事务（即便 webhook 表未启用 RLS，也通过显式 WHERE org_id=$1 收敛）；
 * secret 永不返回响应体。
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { validate } from '../middleware/miscMiddleware.js';
import { emptyBodySchema } from '../schemas/shared.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { crudRouteHandler, requireTenantId, requireUuidParam } from './routeUtils.js';
import { withTenant } from '../db/pool.js';
import { deliverWebhook, createWebhook } from '../application/webhookService.js';
import { decrypt } from '../utils/crypto.js';

const router = Router();
const DELIVERIES_PAGE_SIZE = 100;

const httpsUrl = z.string().trim().url('URL 格式非法').refine((v) => v.startsWith('https://'), 'URL 必须为 HTTPS');
const createWebhookSchema = z.object({
  url: httpsUrl,
  secret: z.string().min(32, 'secret 至少 32 字符以保证 HMAC-SHA256 安全强度').max(256, 'secret 过长'),
  description: z.string().trim().max(500).optional(),
  subscribedEvents: z.array(z.string().trim().min(1)).min(1, '至少订阅一个事件'),
});
const updateWebhookSchema = z.object({
  url: httpsUrl.optional(),
  description: z.string().trim().max(500).optional(),
  subscribedEvents: z.array(z.string().trim().min(1)).optional(),
  isActive: z.boolean().optional(),
});

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

function mapDeliveryRow(row: { id: string; event_type: string; status: string; response_code: number | null; attempt_count: number; next_retry_at: Date | string | null; delivered_at: Date | string | null; created_at: Date | string }): DeliveryRow {
  return {
    id: row.id,
    eventType: row.event_type,
    status: row.status,
    responseCode: row.response_code,
    attemptCount: row.attempt_count,
    nextRetryAt: toIso(row.next_retry_at),
    deliveredAt: toIso(row.delivered_at),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const toIso = (v: Date | string | null): string | null => (v ? new Date(v).toISOString() : null);

router.get(
  '/',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const endpoints = await withTenant(orgId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, url, description, is_active, subscribed_events, failed_consecutive_count, disabled_at, created_at, updated_at FROM webhook_endpoints WHERE org_id = $1 ORDER BY created_at DESC`,
          [orgId],
        );
        return rows.map(
          (r: { id: string; url: string; description: string | null; is_active: boolean; subscribed_events: string[]; failed_consecutive_count: number; disabled_at: Date | string | null; created_at: Date | string; updated_at: Date | string }) => ({
            id: r.id,
            url: r.url,
            description: r.description,
            isActive: r.is_active,
            subscribedEvents: r.subscribed_events,
            failedConsecutiveCount: r.failed_consecutive_count,
            disabledAt: toIso(r.disabled_at),
            createdAt: toIso(r.created_at),
            updatedAt: toIso(r.updated_at),
          }),
        );
      });
      res.json({ success: true, data: endpoints });
    },
    { logMsg: '[webhookRoutes] 列出 webhook 失败', code: 'WEBHOOK_LIST_FAILED' },
  ),
);

router.post(
  '/',
  validate(createWebhookSchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const body = req.body as { url: string; secret: string; description?: string; subscribedEvents: string[] };
      // C-024：通过 createWebhook 在入库前加密 secret，DB 仅存密文
      const created = await withTenant(orgId, (client) =>
        createWebhook(client, { orgId, url: body.url, secret: body.secret, description: body.description, subscribedEvents: body.subscribedEvents }),
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
      const body = req.body as { url?: string; description?: string; subscribedEvents?: string[]; isActive?: boolean };
      const updated = await withTenant(orgId, async (client) => {
        const { rows, rowCount } = await client.query(
          `UPDATE webhook_endpoints SET url = COALESCE($3, url), description = COALESCE($4, description), subscribed_events = COALESCE($5, subscribed_events), is_active = COALESCE($6, is_active) WHERE id = $1 AND org_id = $2 RETURNING id, url, description, is_active, subscribed_events, updated_at`,
          [webhookId, orgId, body.url ?? null, body.description ?? null, body.subscribedEvents ?? null, body.isActive ?? null],
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
        const { rowCount } = await client.query(`DELETE FROM webhook_endpoints WHERE id = $1 AND org_id = $2`, [webhookId, orgId]);
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
      const testPayload = { event: 'WebhookTest', message: 'Test event from backtesting platform', timestamp: new Date().toISOString(), nonce: crypto.randomUUID() };
      const result = await withTenant(orgId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, url, secret, secret_iv, secret_tag, secret_kid FROM webhook_endpoints WHERE id = $1 AND org_id = $2`,
          [webhookId, orgId],
        );
        if (rows.length === 0) return { notFound: true as const };
        const endpoint = rows[0];
        const ins = await client.query(
          `INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, status) VALUES ($1, 'WebhookTest', $2::jsonb, 'pending') RETURNING id`,
          [webhookId, JSON.stringify(testPayload)],
        );
        // 立即尝试投递（脱离事务，HTTP 不应占用 DB 连接）
        return { notFound: false as const, endpoint, deliveryId: ins.rows[0].id };
      });
      if (result.notFound) {
        sendProblem(res, 404, 'WEBHOOK_NOT_FOUND');
        return;
      }
      // C-024：从 DB 读出密文 secret 并 decrypt 为明文用于 HMAC 签名
      const toBuf = (v: unknown): Buffer => (Buffer.isBuffer(v) ? v : Buffer.from(v as string));
      const plaintextSecret = await decrypt({
        ciphertext: toBuf(result.endpoint.secret),
        iv: toBuf(result.endpoint.secret_iv),
        tag: toBuf(result.endpoint.secret_tag),
        kid: result.endpoint.secret_kid,
      });
      const delivery = await deliverWebhook({ url: result.endpoint.url, secret: plaintextSecret }, 'WebhookTest', testPayload);
      await withTenant(orgId, (client) =>
        client.query(
          `UPDATE webhook_deliveries SET status = $1, response_code = $2, response_body = $3, attempt_count = 1, delivered_at = NOW(), next_retry_at = NULL WHERE id = $4`,
          [delivery.success ? 'success' : 'failed', delivery.responseCode, delivery.responseBody, result.deliveryId],
        ),
      );
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
        const { rows: own } = await client.query(`SELECT 1 FROM webhook_endpoints WHERE id = $1 AND org_id = $2`, [webhookId, orgId]);
        if (own.length === 0) return null;
        const { rows } = await client.query(
          `SELECT id, event_type, status, response_code, attempt_count, next_retry_at, delivered_at, created_at FROM webhook_deliveries WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT $2`,
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