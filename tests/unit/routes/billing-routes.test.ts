/**
 * 计费路由单元测试（ADR-036）
 *
 * 企业理由：计费端点触发真实收费流程，必须验证：
 * 1. subscription 任意成员可读，返回 enabled/publishableKey/summary
 * 2. checkout/portal 要求 admin；计费未启用返回 503
 * 3. checkout 成功返回 Stripe 跳转 URL
 *
 * Mock 策略：mock billingService（隔离 Stripe/DB），注入 req.tenantId/req.user 模拟鉴权链。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  svc: {
    isBillingEnabled: vi.fn(),
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    getSubscriptionSummary: vi.fn(),
    constructWebhookEvent: vi.fn(),
    handleWebhookEvent: vi.fn(),
  },
  loggerMocks: ({
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
}),
}));

vi.mock('../../../api/services/billingService.js', () => mocks.svc);
vi.mock('../../../api/config/index.js', () => ({
  config: createConfigMocks({ STRIPE_PUBLISHABLE_KEY: 'pk_test_1', APP_BASE_URL: 'http://localhost:5173' }),
}));
vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(mocks.loggerMocks) }));

import billingRoutes from '../../../api/routes/billingRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';

async function startApp(role = 'admin'): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      req.tenantId = ORG;
      req.user = { sub: 'user-1', role, tenant_id: ORG, org_role: role };
      next();
    });
    app.use('/api/v1/billing', billingRoutes);
  });
}

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
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/billing/subscription`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.enabled).toBe(true);
    expect(body.data.publishableKey).toBe('pk_test_1');
    expect(body.data.subscription.plan).toBe('pro');
  });

  it('POST /checkout 非 admin 返回 403', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    server = await startApp('readonly');
    const res = await fetch(`${server.url}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    expect(res.status).toBe(403);
    expect(mocks.svc.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('POST /checkout 计费未启用返回 503', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(false);
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    expect(res.status).toBe(503);
  });

  it('POST /checkout 非法 plan 返回 400', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'gold' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /checkout 成功返回跳转 URL', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    mocks.svc.createCheckoutSession.mockResolvedValueOnce('https://checkout.stripe.com/x');
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.url).toBe('https://checkout.stripe.com/x');
    expect(mocks.svc.createCheckoutSession).toHaveBeenCalled();
  });

  it('POST /portal 无客户记录返回 404', async () => {
    mocks.svc.isBillingEnabled.mockReturnValue(true);
    mocks.svc.createPortalSession.mockRejectedValueOnce(new Error('no_customer'));
    server = await startApp();
    const res = await fetch(`${server.url}/api/v1/billing/portal`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
