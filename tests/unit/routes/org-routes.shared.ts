import { vi } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createConfigMocks } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import type { Router } from 'express';

const internalMocks = vi.hoisted(() => ({
  svc: {
    isBillingEnabled: vi.fn(),
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    getSubscriptionSummary: vi.fn(),
    constructWebhookEvent: vi.fn(),
    handleWebhookEvent: vi.fn(),
  },
  membership: {
    getOrg: vi.fn(),
    updateOrgName: vi.fn(),
    listOrgMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
  invitation: {
    createInvitation: vi.fn(),
    listInvitations: vi.fn(),
    revokeInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
  },
  mail: { sendInvitationEmail: vi.fn() },
}));

vi.mock(
  '../../../packages/backend/src/application/billing/billingService.js',
  () => internalMocks.svc,
);
vi.mock(
  '../../../packages/backend/src/application/org/membershipService.js',
  () => internalMocks.membership,
);
vi.mock(
  '../../../packages/backend/src/application/org/invitationService.js',
  () => internalMocks.invitation,
);
vi.mock('../../../packages/backend/src/infrastructure/mailService.js', () => internalMocks.mail);
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
import '../../helpers/middlewareMocks.js';
vi.mock('../../../packages/backend/src/middleware/miscMiddleware.js', () => ({
  validate: (schema: unknown) => (req: TestRequest, res: unknown, next: () => void) => {
    const result = (
      schema as { safeParse?: (v: unknown) => { success: boolean; data?: unknown } }
    )?.safeParse?.(req.body);
    if (result === undefined) return next();
    if (!result.success) {
      (res as { status: (n: number) => { json: (b: unknown) => void } })
        .status(400)
        .json({ success: false, error: { code: 'VALIDATION_ERROR' } });
      return;
    }
    req.body = result.data;
    next();
  },
}));
vi.mock('../../../packages/backend/src/schemas/backtest.js', () => ({
  portfolioBodySchema: {},
  savedConfigBodySchema: {},
  backtestRunBodySchema: {},
  PortfolioBody: Object,
  SavedConfigBody: Object,
  BacktestRunBody: Object,
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ STRIPE_PUBLISHABLE_KEY: 'pk_test_1' }),
}));
export const mocks = internalMocks;
export const ORG = '11111111-1111-1111-1111-111111111111';
export const USER = '33333333-3333-3333-3333-333333333333';
export const MEMBER = '44444444-4444-4444-4444-444444444444';

interface StartOpts {
  role?: string;
  orgRole?: string;
  tenant?: string | null;
  sub?: string;
}

export async function startApp(
  mountPath: string,
  routes: Router,
  opts: StartOpts = {},
): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      const tenant = opts.tenant ?? ORG;
      req.user = {
        sub: opts.sub ?? USER,
        role: opts.role ?? 'admin',
        tenant_id: tenant,
        org_role: opts.orgRole ?? opts.role ?? 'admin',
      };
      if (opts.tenant !== null) req.tenantId = tenant;
      next();
    });
    app.use(mountPath, routes);
  });
}

export async function jsonFetch(url: string, method = 'GET', body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  return { res, json: await res.json() };
}
