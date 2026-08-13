import '../helpers/loggerMock.js';
import { describe, it, expect, vi } from 'vitest';
import { useTestServer } from '../helpers/expressApp.js';

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

import billingRoutes from '../../packages/backend/src/routes/billingRoutes.js';
import { NoStripeCustomerError } from '../../packages/backend/src/utils/errors.js';

const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'user-id-billing';
const server = useTestServer('/api/v1/billing', billingRoutes, {
  auth: {
    user: { sub: userId, role: 'admin', tenant_id: orgId, org_role: 'owner' },
    tenantId: orgId,
  },
});

describe('计费路由集成测试', () => {
  it('GET /subscription 计费禁用时返回 enabled:false', async () => {
    billingEnabledMock.mockReturnValue(false);
    const { res, body } = await server.get('/subscription');
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.enabled).toBe(false);
    expect(body.data.subscription).toEqual({ plan: 'free', status: 'active' });
  });

  it('GET /subscription 计费启用时返回 enabled:true', async () => {
    billingEnabledMock.mockReturnValue(true);
    const { res, body } = await server.get('/subscription');
    expect(res.status).toBe(200);
    expect(body.data.enabled).toBe(true);
  });

  it('POST /checkout 计费禁用时返回 503', async () => {
    billingEnabledMock.mockReturnValue(false);
    const { res, body } = await server.post('/checkout', { plan: 'pro' });
    expect(res.status).toBe(503);
    expect(body.error.code).toBe('BILLING_DISABLED');
  });

  it('POST /checkout 计费启用时返回 Stripe URL', async () => {
    billingEnabledMock.mockReturnValue(true);
    createCheckoutSessionMock.mockResolvedValueOnce('https://checkout.stripe.com/success');
    const { res, body } = await server.post('/checkout', { plan: 'enterprise' });
    expect(res.status).toBe(200);
    expect(body.data.url).toBe('https://checkout.stripe.com/success');
  });

  it('POST /checkout 非法 plan 返回校验错误', async () => {
    const { res } = await server.post('/checkout', { plan: 'invalid-plan' });
    expect(res.status).toBe(400);
  });

  it('POST /portal 计费禁用时返回 503', async () => {
    billingEnabledMock.mockReturnValue(false);
    const { res } = await server.post('/portal');
    expect(res.status).toBe(503);
  });

  it('POST /portal 计费启用但无 customer 返回 404', async () => {
    billingEnabledMock.mockReturnValue(true);
    createPortalSessionMock.mockRejectedValueOnce(new NoStripeCustomerError('no customer for org'));
    const { res, body } = await server.post('/portal');
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NO_CUSTOMER');
  });

  it('POST /portal 计费启用且存在 customer 返回 URL', async () => {
    billingEnabledMock.mockReturnValue(true);
    createPortalSessionMock.mockResolvedValueOnce('https://billing.stripe.com/manage');
    const { res, body } = await server.post('/portal');
    expect(res.status).toBe(200);
    expect(body.data.url).toBe('https://billing.stripe.com/manage');
  });
});
