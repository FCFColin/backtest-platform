import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mocks, startApp, jsonFetch } from './org-routes.shared.js';
import type { TestServer } from '../../helpers/expressApp.js';
import { startExpressApp } from '../../helpers/expressApp.js';
import billingRoutes, {
  billingWebhookHandler,
} from '../../../packages/backend/src/routes/billingRoutes.js';
import { appRedis } from '../../../packages/backend/src/infrastructure/redisClient.js';

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

describe('billingWebhookHandler', () => {
  let server: TestServer;
  const post = (url: string) =>
    fetch(url, { method: 'POST', headers: { 'stripe-signature': 'sig' } });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.svc.isBillingEnabled.mockReturnValue(true);
  });
  afterEach(async () => {
    if (server) await server.close();
  });
  const mount = async () => {
    server = await startExpressApp((app) => {
      app.use('/api/v1/billing/webhook', billingWebhookHandler);
    });
  };

  it('签名校验失败返回 400，不进入去重与处理', async () => {
    mocks.svc.constructWebhookEvent.mockImplementationOnce(() => {
      throw new Error('bad signature');
    });
    await mount();
    const res = await post(`${server.url}/api/v1/billing/webhook`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ received: false, error: 'invalid signature' });
    expect(mocks.svc.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('处理失败返回 500 并删除去重键，避免 Stripe 重试被吞掉', async () => {
    mocks.svc.constructWebhookEvent.mockReturnValue({
      id: 'evt_fail',
      type: 'checkout.session.completed',
    });
    mocks.svc.handleWebhookEvent.mockRejectedValueOnce(new Error('boom'));
    await mount();
    const res = await post(`${server.url}/api/v1/billing/webhook`);
    expect(res.status).toBe(500);
    expect(appRedis.del).toHaveBeenCalledWith('stripe:event:evt_fail');
  });

  it('处理成功返回 200 且不删除去重键', async () => {
    mocks.svc.constructWebhookEvent.mockReturnValue({
      id: 'evt_ok',
      type: 'checkout.session.completed',
    });
    mocks.svc.handleWebhookEvent.mockResolvedValueOnce(undefined);
    await mount();
    const res = await post(`${server.url}/api/v1/billing/webhook`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(appRedis.del).not.toHaveBeenCalled();
  });

  it('去重命中（事件已处理）跳过 handleWebhookEvent 并返回 200', async () => {
    mocks.svc.constructWebhookEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'checkout.session.completed',
    });
    (appRedis.set as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await mount();
    const res = await post(`${server.url}/api/v1/billing/webhook`);
    expect(res.status).toBe(200);
    expect(mocks.svc.handleWebhookEvent).not.toHaveBeenCalled();
  });
});
