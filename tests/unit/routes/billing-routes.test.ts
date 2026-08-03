import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mocks, startApp, jsonFetch } from './org-routes.shared.js';
import type { TestServer } from '../../helpers/expressApp.js';
import billingRoutes from '../../../packages/backend/src/routes/billingRoutes.js';

describe('billingRoutes', () => {
  let server: TestServer;
  beforeEach(() => vi.clearAllMocks());
  afterEach(async () => {
    if (server) await server.close();
  });

  it('GET /subscription 返回启用状态与摘要', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    mocks.svc.getSubscriptionSummary.mockResolvedValueOnce({
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    server = await startApp('/api/v1/billing', billingRoutes, { sub: 'user-1' });
    const { res, json } = await jsonFetch(`${server.url}/api/v1/billing/subscription`);
    expect(res.status).toBe(200);
    expect(json.data.enabled).toBe(true);
    expect(json.data.publishableKey).toBe('pk_test_1');
    expect(json.data.subscription.plan).toBe('pro');
  });

  it('POST /checkout 非 admin 返回 403', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    server = await startApp('/api/v1/billing', billingRoutes, { role: 'readonly', sub: 'user-1' });
    const { res } = await jsonFetch(`${server.url}/api/v1/billing/checkout`, 'POST', {
      plan: 'pro',
    });
    expect(res.status).toBe(403);
    expect(mocks.svc.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('POST /checkout 计费未启用返回 503', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(false);
    server = await startApp('/api/v1/billing', billingRoutes, { sub: 'user-1' });
    const { res } = await jsonFetch(`${server.url}/api/v1/billing/checkout`, 'POST', {
      plan: 'pro',
    });
    expect(res.status).toBe(503);
  });

  it('POST /checkout 非法 plan 返回 400', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    server = await startApp('/api/v1/billing', billingRoutes, { sub: 'user-1' });
    const { res } = await jsonFetch(`${server.url}/api/v1/billing/checkout`, 'POST', {
      plan: 'gold',
    });
    expect(res.status).toBe(400);
  });

  it('POST /checkout 成功返回跳转 URL', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    mocks.svc.createCheckoutSession.mockResolvedValueOnce('https://checkout.stripe.com/x');
    server = await startApp('/api/v1/billing', billingRoutes, { sub: 'user-1' });
    const { res, json } = await jsonFetch(`${server.url}/api/v1/billing/checkout`, 'POST', {
      plan: 'pro',
    });
    expect(res.status).toBe(200);
    expect(json.data.url).toBe('https://checkout.stripe.com/x');
    expect(mocks.svc.createCheckoutSession).toHaveBeenCalled();
  });

  it('POST /portal 无客户记录返回 404', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    mocks.svc.createPortalSession.mockRejectedValueOnce(new Error('no_customer'));
    server = await startApp('/api/v1/billing', billingRoutes, { sub: 'user-1' });
    const res = await fetch(`${server.url}/api/v1/billing/portal`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
