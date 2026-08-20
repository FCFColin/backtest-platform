import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConfigMocks } from '../../helpers/mockFactories.js';
import { redisMocks, redisModuleMock } from '../../helpers/redisFixture.js';
import { NoStripeCustomerError } from '../../../packages/backend/src/utils/errors.js';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTenant: vi.fn(),
  client: { query: vi.fn() },
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
    free: { backtestsPerMonth: 100, maxTickers: 10, asyncConcurrency: 1, maxTacticalConfigs: 10 },
    pro: { backtestsPerMonth: 5000, maxTickers: 50, asyncConcurrency: 5, maxTacticalConfigs: 100 },
    enterprise: {
      backtestsPerMonth: Number.POSITIVE_INFINITY,
      maxTickers: 200,
      asyncConcurrency: 20,
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
  withPlatformContext: (fn: (c: unknown) => Promise<unknown>) => fn({ query: dbMocks.query }),
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

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);

import {
  priceIdForPlan,
  planForPriceId,
  isBillingEnabled,
  getSubscriptionSummary,
  handleWebhookEvent,
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
  dbMocks.client.query.mock.calls.find((c) => String(c[0]).includes('UPDATE organizations'));
describe('plan/price 映射', () => {
  it.each<[string, (x: string | null) => string, string | null, string]>([
    [
      'priceIdForPlan 返回配置的 Price',
      priceIdForPlan as (x: string | null) => string,
      'pro',
      'price_pro',
    ],
    [
      'planForPriceId 反查计划',
      planForPriceId as (x: string | null) => string,
      'price_ent',
      'enterprise',
    ],
    [
      'planForPriceId 未匹配回 free',
      planForPriceId as (x: string | null) => string,
      'price_unknown',
      'free',
    ],
    ['planForPriceId 空值回 free', planForPriceId as (x: string | null) => string, null, 'free'],
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
    ['pro', 5000, 50, 5, 100],
    ['enterprise', Number.POSITIVE_INFINITY, 200, 20, Number.POSITIVE_INFINITY],
  ])('%s 计划应返回对应限额', (plan, backtests, tickers, concurrency, configs) => {
    const limits = getPlanLimits(plan);
    expect(limits.backtestsPerMonth).toBe(backtests);
    expect(limits.maxTickers).toBe(tickers);
    expect(limits.asyncConcurrency).toBe(concurrency);
    expect(limits.maxTacticalConfigs).toBe(configs);
  });

  it('未知计划应回到 free', () => {
    expect(getPlanLimits(null)).toBe(getPlanLimits('free'));
    expect(getPlanLimits(undefined)).toBe(getPlanLimits('free'));
    expect(getPlanLimits('unknown')).toBe(getPlanLimits('free'));
  });
});
describe('currentPeriod', () => {
  it('应返回 YYYY-MM 格式', () => {
    expect(currentPeriod(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06');
  });
  it('1 月应补零', () => {
    expect(currentPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });
});
describe('getSubscriptionSummary', () => {
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
    dbMocks.client.query.mockResolvedValueOnce(rows);
    const summary = await getSubscriptionSummary(ORG);
    if (expected === null) expect(summary).toBeNull();
    else expect(summary).toMatchObject(expected as Record<string, unknown>);
  });
});
describe('handleWebhookEvent', () => {
  it.each([
    [
      'subscription.updated',
      { type: 'customer.subscription.updated', data: { object: makeSub() } },
      [ORG, 'pro', 'active'],
    ],
    [
      'subscription.deleted',
      { type: 'customer.subscription.deleted', data: { object: makeSub({ status: 'canceled' }) } },
      [ORG, 'free', 'canceled'],
    ],
    [
      'checkout.session.completed',
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
    dbMocks.client.query.mockResolvedValue({ rows: [], rowCount: 1 });
    await handleWebhookEvent(event as never);
    const calls = dbMocks.client.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes('INSERT INTO subscriptions'))).toBe(true);
    expect(findOrgUpdate()?.[1]).toEqual(expectedOrgUpdate);
  });
  it('无 org 映射时跳过', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await handleWebhookEvent({
      type: 'customer.subscription.updated',
      data: { object: makeSub({ customer: 'cus_unknown', metadata: {} }) },
    } as never);
    expect(findOrgUpdate()).toBeUndefined();
  });
});
describe('ensureCustomer', () => {
  it('已有 customer 记录时直接返回', async () => {
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_existing' }] });
    expect(await ensureCustomer(ORG, 'test@test.com')).toBe('cus_existing');
    expect(stripeMocks.customers.create).not.toHaveBeenCalled();
  });
  it('无记录时创建新 customer', async () => {
    dbMocks.client.query.mockResolvedValueOnce({ rows: [] });
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ name: 'Test Org' }] });
    stripeMocks.customers.create.mockResolvedValueOnce({ id: 'cus_new' });
    dbMocks.client.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await ensureCustomer(ORG, 'admin@test.com')).toBe('cus_new');
    expect(stripeMocks.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@test.com', metadata: { org_id: ORG } }),
    );
  });
});
describe('createCheckoutSession', () => {
  it.each([
    [
      '应创建 Checkout 会话并返回 URL',
      { url: 'https://checkout.stripe.com/session_1' },
      'https://checkout.stripe.com/session_1',
      false,
    ],
    ['Stripe 返回无 url 时应抛出', { url: null }, undefined, true],
  ])('%s', async (_n, createResult, expectedUrl, throws) => {
    dbMocks.client.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] });
    stripeMocks.checkout.sessions.create.mockResolvedValueOnce(createResult);
    const args = {
      orgId: ORG,
      plan: 'pro' as const,
      successUrl: 'http://ok',
      cancelUrl: 'http://cancel',
    };
    if (throws)
      await expect(createCheckoutSession(args)).rejects.toThrow('checkout_session_no_url');
    else expect(await createCheckoutSession(args)).toBe(expectedUrl);
  });
});
describe('createPortalSession', () => {
  it.each([
    [
      '应创建 Portal 会话并返回 URL',
      { rows: [{ stripe_customer_id: 'cus_1' }] },
      'https://billing.stripe.com/portal_1',
      false,
    ],
    ['无 customer 记录时应抛出', { rows: [] }, undefined, true],
  ])('%s', async (_n, customerRows, expectedUrl, throws) => {
    dbMocks.client.query.mockResolvedValueOnce(customerRows);
    if (throws)
      await expect(createPortalSession(ORG, 'http://return')).rejects.toBeInstanceOf(
        NoStripeCustomerError,
      );
    else {
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
    expect(constructWebhookEvent(raw, 'sig_123')).toBe(fakeEvent);
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
  });
  it('DB 失败不抛出', async () => {
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
  it.each<[string, string | null | Error, unknown, number, string | Error | null]>([
    ['Redis 未命中回退 DB', null, { rows: [{ count: 7 }] }, 7, 'OK'],
    ['DB 无记录返回 0', null, { rows: [] }, 0, null],
    ['Redis get 异常回退 DB', new Error('get down'), { rows: [{ count: 3 }] }, 3, null],
    ['回填 Redis 失败应忽略', null, { rows: [{ count: 7 }] }, 7, new Error('set failed')],
    ['Redis 缓存值非数字', 'NaN', { rows: [{ count: 5 }] }, 5, null],
  ])('%s', async (_n, redisVal, dbVal, expected, setVal) => {
    if (redisVal instanceof Error) redisMocks.get.mockRejectedValueOnce(redisVal);
    else redisMocks.get.mockResolvedValueOnce(redisVal);
    if (dbVal instanceof Error) dbMocks.client.query.mockRejectedValueOnce(dbVal);
    else dbMocks.client.query.mockResolvedValueOnce(dbVal);
    if (setVal instanceof Error) redisMocks.set.mockRejectedValueOnce(setVal);
    else if (setVal !== null) redisMocks.set.mockResolvedValueOnce(setVal);
    expect(await getMonthlyUsage(ORG, 'backtest')).toBe(expected);
  });

  it('DB 查询失败应向上抛错', async () => {
    dbMocks.client.query.mockRejectedValueOnce(new Error('db error'));
    await expect(getMonthlyUsage(ORG, 'backtest')).rejects.toThrow('db error');
  });
});
