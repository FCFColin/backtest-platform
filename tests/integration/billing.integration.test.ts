/**
 * 计费路由集成测试（RO-049）
 *
 * 验证 Stripe 计费端点（ADR-036）：订阅摘要、Checkout 会话、Billing Portal 会话。
 * billingService 被 mock 以覆盖计费启用/禁用两条路径，避免真实调用 Stripe。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

const {
  billingEnabledMock,
  getSubscriptionSummaryMock,
  createCheckoutSessionMock,
  createPortalSessionMock,
} = vi.hoisted(() => ({
  billingEnabledMock: vi.fn(() => false),
  getSubscriptionSummaryMock: vi.fn(async () => ({ plan: 'free', status: 'active' })),
  createCheckoutSessionMock: vi.fn(async () => 'https://checkout.stripe.com/session-123'),
  createPortalSessionMock: vi.fn(async () => 'https://billing.stripe.com/portal-123'),
}));

vi.mock('../../packages/backend/src/application/billing/billingService.js', () => ({
  isBillingEnabled: billingEnabledMock,
  getSubscriptionSummary: getSubscriptionSummaryMock,
  createCheckoutSession: createCheckoutSessionMock,
  createPortalSession: createPortalSessionMock,
  constructWebhookEvent: vi.fn(),
  handleWebhookEvent: vi.fn(),
  getStripe: vi.fn(() => null),
  priceIdForPlan: vi.fn(() => ''),
  planForPriceId: vi.fn(() => 'free'),
  ensureCustomer: vi.fn(),
}));

import express from 'express';
import billingRoutes from '../../packages/backend/src/routes/billingRoutes.js';
import { mockAuthMiddleware } from '../helpers/testcontainersPg.js';

const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'user-id-billing';
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(mockAuthMiddleware(orgId, userId));
  app.use('/api/v1/billing', billingRoutes);

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('计费路由集成测试', () => {
  it('GET /subscription 计费禁用时返回 enabled:false', async () => {
    billingEnabledMock.mockReturnValue(false);
    const res = await fetch(`${baseUrl}/api/v1/billing/subscription`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.enabled).toBe(false);
    expect(json.data.subscription).toEqual({ plan: 'free', status: 'active' });
  });

  it('GET /subscription 计费启用时返回 enabled:true', async () => {
    billingEnabledMock.mockReturnValue(true);
    const res = await fetch(`${baseUrl}/api/v1/billing/subscription`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.enabled).toBe(true);
  });

  it('POST /checkout 计费禁用时返回 503', async () => {
    billingEnabledMock.mockReturnValue(false);
    const res = await fetch(`${baseUrl}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe('BILLING_DISABLED');
  });

  it('POST /checkout 计费启用时返回 Stripe URL', async () => {
    billingEnabledMock.mockReturnValue(true);
    createCheckoutSessionMock.mockResolvedValueOnce('https://checkout.stripe.com/success');
    const res = await fetch(`${baseUrl}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'enterprise' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.url).toBe('https://checkout.stripe.com/success');
  });

  it('POST /checkout 非法 plan 返回校验错误', async () => {
    const res = await fetch(`${baseUrl}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'invalid-plan' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /portal 计费禁用时返回 503', async () => {
    billingEnabledMock.mockReturnValue(false);
    const res = await fetch(`${baseUrl}/api/v1/billing/portal`, {
      method: 'POST',
    });
    expect(res.status).toBe(503);
  });

  it('POST /portal 计费启用但无 customer 返回 404', async () => {
    billingEnabledMock.mockReturnValue(true);
    createPortalSessionMock.mockRejectedValueOnce(new Error('no_customer'));
    const res = await fetch(`${baseUrl}/api/v1/billing/portal`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe('NO_CUSTOMER');
  });

  it('POST /portal 计费启用且存在 customer 返回 URL', async () => {
    billingEnabledMock.mockReturnValue(true);
    createPortalSessionMock.mockResolvedValueOnce('https://billing.stripe.com/manage');
    const res = await fetch(`${baseUrl}/api/v1/billing/portal`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.url).toBe('https://billing.stripe.com/manage');
  });
});
