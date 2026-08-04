/**
 * 计费 / 配额服务单元测试（ADR-036 / ADR-037）
 *
 * 企业理由：计费同步逻辑直接决定租户的计划/状态，错误会造成误收费或越权使用；用量是配额判定与
 * 计费对账的数据源。验证：
 * 1. 计划<->Price 双向映射正确；计划配额表（PLAN_LIMITS）与 currentPeriod 周期正确
 * 2. getSubscriptionSummary 映射数据库行
 * 3. webhook 同步把订阅状态写回 subscriptions + organizations（取消时回落 free）
 * 4. recordUsage 双写明细 + 月度聚合（withTenant），并递增 Redis 快路径
 * 5. getMonthlyUsage 优先 Redis，缺失时回退 DB 并回填
 *
 * Mock 策略：mock config（注入 price/secret）、db.getPool/withTenant（注入 fake client）、
 * stripe SDK、appRedis、planLimits.currentPeriod。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConfigMocks, createLoggerMocks } from '../../helpers/mockFactories.js';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTenant: vi.fn(),
  client: { query: vi.fn() },
}));
const redisMocks = vi.hoisted(() => ({
  incrby: vi.fn(),
  expire: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
const stripeMocks = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn() },
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_123',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
    STRIPE_PRICE_PRO: 'price_pro',
    STRIPE_PRICE_ENTERPRISE: 'price_ent',
    APP_BASE_URL: 'http://localhost:15173',
  }),
  PLAN_LIMITS: {
    free: {
      backtestsPerMonth: 100,
      maxTickers: 10,
      asyncConcurrency: 1,
      rateLimitPerMin: 10,
      maxTacticalConfigs: 10,
    },
    pro: {
      backtestsPerMonth: 5000,
      maxTickers: 50,
      asyncConcurrency: 5,
      rateLimitPerMin: 60,
      maxTacticalConfigs: 100,
    },
    enterprise: {
      backtestsPerMonth: Number.POSITIVE_INFINITY,
      maxTickers: 200,
      asyncConcurrency: 20,
      rateLimitPerMin: 300,
      maxTacticalConfigs: Number.POSITIVE_INFINITY,
    },
  },
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.query }),
  withTenant: (tenantId: string, fn: (c: unknown) => Promise<unknown>) =>
    dbMocks.withTenant(tenantId, fn),
  withTenantReadOnly: (tenantId: string, fn: (c: unknown) => Promise<unknown>) =>
    dbMocks.withTenant(tenantId, fn),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: createLoggerMocks(),
}));

vi.mock('stripe', () => ({
  default: class {
    subscriptions = stripeMocks.subscriptions;
    customers = stripeMocks.customers;
    checkout = stripeMocks.checkout;
    billingPortal = stripeMocks.billingPortal;
    webhooks = stripeMocks.webhooks;
  },
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisMocks,
}));

import {
  priceIdForPlan,
  planForPriceId,
  isBillingEnabled,
  getSubscriptionSummary,
  handleWebhookEvent,
  getStripe,
  ensureCustomer,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
} from '../../../packages/backend/src/application/billing/billingService.js';
import {
  recordUsage,
  getMonthlyUsage,
} from '../../../packages/backend/src/application/billing/usageService.js';
import {
  getPlanLimits,
  currentPeriod,
} from '../../../packages/backend/src/application/billing/planLimitsService.js';

const ORG = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.withTenant.mockImplementation(async (_t: string, fn: (c: unknown) => Promise<unknown>) =>
    fn(dbMocks.client),
  );
  dbMocks.client.query.mockResolvedValue({ rows: [] });
});

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    cancel_at_period_end: false,
    metadata: { org_id: ORG },
    items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1800000000 }] },
    ...overrides,
  };
}
const findOrgUpdate = () =>
  dbMocks.query.mock.calls.find((c) => String(c[0]).includes('UPDATE organizations'));
describe('plan/price 映射', () => {
  it.each<[string, (x: string | null) => string, string | null, string]>([
    ['priceIdForPlan 返回配置的 Price', priceIdForPlan, 'pro', 'price_pro'],
    ['planForPriceId 反查计划', planForPriceId, 'price_ent', 'enterprise'],
    ['planForPriceId 未匹配回 free', planForPriceId, 'price_unknown', 'free'],
    ['planForPriceId 空值回 free', planForPriceId, null, 'free'],
  ])('%s', (_n, fn, input, expected) => {
    expect(fn(input)).toBe(expected);
  });
  it('isBillingEnabled 在配置密钥时为 true', () => {
    expect(isBillingEnabled()).toBe(true);
  });
});
describe('getPlanLimits', () => {
  it.each<[string, number, number, number, number]>([
    ['free', 100, 10, 1, 10],
    ['pro', 5000, 50, 5, 60],
    ['enterprise', Number.POSITIVE_INFINITY, 200, 20, 300],
  ])('%s 计划应返回对应限额', (plan, backtests, tickers, concurrency, rateLimit) => {
    const limits = getPlanLimits(plan);
    expect(limits.backtestsPerMonth).toBe(backtests);
    expect(limits.maxTickers).toBe(tickers);
    expect(limits.asyncConcurrency).toBe(concurrency);
    expect(limits.rateLimitPerMin).toBe(rateLimit);
  });

  it('未知计划应回到 free（fail-safe）', () => {
    expect(getPlanLimits(null)).toBe(getPlanLimits('free'));
    expect(getPlanLimits(undefined)).toBe(getPlanLimits('free'));
    expect(getPlanLimits('unknown')).toBe(getPlanLimits('free'));
    expect(getPlanLimits('')).toBe(getPlanLimits('free'));
  });
});
describe('currentPeriod', () => {
  it('应返回 YYYY-MM 格式', () => {
    const period = currentPeriod(new Date('2026-06-15T12:00:00Z'));
    expect(period).toBe('2026-06');
  });

  it('1 月应补零', () => {
    const period = currentPeriod(new Date('2026-01-01T00:00:00Z'));
    expect(period).toBe('2026-01');
  });

  it('默认使用当前时间', () => {
    const period = currentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
  });
});
describe('getSubscriptionSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['无记录返回 null', { rows: [] }, null],
    [
      '映射数据库行',
      {
        rows: [
          {
            plan: 'pro',
            status: 'active',
            current_period_end: new Date('2026-02-01T00:00:00Z'),
            cancel_at_period_end: false,
          },
        ],
      },
      {
        plan: 'pro',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: '2026-02-01T00:00:00.000Z',
      },
    ],
  ])('%s', async (_n, rows, expected) => {
    dbMocks.query.mockResolvedValueOnce(rows);
    const summary = await getSubscriptionSummary(ORG);
    if (expected === null) {
      expect(summary).toBeNull();
    } else {
      expect(summary).toMatchObject(expected as Record<string, unknown>);
    }
  });
});
describe('handleWebhookEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      'subscription.updated 同步 subscriptions 与 organizations（active->pro）',
      { type: 'customer.subscription.updated', data: { object: makeSub() } },
      [ORG, 'pro', 'active'],
    ],
    [
      'subscription.deleted 同步为 canceled 并回落 free',
      { type: 'customer.subscription.deleted', data: { object: makeSub({ status: 'canceled' }) } },
      [ORG, 'free', 'canceled'],
    ],
    [
      'checkout.session.completed 应检索订阅并同步',
      {
        type: 'checkout.session.completed',
        data: { object: { metadata: { org_id: ORG }, subscription: 'sub_1' } },
      },
      [ORG, 'pro', 'active'],
    ],
  ])('%s', async (_n, event, expectedOrgUpdate) => {
    if (event.type === 'checkout.session.completed') {
      stripeMocks.subscriptions.retrieve.mockResolvedValueOnce(makeSub());
    }
    dbMocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
    await handleWebhookEvent(event as never);
    const calls = dbMocks.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes('INSERT INTO subscriptions'))).toBe(true);
    expect(findOrgUpdate()?.[1]).toEqual(expectedOrgUpdate);
  });
  it('无 org 映射时跳过（按 customer 反查未命中）', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] }); // orgIdForCustomer
    await handleWebhookEvent({
      type: 'customer.subscription.updated',
      data: { object: makeSub({ customer: 'cus_unknown', metadata: {} }) },
    } as never);
    expect(findOrgUpdate()).toBeUndefined();
  });
  it('默认事件类型应记录 debug 日志', async () => {
    await handleWebhookEvent({ type: 'invoice.paid', data: { object: {} } } as never);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});
describe('getStripe', () => {
  it('首次调用创建实例，再次调用返回缓存实例', () => {
    const s1 = getStripe();
    expect(s1).not.toBeNull();
    expect(s1?.subscriptions).toBeDefined();
    expect(getStripe()).toBe(s1);
  });
});
describe('ensureCustomer', () => {
  beforeEach(() => vi.clearAllMocks());
  it('已有 customer 记录时直接返回', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_existing' }] });
    const id = await ensureCustomer(ORG, 'test@test.com');
    expect(id).toBe('cus_existing');
    expect(stripeMocks.customers.create).not.toHaveBeenCalled();
  });
  it('无记录时创建新 customer 并持久化', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] }); // SELECT stripe_customer_id
    dbMocks.query.mockResolvedValueOnce({ rows: [{ name: 'Test Org' }] }); // SELECT org name
    stripeMocks.customers.create.mockResolvedValueOnce({ id: 'cus_new' });
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 }); // UPSERT
    const id = await ensureCustomer(ORG, 'admin@test.com');
    expect(id).toBe('cus_new');
    expect(stripeMocks.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@test.com', metadata: { org_id: ORG } }),
    );
    expect(dbMocks.query.mock.calls[2][0]).toContain('INSERT INTO stripe_customers');
  });
});
describe('createCheckoutSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      '应创建 Checkout 会话并返回 URL',
      { url: 'https://checkout.stripe.com/session_1' },
      'https://checkout.stripe.com/session_1',
      false,
    ],
    ['Stripe 返回无 url 时应抛出', { url: null }, undefined, true],
  ])('%s', async (_n, createResult, expectedUrl, throws) => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] }); // ensureCustomer
    stripeMocks.checkout.sessions.create.mockResolvedValueOnce(createResult);
    const args = { orgId: ORG, plan: 'pro', successUrl: 'http://ok', cancelUrl: 'http://cancel' };
    if (throws) {
      await expect(createCheckoutSession(args)).rejects.toThrow('checkout_session_no_url');
    } else {
      expect(await createCheckoutSession(args)).toBe(expectedUrl);
      expect(stripeMocks.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'subscription', metadata: { org_id: ORG, plan: 'pro' } }),
      );
    }
  });
});
describe('createPortalSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      '应创建 Portal 会话并返回 URL',
      { rows: [{ stripe_customer_id: 'cus_1' }] },
      'https://billing.stripe.com/portal_1',
      false,
    ],
    ['无 customer 记录时应抛出', { rows: [] }, undefined, true],
  ])('%s', async (_n, customerRows, expectedUrl, throws) => {
    dbMocks.query.mockResolvedValueOnce(customerRows);
    if (throws) {
      await expect(createPortalSession(ORG, 'http://return')).rejects.toThrow('no_customer');
    } else {
      stripeMocks.billingPortal.sessions.create.mockResolvedValueOnce({ url: expectedUrl });
      expect(await createPortalSession(ORG, 'http://return')).toBe(expectedUrl);
    }
  });
});
describe('constructWebhookEvent', () => {
  it('应校验签名并返回事件', () => {
    const fakeEvent = { type: 'customer.subscription.updated' };
    stripeMocks.webhooks.constructEvent.mockReturnValueOnce(fakeEvent);
    const raw = Buffer.from('{}');
    const event = constructWebhookEvent(raw, 'sig_123');
    expect(event).toBe(fakeEvent);
    expect(stripeMocks.webhooks.constructEvent).toHaveBeenCalledWith(raw, 'sig_123', 'whsec_123');
  });
});
describe('recordUsage', () => {
  it('双写明细 + 聚合并递增 Redis', async () => {
    redisMocks.incrby.mockResolvedValueOnce(1);
    await recordUsage(ORG, 'backtest', 1, { path: '/x' });

    const sqls = dbMocks.client.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('INSERT INTO usage_events'))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO usage_counters'))).toBe(true);
    expect(redisMocks.incrby).toHaveBeenCalledWith(expect.stringContaining(`usage:${ORG}:`), 1);
    expect(redisMocks.expire).toHaveBeenCalled();
  });

  it('DB 失败不抛出（容错）', async () => {
    dbMocks.withTenant.mockRejectedValueOnce(new Error('db down'));
    redisMocks.incrby.mockResolvedValueOnce(5);
    await expect(recordUsage(ORG, 'backtest')).resolves.toBeUndefined();
  });

  it('Redis incrby 失败应记录警告不抛出', async () => {
    redisMocks.incrby.mockRejectedValueOnce(new Error('redis down'));
    await expect(recordUsage(ORG, 'backtest')).resolves.toBeUndefined();
  });
});
describe('getMonthlyUsage', () => {
  it('Redis 命中时直接返回', async () => {
    redisMocks.get.mockResolvedValueOnce('42');
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(42);
    expect(dbMocks.withTenant).not.toHaveBeenCalled();
  });

  it('Redis 未命中回退 DB 并回填', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ count: 7 }] });
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(7);
    expect(redisMocks.set).toHaveBeenCalled();
  });

  it('DB 无记录返回 0', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    dbMocks.client.query.mockResolvedValueOnce({ rows: [] });
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(0);
  });

  it('Redis get 异常应回退 DB', async () => {
    redisMocks.get.mockRejectedValueOnce(new Error('redis get down'));
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ count: 3 }] });
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(3);
  });

  it('回填 Redis 失败应忽略', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ count: 7 }] });
    redisMocks.set.mockRejectedValueOnce(new Error('set failed'));
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(7);
  });

  it('DB 查询失败应返回 0 并记录错误', async () => {
    redisMocks.get.mockResolvedValueOnce(null);
    dbMocks.client.query.mockRejectedValueOnce(new Error('db error'));
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(0);
  });

  it('Redis 缓存值为非数字应回退 DB', async () => {
    redisMocks.get.mockResolvedValueOnce('NaN');
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ count: 5 }] });
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(5);
  });
});
