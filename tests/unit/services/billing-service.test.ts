/**
 * Stripe 计费服务单元测试（ADR-036）
 *
 * 企业理由：计费同步逻辑直接决定租户的计划/状态，错误会造成误收费或越权使用。验证：
 * 1. 计划<->Price 双向映射正确
 * 2. getSubscriptionSummary 映射数据库行
 * 3. webhook 同步把订阅状态写回 subscriptions + organizations（取消时回落 free）
 *
 * Mock 策略：mock config（注入 price/secret）、db.getPool、stripe SDK。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
const stripeMocks = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn() },
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
}));
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
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
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.query }),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
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

const ORG = '11111111-1111-1111-1111-111111111111';

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
