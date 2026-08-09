// 计费路由（Stripe，ADR-036）。webhook 在 app.ts 单独挂载（需原始请求体 + 免鉴权）
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/miscMiddleware.js';
import { emptyBodySchema } from '../schemas/analysisSchemas.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { requireTenantId, sendData } from './routeUtils.js';
import { appRedis } from '../infrastructure/redisClient.js';
import {
  isBillingEnabled,
  createCheckoutSession,
  createPortalSession,
  getSubscriptionSummary,
  constructWebhookEvent,
  handleWebhookEvent,
} from '../application/billing/billingService.js';

const router = Router();

const requireAdmin = requirePermission(Permission.ADMIN_ACCESS);

function requireBillingEnabled(res: Response): boolean {
  if (!isBillingEnabled()) {
    sendProblem(res, 503, 'BILLING_DISABLED');
    return false;
  }
  return true;
}

router.use(requireTenant);

router.get('/subscription', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  const summary = await getSubscriptionSummary(tenantId);
  sendData(res, {
    enabled: isBillingEnabled(),
    publishableKey: config.STRIPE_PUBLISHABLE_KEY || null,
    subscription: summary,
  });
});

const checkoutSchema = z.object({ plan: z.enum(['pro', 'enterprise']) });
router.post(
  '/checkout',
  requireAdmin,
  validate(checkoutSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!requireBillingEnabled(res)) return;
    const { plan } = req.body as { plan: 'pro' | 'enterprise' };
    const base = config.APP_BASE_URL;
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const url = await createCheckoutSession({
        orgId: tenantId,
        plan,
        email: undefined,
        successUrl: `${base}/account?billing=success`,
        cancelUrl: `${base}/pricing?billing=cancel`,
      });
      sendData(res, { url });
    } catch (err) {
      const msg = String(err);
      if (msg.includes('price_not_configured')) {
        sendProblem(res, 503, 'PRICE_NOT_CONFIGURED');
        return;
      }
      logger.error({ err: msg, orgId: req.tenantId }, '[billingRoutes] 创建 Checkout 失败');
      sendProblem(res, 502, 'CHECKOUT_FAILED');
    }
  },
);

router.post(
  '/portal',
  requireAdmin,
  validate(emptyBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!requireBillingEnabled(res)) return;
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;
      const url = await createPortalSession(tenantId, `${config.APP_BASE_URL}/account`);
      sendData(res, { url });
    } catch (err) {
      const msg = String(err);
      if (msg.includes('no_customer')) {
        sendProblem(res, 404, 'NO_CUSTOMER');
        return;
      }
      logger.error({ err: msg, orgId: req.tenantId }, '[billingRoutes] 创建 Portal 失败');
      sendProblem(res, 502, 'PORTAL_FAILED');
    }
  },
);

const STRIPE_EVENT_DEDUP_TTL_SECONDS = 24 * 60 * 60;

const STRIPE_EVENT_KEY_PREFIX = 'stripe:event:';

// ADR-036: Stripe webhook 幂等去重（24h TTL，防重复开通订阅）
async function isStripeEventNew(eventId: string): Promise<boolean> {
  const key = `${STRIPE_EVENT_KEY_PREFIX}${eventId}`;
  const result = await appRedis.set(key, '1', 'EX', STRIPE_EVENT_DEDUP_TTL_SECONDS, 'NX');
  return result === 'OK';
}

// ADR-036: 由 app.ts 用 express.raw 在全局 json 之前挂载以保证签名校验拿到原始字节
// P2-4: Redis SET NX EX 事件去重防 Stripe 重试重复执行
export async function billingWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!isBillingEnabled()) {
    res.status(503).json({ received: false });
    return;
  }
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    res.status(400).json({ received: false, error: 'missing signature' });
    return;
  }
  let event;
  try {
    event = constructWebhookEvent(req.body as Buffer, signature);
  } catch (err) {
    logger.warn({ err: String(err) }, '[billingRoutes] webhook 签名校验失败');
    res.status(400).json({ received: false, error: 'invalid signature' });
    return;
  }

  // P2-4: 事件幂等去重——检查是否已处理过该 Stripe 事件
  try {
    const isNew = await isStripeEventNew(event.id);
    if (!isNew) {
      logger.info(
        { eventId: event.id, type: event.type },
        '[billingRoutes] Stripe event already processed, skipping',
      );
      res.json({ received: true });
      return;
    }
  } catch (err) {
    logger.warn(
      { err: String(err), eventId: event.id },
      '[billingRoutes] Event dedup check failed, processing anyway',
    );
  }

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    logger.error({ err: String(err), eventType: event.type }, '[billingRoutes] webhook 处理失败');
    // P2-4: 处理失败时删除去重键，否则 Stripe 重试会被当作已处理而吞掉
    await appRedis.del(`${STRIPE_EVENT_KEY_PREFIX}${event.id}`).catch(() => {});
    res.status(500).json({ received: false });
    return;
  }
  res.json({ received: true });
}

export default router;
