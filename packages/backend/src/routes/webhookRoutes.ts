/**
 * Webhook 端点管理路由（P2-02）。
 * 鉴权链：jwtAuth → resolveTenant → requireTenant → requirePermission(ADMIN_ACCESS)（ADR-033，与 API Key 同级）。
 * 所有查询经 withTenant 开启租户事务；secret 永不返回响应体。
 */
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { validate } from '../middleware/miscMiddleware.js';
import { emptyBodySchema } from '../schemas/analysisSchemas.js';
import { sendProblem } from '../utils/errors.js';
import { tenantHandler, requireUuidParam } from './routeUtils.js';
import { withTenant } from '../db/pool.js';
import { deliverWebhook, createWebhook } from '../application/webhookService.js';
import { decrypt } from '../utils/crypto.js';
import { rowMapper, iso, toIso } from '../repositories/rowMapper.js';

const router = Router();
const DELIVERIES_PAGE_SIZE = 100;

const httpsUrl = z
  .string()
  .trim()
  .url('URL 格式非法')
  .refine((v) => v.startsWith('https://'), 'URL 必须为 HTTPS');
const createWebhookSchema = z.object({
  url: httpsUrl,
  secret: z
    .string()
    .min(32, 'secret 至少 32 字符以保证 HMAC-SHA256 安全强度')
    .max(256, 'secret 过长'),
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

const mapDeliveryRow = rowMapper<DeliveryRow>({
  id: 'id',
  eventType: 'event_type',
  status: 'status',
  responseCode: 'response_code',
  attemptCount: 'attempt_count',
  nextRetryAt: (r) => toIso(r.next_retry_at),
  deliveredAt: (r) => toIso(r.delivered_at),
  createdAt: (r) => iso(r.created_at),
});
interface WebhookView {
  id: string;
  url: string;
  description: string | null;
  isActive: boolean;
  subscribedEvents: string[];
  failedConsecutiveCount: number;
  disabledAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
const toWebhookView = rowMapper<WebhookView>({
  id: 'id',
  url: 'url',
  description: 'description',
  isActive: 'is_active',
  subscribedEvents: 'subscribed_events',
  failedConsecutiveCount: 'failed_consecutive_count',
  disabledAt: (r) => toIso(r.disabled_at),
  createdAt: (r) => toIso(r.created_at),
  updatedAt: (r) => toIso(r.updated_at),
});

router.get(
  '/',
  tenantHandler(
    '[webhookRoutes] 列出 webhook 失败',
    'WEBHOOK_LIST_FAILED',
    async (_req, res, orgId) => {
      const endpoints = await withTenant(orgId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, url, description, is_active, subscribed_events, failed_consecutive_count, disabled_at, created_at, updated_at FROM webhook_endpoints WHERE org_id = $1 ORDER BY created_at DESC`,
          [orgId],
        );
        return rows.map(toWebhookView);
      });
      res.json({ success: true, data: endpoints });
    },
  ),
);

router.post(
  '/',
  validate(createWebhookSchema),
  tenantHandler(
    '[webhookRoutes] 创建 webhook 失败',
    'WEBHOOK_CREATE_FAILED',
    async (req, res, orgId) => {
      const body = req.body as {
        url: string;
        secret: string;
        description?: string;
        subscribedEvents: string[];
      };
      const created = await withTenant(orgId, (client) =>
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
  ),
);

router.put(
  '/:id',
  validate(updateWebhookSchema),
  tenantHandler(
    '[webhookRoutes] 更新 webhook 失败',
    'WEBHOOK_UPDATE_FAILED',
    async (req, res, orgId) => {
      if (!requireUuidParam(res, req.params.id)) return;
      const webhookId = req.params.id;
      const body = req.body as {
        url?: string;
        description?: string;
        subscribedEvents?: string[];
        isActive?: boolean;
      };
      const updated = await withTenant(orgId, async (client) =>
        client.query(
          `UPDATE webhook_endpoints SET url = COALESCE($3, url), description = COALESCE($4, description), subscribed_events = COALESCE($5, subscribed_events), is_active = COALESCE($6, is_active) WHERE id = $1 AND org_id = $2 RETURNING id, url, description, is_active, subscribed_events, updated_at`,
          [
            webhookId,
            orgId,
            body.url ?? null,
            body.description ?? null,
            body.subscribedEvents ?? null,
            body.isActive ?? null,
          ],
        ),
      );
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
  ),
);

router.delete(
  '/:id',
  tenantHandler(
    '[webhookRoutes] 删除 webhook 失败',
    'WEBHOOK_DELETE_FAILED',
    async (req, res, orgId) => {
      if (!requireUuidParam(res, req.params.id)) return;
      const webhookId = req.params.id;
      const deleted = await withTenant(
        orgId,
        async (client) =>
          (
            await client.query(`DELETE FROM webhook_endpoints WHERE id = $1 AND org_id = $2`, [
              webhookId,
              orgId,
            ])
          ).rowCount ?? 0,
      );
      if (deleted === 0) {
        sendProblem(res, 404, 'WEBHOOK_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: { id: webhookId, deleted: true } });
    },
  ),
);

router.post(
  '/:id/test',
  validate(emptyBodySchema),
  tenantHandler(
    '[webhookRoutes] 测试 webhook 失败',
    'WEBHOOK_TEST_FAILED',
    async (req, res, orgId) => {
      if (!requireUuidParam(res, req.params.id)) return;
      const webhookId = req.params.id;
      const testPayload = {
        event: 'WebhookTest',
        message: 'Test event from backtesting platform',
        timestamp: new Date().toISOString(),
        nonce: crypto.randomUUID(),
      };
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
        return { notFound: false as const, endpoint, deliveryId: ins.rows[0].id }; // 投递在事务外执行，HTTP 不应占用 DB 连接
      });
      if (result.notFound) {
        sendProblem(res, 404, 'WEBHOOK_NOT_FOUND');
        return;
      }
      const toBuf = (v: unknown): Buffer => (Buffer.isBuffer(v) ? v : Buffer.from(v as string));
      const plaintextSecret = await decrypt({
        ciphertext: toBuf(result.endpoint.secret),
        iv: toBuf(result.endpoint.secret_iv),
        tag: toBuf(result.endpoint.secret_tag),
        kid: result.endpoint.secret_kid,
      });
      const delivery = await deliverWebhook(
        { url: result.endpoint.url, secret: plaintextSecret },
        'WebhookTest',
        testPayload,
      );
      await withTenant(orgId, (client) =>
        client.query(
          `UPDATE webhook_deliveries SET status = $1, response_code = $2, response_body = $3, attempt_count = 1, delivered_at = NOW(), next_retry_at = NULL WHERE id = $4`,
          [
            delivery.success ? 'success' : 'failed',
            delivery.responseCode,
            delivery.responseBody,
            result.deliveryId,
          ],
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
  ),
);

router.get(
  '/:id/deliveries',
  tenantHandler(
    '[webhookRoutes] 查询投递历史失败',
    'WEBHOOK_DELIVERIES_FAILED',
    async (req, res, orgId) => {
      if (!requireUuidParam(res, req.params.id)) return;
      const webhookId = req.params.id;
      const deliveries = await withTenant(orgId, async (client) => {
        const { rows: own } = await client.query(
          `SELECT 1 FROM webhook_endpoints WHERE id = $1 AND org_id = $2`,
          [webhookId, orgId],
        );
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
  ),
);

export default router;
