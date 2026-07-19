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
    APP_BASE_URL: 'http://localhost:5173',
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
} from '../../../packages/backend/src/services/billingService.js';

const ORG = '11111111-1111-1111-1111-111111111111';

describe('plan/price 映射', () => {
  it('priceIdForPlan 返回配置的 Price', () => {
    expect(priceIdForPlan('pro')).toBe('price_pro');
    expect(priceIdForPlan('enterprise')).toBe('price_ent');
  });

  it('planForPriceId 反查计划，未匹配回 free', () => {
    expect(planForPriceId('price_pro')).toBe('pro');
    expect(planForPriceId('price_ent')).toBe('enterprise');
    expect(planForPriceId('price_unknown')).toBe('free');
    expect(planForPriceId(null)).toBe('free');
  });

  it('isBillingEnabled 在配置密钥时为 true', () => {
    expect(isBillingEnabled()).toBe(true);
  });
});

describe('getSubscriptionSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('无记录返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getSubscriptionSummary(ORG)).toBeNull();
  });

  it('映射数据库行', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          plan: 'pro',
          status: 'active',
          current_period_end: new Date('2026-02-01T00:00:00Z'),
          cancel_at_period_end: false,
        },
      ],
    });
    const summary = await getSubscriptionSummary(ORG);
    expect(summary).toMatchObject({ plan: 'pro', status: 'active', cancelAtPeriodEnd: false });
    expect(summary?.currentPeriodEnd).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('handleWebhookEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('subscription.updated 同步 subscriptions 与 organizations（active->pro）', async () => {
    dbMocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const sub = {
      id: 'sub_1',
      status: 'active',
      customer: 'cus_1',
      cancel_at_period_end: false,
      metadata: { org_id: ORG },
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1800000000 }] },
    };
    await handleWebhookEvent({
      type: 'customer.subscription.updated',
      data: { object: sub },
    } as never);

    const calls = dbMocks.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes('INSERT INTO subscriptions'))).toBe(true);
    const orgUpdate = dbMocks.query.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE organizations'),
    );
    expect(orgUpdate?.[1]).toEqual([ORG, 'pro', 'active']);
  });

  it('subscription.deleted 同步为 canceled 并回落 free', async () => {
    dbMocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const sub = {
      id: 'sub_1',
      status: 'canceled',
      customer: 'cus_1',
      cancel_at_period_end: false,
      metadata: { org_id: ORG },
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1800000000 }] },
    };
    await handleWebhookEvent({
      type: 'customer.subscription.deleted',
      data: { object: sub },
    } as never);
    const orgUpdate = dbMocks.query.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE organizations'),
    );
    expect(orgUpdate?.[1]).toEqual([ORG, 'free', 'canceled']);
  });

  it('无 org 映射时跳过（按 customer 反查未命中）', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] }); // orgIdForCustomer
    const sub = {
      id: 'sub_1',
      status: 'active',
      customer: 'cus_unknown',
      cancel_at_period_end: false,
      metadata: {},
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1 }] },
    };
    await handleWebhookEvent({
      type: 'customer.subscription.updated',
      data: { object: sub },
    } as never);
    const orgUpdate = dbMocks.query.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE organizations'),
    );
    expect(orgUpdate).toBeUndefined();
  });

  it('checkout.session.completed 应检索订阅并同步', async () => {
    stripeMocks.subscriptions.retrieve.mockResolvedValueOnce({
      id: 'sub_1',
      status: 'active',
      customer: 'cus_1',
      cancel_at_period_end: false,
      metadata: { org_id: ORG },
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1800000000 }] },
    });
    dbMocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const session = { metadata: { org_id: ORG }, subscription: 'sub_1' };
    await handleWebhookEvent({
      type: 'checkout.session.completed',
      data: { object: session },
    } as never);
    expect(stripeMocks.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    const orgUpdate = dbMocks.query.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE organizations'),
    );
    expect(orgUpdate?.[1]).toEqual([ORG, 'pro', 'active']);
  });

  it('默认事件类型应记录 debug 日志', async () => {
    await handleWebhookEvent({ type: 'invoice.paid', data: { object: {} } } as never);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});

describe('getStripe', () => {
  it('首次调用应创建 Stripe 实例', () => {
    const s = getStripe();
    expect(s).not.toBeNull();
    expect(s?.subscriptions).toBeDefined();
  });

  it('再次调用应返回缓存实例', () => {
    const s1 = getStripe();
    const s2 = getStripe();
    expect(s1).toBe(s2);
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

  it('应创建 Checkout 会话并返回 URL', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] }); // ensureCustomer
    stripeMocks.checkout.sessions.create.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/session_1',
    });
    const url = await createCheckoutSession({
      orgId: ORG,
      plan: 'pro',
      successUrl: 'http://ok',
      cancelUrl: 'http://cancel',
    });
    expect(url).toBe('https://checkout.stripe.com/session_1');
    expect(stripeMocks.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'subscription', metadata: { org_id: ORG, plan: 'pro' } }),
    );
  });

  it('Stripe 返回无 url 时应抛出', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] });
    stripeMocks.checkout.sessions.create.mockResolvedValueOnce({ url: null });
    await expect(
      createCheckoutSession({
        orgId: ORG,
        plan: 'pro',
        successUrl: 'http://ok',
        cancelUrl: 'http://cancel',
      }),
    ).rejects.toThrow('checkout_session_no_url');
  });
});

describe('createPortalSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应创建 Portal 会话并返回 URL', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_1' }] });
    stripeMocks.billingPortal.sessions.create.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/portal_1',
    });
    const url = await createPortalSession(ORG, 'http://return');
    expect(url).toBe('https://billing.stripe.com/portal_1');
  });

  it('无 customer 记录时应抛出', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(createPortalSession(ORG, 'http://return')).rejects.toThrow('no_customer');
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
