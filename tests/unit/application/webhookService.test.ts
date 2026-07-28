/**
 * Webhook 投递服务单元测试（P2-02）
 *
 * 覆盖：
 * - signPayload：HMAC-SHA256 签名生成与验证
 * - deliverWebhook：成功/失败/网络错误/头部/响应体截断
 * - triggerWebhooks：仅订阅了该事件的活跃端点才创建投递记录
 * - processPendingDeliveries：成功重置计数、失败重试阶梯、达到上限标记失败、自动禁用
 * - cleanupOldDeliveries：按端点分区保留最近 100 条
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Mock：pg pool（getPool 返回带 query 的 mock pool）
// ---------------------------------------------------------------------------
const poolMocks = vi.hoisted(() => {
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
  return { pool };
});

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks.pool),
}));

// ---------------------------------------------------------------------------
// Mock：global.fetch（deliverWebhook 使用）
// ---------------------------------------------------------------------------
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// Mock：ssrfGuard（C-003，deliverWebhook 在 fetch 前调用 assertSafeUrl）
// 默认放行所有 URL；个别用例可覆盖为 reject 以验证 SSRF 失败路径
// ---------------------------------------------------------------------------
const ssrfMock = vi.hoisted(() => ({
  assertSafeUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../packages/backend/src/utils/ssrfGuard.js', () => ({
  assertSafeUrl: ssrfMock.assertSafeUrl,
}));

// ---------------------------------------------------------------------------
// 导入被测模块（在 mock 注册之后）
// ---------------------------------------------------------------------------
import {
  signPayload,
  deliverWebhook,
  triggerWebhooks,
  processPendingDeliveries,
  cleanupOldDeliveries,
  WEBHOOK_CONSTANTS,
} from '../../../packages/backend/src/application/webhookService.js';

const { RETRY_DELAYS_MS, MAX_ATTEMPTS, AUTO_DISABLE_THRESHOLD, MAX_DELIVERIES_PER_ENDPOINT } =
  WEBHOOK_CONSTANTS;

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const ENDPOINT_ID = '00000000-0000-0000-0000-000000000002';
const DELIVERY_ID = '00000000-0000-0000-0000-000000000003';
const SECRET = 'test-secret-key-1234';
const URL = 'https://example.com/webhook';

/** 构造一条投递记录行（processPendingDeliveries 的 SELECT 返回） */
function makeDeliveryRow(
  overrides: Partial<{
    delivery_id: string;
    endpoint_id: string;
    event_type: string;
    payload: unknown;
    attempt_count: number;
    url: string;
    secret: string;
    org_id: string;
  }> = {},
) {
  return {
    delivery_id: DELIVERY_ID,
    endpoint_id: ENDPOINT_ID,
    event_type: 'BacktestCompleted',
    payload: { runId: 'run-1' },
    attempt_count: 0,
    url: URL,
    secret: SECRET,
    org_id: ORG_ID,
    ...overrides,
  };
}

/** 捕获 UPDATE webhook_deliveries 的参数（成功/重试/失败分支） */
function findDeliveryUpdateCall() {
  return poolMocks.pool.query.mock.calls.find(
    (c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('UPDATE webhook_deliveries'),
  );
}

/** 捕获 UPDATE webhook_endpoints 的参数（重置/递增/禁用分支） */
function findEndpointUpdateCall() {
  return poolMocks.pool.query.mock.calls.find(
    (c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('UPDATE webhook_endpoints'),
  );
}

describe('webhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolMocks.pool.query.mockResolvedValue({ rows: [] });
    fetchMock.mockReset();
    // ssrfGuard 默认放行（C-003），个别用例覆盖为 reject 验证失败路径
    ssrfMock.assertSafeUrl.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // signPayload
  // =========================================================================
  describe('signPayload', () => {
    it('应生成与独立 HMAC-SHA256 计算一致的十六进制签名', () => {
      const payload = JSON.stringify({ event: 'BacktestCompleted' });
      const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
      expect(signPayload(payload, SECRET)).toBe(expected);
    });

    it('不同 secret 应产生不同签名', () => {
      const payload = '{"a":1}';
      expect(signPayload(payload, 'secret-a')).not.toBe(signPayload(payload, 'secret-b'));
    });

    it('接收方可使用相同算法验证签名（HMAC 验证）', () => {
      const payload = '{"event":"Test"}';
      const signature = signPayload(payload, SECRET);
      // 接收方重算并比对（模拟 webhook 接收方验证逻辑）
      const recomputed = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
      expect(crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(recomputed))).toBe(true);
    });
  });

  // =========================================================================
  // deliverWebhook
  // =========================================================================
  describe('deliverWebhook', () => {
    it('2xx 响应应返回 success=true 与状态码', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const result = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', { a: 1 });
      expect(result.success).toBe(true);
      expect(result.responseCode).toBe(200);
      expect(result.responseBody).toBe('ok');
    });

    it('5xx 响应应返回 success=false', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' });
      const result = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', { a: 1 });
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe(503);
    });

    it('网络错误/超时应返回 success=false 且 responseCode=null', async () => {
      fetchMock.mockRejectedValue(new Error('fetch failed'));
      const result = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', { a: 1 });
      expect(result.success).toBe(false);
      expect(result.responseCode).toBeNull();
      expect(result.responseBody).toContain('fetch failed');
    });

    it('应设置 X-Webhook-Event/X-Webhook-Signature/X-Webhook-Timestamp 头', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
      await deliverWebhook({ url: URL, secret: SECRET }, 'BacktestCompleted', { runId: 'r1' });
      const call = fetchMock.mock.calls[0];
      const headers = (call[1] as { headers: Record<string, string> }).headers;
      expect(headers['X-Webhook-Event']).toBe('BacktestCompleted');
      expect(headers['X-Webhook-Signature']).toMatch(/^sha256=[0-9a-f]+$/);
      expect(headers['X-Webhook-Timestamp']).toMatch(/^\d+$/);
    });

    it('X-Webhook-Signature 应为 body 的正确 HMAC', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
      const payload = { runId: 'r1' };
      await deliverWebhook({ url: URL, secret: SECRET }, 'Evt', payload);
      const call = fetchMock.mock.calls[0];
      const body = (call[1] as { body: string }).body;
      const sigHeader = (call[1] as { headers: Record<string, string> }).headers[
        'X-Webhook-Signature'
      ];
      const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      expect(sigHeader).toBe(expected);
    });

    it('响应体应截断至 1000 字符', async () => {
      const longBody = 'x'.repeat(2500);
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => longBody });
      const result = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', {});
      expect(result.responseBody.length).toBe(1000);
    });

    it('SSRF 校验失败应返回 permanentFailure 且不调用 fetch（C-003）', async () => {
      ssrfMock.assertSafeUrl.mockRejectedValueOnce(new Error('SSRF blocked: private IP'));
      const result = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', { a: 1 });
      expect(result.success).toBe(false);
      expect(result.responseCode).toBeNull();
      expect(result.permanentFailure).toBe(true);
      expect(result.responseBody).toContain('SSRF blocked');
      // fetch 不应被调用（校验失败即中止，不发起请求）
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('SSRF 校验通过后应正常调用 fetch', async () => {
      ssrfMock.assertSafeUrl.mockResolvedValueOnce(undefined);
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const result = await deliverWebhook({ url: URL, secret: SECRET }, 'Test', { a: 1 });
      expect(result.success).toBe(true);
      expect(ssrfMock.assertSafeUrl).toHaveBeenCalledWith(URL);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // triggerWebhooks
  // =========================================================================
  describe('triggerWebhooks', () => {
    it('无匹配订阅时应跳过 INSERT（仅探测查询）', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] }); // probe 返回空
      await triggerWebhooks(ORG_ID, 'BacktestCompleted', { runId: 'r1' });
      expect(poolMocks.pool.query).toHaveBeenCalledTimes(1);
      // 仅一次探测查询，无 INSERT
      const sql = poolMocks.pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('SELECT 1 FROM webhook_endpoints');
    });

    it('有匹配订阅时应执行 INSERT...SELECT 创建 pending 投递', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] }) // probe 命中
        .mockResolvedValueOnce({ rowCount: 2 }); // INSERT 2 条
      await triggerWebhooks(ORG_ID, 'BacktestCompleted', { runId: 'r1' });
      expect(poolMocks.pool.query).toHaveBeenCalledTimes(2);
      const insertCall = poolMocks.pool.query.mock.calls[1];
      const sql = insertCall[0] as string;
      expect(sql).toContain('INSERT INTO webhook_deliveries');
      expect(sql).toContain('status');
      expect(sql).toContain("'pending'");
      // 参数：orgId, eventType, payloadJson
      expect(insertCall[1]).toEqual([ORG_ID, 'BacktestCompleted', JSON.stringify({ runId: 'r1' })]);
    });

    it('仅活跃端点订阅该事件才被纳入（INSERT...SELECT 的 WHERE 子句）', async () => {
      poolMocks.pool.query
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 });
      await triggerWebhooks(ORG_ID, 'RunCompleted', { id: 'r2' });
      const insertSql = poolMocks.pool.query.mock.calls[1][0] as string;
      // WHERE 必须同时约束 org_id / is_active / subscribed_events
      expect(insertSql).toContain('org_id = $1');
      expect(insertSql).toContain('is_active = TRUE');
      expect(insertSql).toContain('= ANY(subscribed_events)');
    });
  });

  // =========================================================================
  // processPendingDeliveries
  // =========================================================================
  describe('processPendingDeliveries', () => {
    it('无待投递记录时应直接返回（不调用 fetch）', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [] });
      await processPendingDeliveries();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('投递成功应标记 success 并重置端点 failed_consecutive_count=0', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [makeDeliveryRow()] });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      // 后续 UPDATE 调用
      poolMocks.pool.query.mockResolvedValue({ rows: [] });

      await processPendingDeliveries();

      const deliveryUpdate = findDeliveryUpdateCall();
      expect(deliveryUpdate).toBeDefined();
      const dSql = deliveryUpdate![0] as string;
      expect(dSql).toContain("status = 'success'");
      expect(dSql).toContain('delivered_at = NOW()');

      const endpointUpdate = findEndpointUpdateCall();
      expect(endpointUpdate).toBeDefined();
      const eSql = endpointUpdate![0] as string;
      expect(eSql).toContain('failed_consecutive_count = 0');
    });

    it('投递失败且未达上限应标记 retrying 并安排 next_retry_at', async () => {
      // attempt_count=0 → 失败后 newAttemptCount=1，取 RETRY_DELAYS_MS[0]
      poolMocks.pool.query.mockResolvedValueOnce({ rows: [makeDeliveryRow({ attempt_count: 0 })] });
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' });
      poolMocks.pool.query.mockResolvedValue({ rows: [] });
      const before = Date.now();

      await processPendingDeliveries();

      const deliveryUpdate = findDeliveryUpdateCall();
      const dSql = deliveryUpdate![0] as string;
      expect(dSql).toContain("status = 'retrying'");
      expect(dSql).toContain('next_retry_at = $4');
      const args = deliveryUpdate![1] as unknown[];
      const nextRetryAt = args[3] as Date;
      // 应约为 now + RETRY_DELAYS_MS[0]（1min）
      const expectedMs = before + RETRY_DELAYS_MS[0];
      expect(nextRetryAt.getTime()).toBeGreaterThanOrEqual(expectedMs - 1000);
      expect(nextRetryAt.getTime()).toBeLessThanOrEqual(expectedMs + 5000);
      // 不应更新端点计数（仅达到上限才递增）
      expect(findEndpointUpdateCall()).toBeUndefined();
    });

    it('重试阶梯应按 1min/5min/30min/2h/24h 递增', () => {
      expect(RETRY_DELAYS_MS).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 86_400_000]);
      expect(MAX_ATTEMPTS).toBe(5);
    });

    it('达到 MAX_ATTEMPTS 应标记 failed 并递增端点失败计数', async () => {
      // attempt_count=4 → newAttemptCount=5 = MAX_ATTEMPTS
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [makeDeliveryRow({ attempt_count: MAX_ATTEMPTS - 1 })],
      });
      fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => 'bad' });
      poolMocks.pool.query.mockResolvedValue({ rows: [] });

      await processPendingDeliveries();

      const deliveryUpdate = findDeliveryUpdateCall();
      expect(deliveryUpdate![0] as string).toContain("status = 'failed'");

      const endpointUpdate = findEndpointUpdateCall();
      expect(endpointUpdate).toBeDefined();
      const eSql = endpointUpdate![0] as string;
      expect(eSql).toContain('failed_consecutive_count = failed_consecutive_count + 1');
    });

    it('连续失败达到 AUTO_DISABLE_THRESHOLD(5) 应自动禁用端点', async () => {
      // 第 5 次失败：failed_consecutive_count 当前 4 → +1 = 5 ≥ 阈值 → 禁用
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [makeDeliveryRow({ attempt_count: MAX_ATTEMPTS - 1 })],
      });
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => '' });
      poolMocks.pool.query.mockResolvedValue({ rows: [] });

      await processPendingDeliveries();

      const endpointUpdate = findEndpointUpdateCall();
      const eSql = endpointUpdate![0] as string;
      // CASE WHEN failed_consecutive_count + 1 >= 阈值 THEN FALSE
      expect(eSql).toContain('is_active = CASE');
      expect(eSql).toContain('THEN FALSE');
      expect(eSql).toContain('disabled_at = CASE');
      expect(eSql).toContain('THEN NOW()');
      // 阈值参数应为 AUTO_DISABLE_THRESHOLD
      const args = endpointUpdate![1] as unknown[];
      expect(args[1]).toBe(AUTO_DISABLE_THRESHOLD);
    });

    it('未达阈值的失败不应禁用端点（is_active 保持原值）', async () => {
      // 假设当前 failed_consecutive_count 较低，第 5 次失败但端点失败计数仅 0 → +1 = 1 < 5
      // 这里通过 SQL CASE ELSE is_active 验证未禁用逻辑存在
      poolMocks.pool.query.mockResolvedValueOnce({
        rows: [makeDeliveryRow({ attempt_count: MAX_ATTEMPTS - 1 })],
      });
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => '' });
      poolMocks.pool.query.mockResolvedValue({ rows: [] });

      await processPendingDeliveries();

      const endpointUpdate = findEndpointUpdateCall();
      const eSql = endpointUpdate![0] as string;
      // CASE 包含 ELSE is_active（未达阈值时保持原值）
      expect(eSql).toContain('ELSE is_active');
    });
  });

  // =========================================================================
  // cleanupOldDeliveries
  // =========================================================================
  describe('cleanupOldDeliveries', () => {
    it('应使用 ROW_NUMBER 窗口函数删除每端点超出上限的旧记录', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rowCount: 7 });

      await cleanupOldDeliveries();

      const call = poolMocks.pool.query.mock.calls[0];
      const sql = call[0] as string;
      expect(sql).toContain('DELETE FROM webhook_deliveries');
      expect(sql).toContain('ROW_NUMBER()');
      expect(sql).toContain('PARTITION BY endpoint_id');
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).toContain('rn > $1');
      expect(call[1]).toEqual([MAX_DELIVERIES_PER_ENDPOINT]);
    });

    it('无可清理记录时不应记录清理日志', async () => {
      poolMocks.pool.query.mockResolvedValueOnce({ rowCount: 0 });
      await cleanupOldDeliveries();
      // 仅一次 DELETE 调用，无额外日志副作用（函数正常返回）
      expect(poolMocks.pool.query).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 常量约束
  // =========================================================================
  describe('WEBHOOK_CONSTANTS', () => {
    it('AUTO_DISABLE_THRESHOLD 应为 5', () => {
      expect(AUTO_DISABLE_THRESHOLD).toBe(5);
    });

    it('MAX_DELIVERIES_PER_ENDPOINT 应为 100', () => {
      expect(MAX_DELIVERIES_PER_ENDPOINT).toBe(100);
    });
  });
});
