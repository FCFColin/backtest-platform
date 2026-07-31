/** Webhook 投递服务（P2-02）：投递表 + 退避重试 + 持续失败端点自动禁用。密钥加密存储（C-024）；表无 RLS，路由层显式 WHERE org_id 收敛。 */
import crypto from 'crypto';
import { getPool, withTenant } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { assertSafeUrl } from '../utils/ssrfGuard.js';
import { encrypt, decrypt } from '../utils/crypto.js';

const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_ATTEMPTS = 5;
/** 退避阶梯（毫秒）：1min, 5min, 30min, 2h, 24h。索引 = 已失败次数 - 1 */
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 86_400_000];
const MAX_DELIVERIES_PER_ENDPOINT = 100;
const AUTO_DISABLE_THRESHOLD = 5;
const RESPONSE_BODY_TRUNCATE = 1000;
const RETRY_BATCH_SIZE = 100;

export const WEBHOOK_EVENT_TYPES = {
  BACKTEST_COMPLETED: 'backtest.completed',
  BACKTEST_FAILED: 'backtest.failed',
  API_VERSION_DEPRECATED: 'api.version.deprecated',
} as const;
export const VALID_WEBHOOK_EVENTS: ReadonlySet<string> = new Set(
  Object.values(WEBHOOK_EVENT_TYPES),
);

export interface WebhookEndpoint {
  id: string;
  orgId: string;
  url: string;
  secret: string;
  isActive: boolean;
  subscribedEvents: string[];
  failedConsecutiveCount: number;
}
export interface DeliveryResult {
  success: boolean;
  responseCode: number | null;
  responseBody: string;
  permanentFailure?: boolean;
}

export function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** 创建 Webhook 端点（C-024：签名密钥加密存储，DB 仅存密文）。client 须来自 withTenant。 */
export async function createWebhook(
  client: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  },
  params: {
    orgId: string;
    url: string;
    secret: string;
    description?: string;
    subscribedEvents: string[];
  },
): Promise<{
  id: string;
  url: string;
  description: string | null;
  isActive: boolean;
  subscribedEvents: string[];
  createdAt: Date;
}> {
  const enc = await encrypt(params.secret);
  const { rows } = await client.query(
    `INSERT INTO webhook_endpoints (org_id, url, secret, secret_iv, secret_tag, secret_kid, description, subscribed_events) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, url, description, is_active, subscribed_events, created_at`,
    [
      params.orgId,
      params.url,
      enc.ciphertext,
      enc.iv,
      enc.tag,
      enc.kid,
      params.description ?? null,
      params.subscribedEvents,
    ],
  );
  const r = rows[0];
  return {
    id: r.id as string,
    url: r.url as string,
    description: (r.description as string | null) ?? null,
    isActive: r.is_active as boolean,
    subscribedEvents: r.subscribed_events as string[],
    createdAt: r.created_at as Date,
  };
}

/** 向端点投递 webhook（POST + HMAC 签名头）。SSRF 失败标记 permanentFailure 不重试；10s 超时；响应体限 1MB 防 OOM（C-003）。 */
export async function deliverWebhook(
  endpoint: Pick<WebhookEndpoint, 'url' | 'secret'>,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<DeliveryResult> {
  try {
    await assertSafeUrl(endpoint.url);
  } catch (err) {
    return {
      success: false,
      responseCode: null,
      responseBody: `SSRF blocked: ${(err as Error).message}`.slice(0, RESPONSE_BODY_TRUNCATE),
      permanentFailure: true,
    };
  }
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': eventType,
        'X-Webhook-Signature': `sha256=${signPayload(body, endpoint.secret)}`,
        'X-Webhook-Timestamp': String(Math.floor(Date.now() / 1000)),
      },
      body,
      signal: controller.signal,
    });
    const responseText = await readResponseWithLimit(res, MAX_RESPONSE_BYTES);
    return {
      success: res.ok,
      responseCode: res.status,
      responseBody: responseText.slice(0, RESPONSE_BODY_TRUNCATE),
    };
  } catch (err) {
    return {
      success: false,
      responseCode: null,
      responseBody: (err as Error).message.slice(0, RESPONSE_BODY_TRUNCATE),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseWithLimit(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        chunks.push(
          decoder.decode(value.subarray(0, value.byteLength - (received - maxBytes)), {
            stream: true,
          }),
        );
        break;
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    await reader.cancel();
  }
}

/** 触发匹配的 webhook 订阅：为订阅该事件的活跃端点创建 pending 投递记录。仅创建记录，HTTP 投递由重试作业异步执行。 */
export async function triggerWebhooks(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const pool = getPool();
  const { rows: probe } = await pool.query(
    `SELECT 1 FROM webhook_endpoints WHERE org_id = $1 AND is_active = TRUE AND $2 = ANY(subscribed_events) LIMIT 1`,
    [orgId, eventType],
  );
  if (probe.length === 0) {
    logger.debug({ orgId, eventType }, '[webhookService] 无匹配订阅，跳过投递创建');
    return;
  }
  const payloadJson = JSON.stringify(payload);
  const { rowCount } = await pool.query(
    `INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, status) SELECT id, $2, $3::jsonb, 'pending' FROM webhook_endpoints WHERE org_id = $1 AND is_active = TRUE AND $2 = ANY(subscribed_events)`,
    [orgId, eventType, payloadJson],
  );
  logger.info(
    { orgId, eventType, created: rowCount ?? 0 },
    '[webhookService] 已创建 webhook 投递记录',
  );
}

interface DeliveryRow {
  delivery_id: string;
  endpoint_id: string;
  event_type: string;
  payload: unknown;
  attempt_count: number;
  url: string;
  secret: Buffer | string;
  secret_iv: Buffer | string;
  secret_tag: Buffer | string;
  secret_kid: string;
  org_id: string;
}

/** 处理待投递记录（重试作业入口）。退避阶梯 1min/5min/30min/2h/24h；达 MAX_ATTEMPTS 标记 failed；端点连续失败 5 次自动禁用。 */
export async function processPendingDeliveries(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT d.id AS delivery_id, d.endpoint_id, d.event_type, d.payload, d.attempt_count, e.url, e.secret, e.secret_iv, e.secret_tag, e.secret_kid, e.org_id FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id WHERE d.status IN ('pending','retrying') AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW()) ORDER BY d.created_at ASC LIMIT $1`,
    [RETRY_BATCH_SIZE],
  );
  if (rows.length === 0) return;
  logger.info(
    { module: 'webhookService', pending: rows.length },
    '[webhookService] 开始处理待投递记录',
  );
  await Promise.allSettled(rows.map((row) => processSingleDelivery(row as DeliveryRow)));
}

async function processSingleDelivery(row: DeliveryRow): Promise<void> {
  const {
    delivery_id: deliveryId,
    endpoint_id: endpointId,
    event_type: eventType,
    attempt_count: attemptCount,
    url,
    org_id: orgId,
  } = row;
  const payload =
    typeof row.payload === 'string'
      ? (JSON.parse(row.payload) as Record<string, unknown>)
      : (row.payload as Record<string, unknown>);
  const toBuf = (v: Buffer | string): Buffer => (Buffer.isBuffer(v) ? v : Buffer.from(v));
  const plaintextSecret = await decrypt({
    ciphertext: toBuf(row.secret),
    iv: toBuf(row.secret_iv),
    tag: toBuf(row.secret_tag),
    kid: row.secret_kid,
  });
  const result = await deliverWebhook({ url, secret: plaintextSecret }, eventType, payload);
  const newAttemptCount = attemptCount + 1;
  const exhausted = !result.permanentFailure && newAttemptCount >= MAX_ATTEMPTS;
  await withTenant(orgId, async (client) => {
    if (result.success) {
      await client.query(
        `UPDATE webhook_deliveries SET status = 'success', response_code = $1, response_body = $2, attempt_count = $3, delivered_at = NOW(), next_retry_at = NULL WHERE id = $4`,
        [result.responseCode, result.responseBody, newAttemptCount, deliveryId],
      );
      await client.query(
        `UPDATE webhook_endpoints SET failed_consecutive_count = 0 WHERE id = $1`,
        [endpointId],
      );
      logger.info(
        { deliveryId, endpointId, eventType, responseCode: result.responseCode },
        '[webhookService] webhook 投递成功',
      );
      return;
    }
    if (result.permanentFailure || exhausted) {
      await client.query(
        `UPDATE webhook_deliveries SET status = 'failed', response_code = $1, response_body = $2, attempt_count = $3, next_retry_at = NULL WHERE id = $4`,
        [result.responseCode, result.responseBody, newAttemptCount, deliveryId],
      );
      if (exhausted) {
        await client.query(
          `UPDATE webhook_endpoints SET failed_consecutive_count = failed_consecutive_count + 1, is_active = CASE WHEN failed_consecutive_count + 1 >= $2 THEN FALSE ELSE is_active END, disabled_at = CASE WHEN failed_consecutive_count + 1 >= $2 THEN NOW() ELSE disabled_at END WHERE id = $1`,
          [endpointId, AUTO_DISABLE_THRESHOLD],
        );
        logger.warn(
          { deliveryId, endpointId, orgId, eventType, attempts: newAttemptCount },
          '[webhookService] webhook 投递达到上限，标记失败',
        );
      } else {
        logger.warn(
          { deliveryId, endpointId, orgId, eventType, reason: 'permanent_failure' },
          '[webhookService] webhook 投递永久失败（SSRF），标记 failed 不重试',
        );
      }
      return;
    }
    const nextRetryAt = new Date(Date.now() + RETRY_DELAYS_MS[newAttemptCount - 1]);
    await client.query(
      `UPDATE webhook_deliveries SET status = 'retrying', response_code = $1, response_body = $2, attempt_count = $3, next_retry_at = $4 WHERE id = $5`,
      [result.responseCode, result.responseBody, newAttemptCount, nextRetryAt, deliveryId],
    );
    logger.info(
      { deliveryId, endpointId, eventType, attempts: newAttemptCount, nextRetryAt },
      '[webhookService] webhook 投递失败，安排重试',
    );
  });
}

/** 清理每端点超出保留上限的旧投递记录。ROW_NUMBER 按 endpoint_id 分区、created_at 倒序删除编号 > 100 的最旧记录。 */
export async function cleanupOldDeliveries(): Promise<void> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM webhook_deliveries WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY endpoint_id ORDER BY created_at DESC) AS rn FROM webhook_deliveries) t WHERE rn > $1)`,
    [MAX_DELIVERIES_PER_ENDPOINT],
  );
  if (rowCount && rowCount > 0)
    logger.info(
      { module: 'webhookService', deleted: rowCount, keep: MAX_DELIVERIES_PER_ENDPOINT },
      '[webhookService] 已清理超额投递记录',
    );
}

export const WEBHOOK_CONSTANTS = {
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  MAX_DELIVERIES_PER_ENDPOINT,
  AUTO_DISABLE_THRESHOLD,
  RESPONSE_BODY_TRUNCATE,
};
