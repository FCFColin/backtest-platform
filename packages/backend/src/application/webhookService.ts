/**
 * Webhook 投递服务（P2-02）
 *
 * Architecture: Webhook 系统的应用层 — 负责签名、投递、重试调度与端点生命周期治理。
 * 企业为何需要：Outbox 模式保证事件不丢，但 Outbox 只解决"事件到服务"的可靠性；
 * "服务到外部 HTTPS 端点"的可靠性由本模块的投递表 + 重试作业保证。
 * 外部端点可能临时不可用（5xx/超时），需要指数退避重试；持续打死的端点需自动禁用，
 * 避免重试作业被拖垮。
 *
 * 权衡：
 * - 投递记录每端点保留最近 100 条（cleanupOldDeliveries），避免无界增长；
 *   超出按 created_at DESC 删除最旧，足够排障又不过度占用存储。
 * - 重试退避固定为 1min/5min/30min/2h/24h（5 次封顶），非纯指数退避——
 *   固定阶梯便于运维预测与人工介入，且 24h 兜底覆盖对端夜间维护窗口。
 * - 签名格式 `sha256=<hex>`（GitHub/Stripe 惯例），接收方可前缀识别算法。
 * - webhook_endpoints/webhook_deliveries 不启用 RLS（见迁移头注），
 *   路由层显式 WHERE org_id=$1 收敛；重试作业跨租户扫描使用主连接池。
 */
import crypto from 'crypto';
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { assertSafeUrl } from '../utils/ssrfGuard.js';

/** 单次 HTTP 投递超时（10s），超时即视为失败以释放连接 */
const WEBHOOK_TIMEOUT_MS = 10_000;

/** 响应体最大读取字节数（1MB，C-003），超过即截断以防止恶意大响应导致 OOM */
const MAX_RESPONSE_BYTES = 1_048_576;

/** 最大尝试次数（首次 + 4 次重试 = 5 次） */
const MAX_ATTEMPTS = 5;

/**
 * 重试退避阶梯（毫秒）：1min, 5min, 30min, 2h, 24h。
 * 索引 = 已失败次数 - 1（第 1 次失败取 [0]=1min，第 5 次失败直接标记 failed 不再重试）。
 */
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 86_400_000];

/** 每端点保留的投递历史上限 */
const MAX_DELIVERIES_PER_ENDPOINT = 100;

/** 连续失败达到此阈值自动禁用端点 */
const AUTO_DISABLE_THRESHOLD = 5;

/** 投递响应体截断长度（避免长 HTML 错误页占满存储） */
const RESPONSE_BODY_TRUNCATE = 1000;

/** 单批重试作业处理的投递上限（避免长事务阻塞） */
const RETRY_BATCH_SIZE = 100;

/**
 * 平台支持的 Webhook 事件类型（ADR-046）。
 *
 * 订阅端在 `subscribed_events` 中声明关注的事件类型，
 * 投递时仅匹配已订阅的事件。新增事件类型时在此注册并更新文档。
 */
export const WEBHOOK_EVENT_TYPES = {
  /** 回测任务完成 */
  BACKTEST_COMPLETED: 'backtest.completed',
  /** 回测任务失败 */
  BACKTEST_FAILED: 'backtest.failed',
  /** API 版本废弃通知（ADR-046，提前 90 天推送） */
  API_VERSION_DEPRECATED: 'api.version.deprecated',
} as const;

/** 所有合法的 Webhook 事件类型集合 */
export const VALID_WEBHOOK_EVENTS: ReadonlySet<string> = new Set(
  Object.values(WEBHOOK_EVENT_TYPES),
);

/** Webhook 端点元数据（投递所需字段） */
export interface WebhookEndpoint {
  id: string;
  orgId: string;
  url: string;
  secret: string;
  isActive: boolean;
  subscribedEvents: string[];
  failedConsecutiveCount: number;
}

/** 投递结果 */
export interface DeliveryResult {
  success: boolean;
  responseCode: number | null;
  responseBody: string;
  /**
   * 是否为永久失败（不应重试）。
   *
   * 企业理由（C-003）：SSRF 校验失败等配置错误不会因重试而成功，
   * 走重试阶梯会浪费 24h 并占用 worker；标记为永久失败让
   * processSingleDelivery 直接置 failed，便于运维尽早发现配置问题。
   */
  permanentFailure?: boolean;
}

/**
 * 计算 HMAC-SHA256 签名（十六进制）。
 *
 * 企业理由：HMAC 签名让接收方验证请求确实来自平台且未被篡改，防止伪造 webhook。
 * 接收方用相同 secret 对请求体重算并比对（常量时间比较）。
 *
 * @param payload - 已序列化的请求体字符串
 * @param secret - 端点专属签名密钥
 * @returns 十六进制 HMAC-SHA256 摘要
 */
export function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * 向端点投递一次 webhook（HTTP POST + HMAC 签名头）。
 *
 * 头部约定：
 * - X-Webhook-Event：事件类型（如 BacktestCompleted）
 * - X-Webhook-Signature：`sha256=<hex>` HMAC-SHA256 签名（对原始 JSON body 计算）
 * - X-Webhook-Timestamp：发送时刻的 Unix 秒（接收方可校验时间窗防重放）
 *
 * 企业理由：
 * - SSRF 校验（C-003）：fetch 前校验 URL，拒绝指向私网/回环/链路本地的请求，
 *   防止攻击者通过 webhook 探测内网或窃取云元数据凭证；校验失败标记为
 *   permanentFailure，不重试（配置错误不会因重试而修复）。
 * - 10s 超时（AbortController）避免对端长时间挂起拖垮重试作业。
 * - 响应体大小限制（1MB）避免恶意大响应导致 OOM。
 * - 任意网络错误/超时统一返回 success=false，由调用方按重试策略处理。
 *
 * @param endpoint - 目标端点（url + secret）
 * @param eventType - 事件类型
 * @param payload - 事件负载（对象，会被 JSON.stringify）
 * @returns 投递结果（含状态码与截断后的响应体）
 */
export async function deliverWebhook(
  endpoint: Pick<WebhookEndpoint, 'url' | 'secret'>,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<DeliveryResult> {
  // SSRF 校验（C-003）：fetch 前校验 URL，拒绝私网/回环/链路本地目标
  try {
    await assertSafeUrl(endpoint.url);
  } catch (err) {
    const msg = `SSRF blocked: ${(err as Error).message}`;
    return {
      success: false,
      responseCode: null,
      responseBody: msg.slice(0, RESPONSE_BODY_TRUNCATE),
      permanentFailure: true,
    };
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(body, endpoint.secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': eventType,
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Timestamp': String(timestamp),
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
    // 超时/网络错误/DNS 失败统一视为投递失败
    return {
      success: false,
      responseCode: null,
      responseBody: (err as Error).message.slice(0, RESPONSE_BODY_TRUNCATE),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 读取响应体并限制最大字节数，超过则截断。
 *
 * 企业理由（C-003）：对端可能返回超大 HTML 错误页或恶意响应，直接
 * `await res.text()` 会一次性缓冲全部内容，可能 OOM 拖垮 worker。
 * 流式读取并限制大小可保护重试作业稳定性。
 *
 * @param res - fetch 返回的 Response
 * @param maxBytes - 最大读取字节数
 * @returns 截断后的响应体字符串
 */
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
        const keep = value.byteLength - (received - maxBytes);
        chunks.push(decoder.decode(value.subarray(0, keep), { stream: true }));
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

/**
 * 触发匹配的 webhook 订阅：为组织内订阅了该事件类型的活跃端点创建 pending 投递记录。
 *
 * 由 OutboxPublisher 在处理完 outbox 事件后调用（通过 setWebhookHandler 解耦）。
 * 仅创建投递记录，实际 HTTP 投递由 processPendingDeliveries 重试作业异步执行——
 * 避免 outbox 处理被慢 HTTP 阻塞，且失败可在投递表内独立重试。
 *
 * 企业理由：INSERT...SELECT 一次性为所有匹配端点建投递记录，避免 N 次往返；
 * 即便端点随后被禁用，已建投递仍会被重试作业处理（按创建时刻的端点状态）。
 *
 * @param orgId - 组织（租户）UUID，来自 outbox.tenant_id
 * @param eventType - 事件类型（如 BacktestCompleted）
 * @param payload - 事件负载
 */
export async function triggerWebhooks(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const pool = getPool();
  // 仅当存在订阅该事件的活跃端点时才序列化 payload，避免无谓 JSON 开销
  const { rows: probe } = await pool.query(
    `SELECT 1 FROM webhook_endpoints
      WHERE org_id = $1 AND is_active = TRUE AND $2 = ANY(subscribed_events)
      LIMIT 1`,
    [orgId, eventType],
  );
  if (probe.length === 0) {
    logger.debug({ orgId, eventType }, '[webhookService] 无匹配订阅，跳过投递创建');
    return;
  }

  const payloadJson = JSON.stringify(payload);
  const { rowCount } = await pool.query(
    `INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, status)
     SELECT id, $2, $3::jsonb, 'pending'
       FROM webhook_endpoints
      WHERE org_id = $1 AND is_active = TRUE AND $2 = ANY(subscribed_events)`,
    [orgId, eventType, payloadJson],
  );
  logger.info(
    { orgId, eventType, created: rowCount ?? 0 },
    '[webhookService] 已创建 webhook 投递记录',
  );
}

/**
 * 处理待投递记录（重试作业入口）：扫描 pending/retrying 且到点的投递并尝试投递。
 *
 * 重试策略：
 * - 首次投递失败 → status=retrying, next_retry_at = NOW() + 1min
 * - 后续失败按阶梯 5min/30min/2h/24h 退避
 * - 达到 MAX_ATTEMPTS（5 次）仍失败 → status=failed，递增端点 failed_consecutive_count；
 *   端点连续失败达到 AUTO_DISABLE_THRESHOLD（5）→ 自动禁用（is_active=FALSE, disabled_at=NOW()）
 * - 投递成功 → status=success, delivered_at=NOW()，端点 failed_consecutive_count 重置为 0
 *
 * 企业理由：自动禁用防止持续打死的端点拖垮重试作业（一个慢端点会占用 worker 并发）；
 * 成功即重置计数器，避免偶发失败累积导致误禁用。
 */
export async function processPendingDeliveries(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT d.id AS delivery_id, d.endpoint_id, d.event_type, d.payload, d.attempt_count,
            e.url, e.secret, e.org_id
       FROM webhook_deliveries d
       JOIN webhook_endpoints e ON e.id = d.endpoint_id
      WHERE d.status IN ('pending','retrying')
        AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())
      ORDER BY d.created_at ASC
      LIMIT $1`,
    [RETRY_BATCH_SIZE],
  );

  if (rows.length === 0) return;
  logger.info(
    { module: 'webhookService', pending: rows.length },
    '[webhookService] 开始处理待投递记录',
  );

  for (const row of rows) {
    await processSingleDelivery(row);
  }
}

/** 处理单条投递记录：尝试投递并按结果更新状态与端点计数器 */
async function processSingleDelivery(row: {
  delivery_id: string;
  endpoint_id: string;
  event_type: string;
  payload: unknown;
  attempt_count: number;
  url: string;
  secret: string;
  org_id: string;
}): Promise<void> {
  const pool = getPool();
  const {
    delivery_id: deliveryId,
    endpoint_id: endpointId,
    event_type: eventType,
    attempt_count: attemptCount,
    url,
    secret,
    org_id: orgId,
  } = row;
  const payload =
    typeof row.payload === 'string'
      ? (JSON.parse(row.payload) as Record<string, unknown>)
      : (row.payload as Record<string, unknown>);

  const result = await deliverWebhook({ url, secret }, eventType, payload);
  const newAttemptCount = attemptCount + 1;

  if (result.success) {
    await pool.query(
      `UPDATE webhook_deliveries
          SET status = 'success', response_code = $1, response_body = $2,
              attempt_count = $3, delivered_at = NOW(), next_retry_at = NULL
        WHERE id = $4`,
      [result.responseCode, result.responseBody, newAttemptCount, deliveryId],
    );
    // 成功即重置端点连续失败计数（偶发失败不应累积致误禁用）
    await pool.query(`UPDATE webhook_endpoints SET failed_consecutive_count = 0 WHERE id = $1`, [
      endpointId,
    ]);
    logger.info(
      { deliveryId, endpointId, eventType, responseCode: result.responseCode },
      '[webhookService] webhook 投递成功',
    );
    return;
  }

  // 投递失败：永久失败（SSRF 校验失败等）或达到重试上限 → 标记 failed 不重试
  if (result.permanentFailure || newAttemptCount >= MAX_ATTEMPTS) {
    await pool.query(
      `UPDATE webhook_deliveries
          SET status = 'failed', response_code = $1, response_body = $2,
              attempt_count = $3, next_retry_at = NULL
        WHERE id = $4`,
      [result.responseCode, result.responseBody, newAttemptCount, deliveryId],
    );
    // 仅重试耗尽才递增端点失败计数；SSRF 等配置错误不递增（非端点持续性故障，避免误禁用）
    if (!result.permanentFailure) {
      await pool.query(
        `UPDATE webhook_endpoints
            SET failed_consecutive_count = failed_consecutive_count + 1,
                is_active = CASE
                  WHEN failed_consecutive_count + 1 >= $2 THEN FALSE
                  ELSE is_active
                END,
                disabled_at = CASE
                  WHEN failed_consecutive_count + 1 >= $2 THEN NOW()
                  ELSE disabled_at
                END
          WHERE id = $1`,
        [endpointId, AUTO_DISABLE_THRESHOLD],
      );
      logger.warn(
        { deliveryId, endpointId, orgId, eventType, attempts: newAttemptCount },
        '[webhookService] webhook 投递达到上限，标记失败',
      );
    } else {
      logger.warn(
        { deliveryId, endpointId, orgId, eventType, reason: 'permanent_failure' },
        '[webhookService] webhook 投递永久失败（SSRF 校验失败），标记 failed 不重试',
      );
    }
    return;
  }

  // 安排下一次重试（按失败次数取退避阶梯）
  const delayMs = RETRY_DELAYS_MS[newAttemptCount - 1];
  const nextRetryAt = new Date(Date.now() + delayMs);
  await pool.query(
    `UPDATE webhook_deliveries
        SET status = 'retrying', response_code = $1, response_body = $2,
            attempt_count = $3, next_retry_at = $4
      WHERE id = $5`,
    [result.responseCode, result.responseBody, newAttemptCount, nextRetryAt, deliveryId],
  );
  logger.info(
    { deliveryId, endpointId, eventType, attempts: newAttemptCount, nextRetryAt },
    '[webhookService] webhook 投递失败，安排重试',
  );
}

/**
 * 清理每端点超出保留上限的旧投递记录。
 *
 * 企业理由：投递历史用于排障与可观测，但无界增长会拖慢历史查询并占用存储。
 * 每端点保留最近 100 条足够排障；ROW_NUMBER 窗口函数按端点分区、created_at 倒序编号，
 * 删除编号 > 100 的最旧记录。由定时任务周期调用。
 */
export async function cleanupOldDeliveries(): Promise<void> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM webhook_deliveries
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY endpoint_id ORDER BY created_at DESC) AS rn
            FROM webhook_deliveries
        ) t
        WHERE rn > $1
      )`,
    [MAX_DELIVERIES_PER_ENDPOINT],
  );
  if (rowCount && rowCount > 0) {
    logger.info(
      { module: 'webhookService', deleted: rowCount, keep: MAX_DELIVERIES_PER_ENDPOINT },
      '[webhookService] 已清理超额投递记录',
    );
  }
}

/** 导出常量供单元测试与外部引用 */
export const WEBHOOK_CONSTANTS = {
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  MAX_DELIVERIES_PER_ENDPOINT,
  AUTO_DISABLE_THRESHOLD,
  RESPONSE_BODY_TRUNCATE,
};
