/**
 * 计费路由（Stripe，ADR-036）
 *
 * 挂载于 /api/v1/billing（jwtAuth + resolveTenant 前置）。本路由内部对写操作追加
 * requireTenant + requirePermission(ADMIN_ACCESS)。webhook 不在此 router 内——它需要
 * 原始请求体与免鉴权，由 app.ts 用 express.raw 在全局 json 之前单独挂载
 * （见 billingWebhookHandler）。
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { requireTenant } from '../middleware/tenantContext.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import {
  isBillingEnabled,
  createCheckoutSession,
  createPortalSession,
  getSubscriptionSummary,
  constructWebhookEvent,
  handleWebhookEvent,
} from '../services/billingService.js';

const router = Router();

const requireAdmin = requirePermission(Permission.ADMIN_ACCESS);

router.use(requireTenant);

/** GET /api/v1/billing/subscription - 当前组织订阅摘要（任意成员可见） */
router.get('/subscription', async (req: AuthenticatedRequest, res: Response) => {
  const summary = await getSubscriptionSummary(req.tenantId as string);
  res.json({
    success: true,
    data: {
      enabled: isBillingEnabled(),
      publishableKey: config.STRIPE_PUBLISHABLE_KEY || null,
      subscription: summary,
    },
  });
});

/** POST /api/v1/billing/checkout - 创建订阅 Checkout 会话（admin） */
const checkoutSchema = z.object({ plan: z.enum(['pro', 'enterprise']) });
router.post(
  '/checkout',
  requireAdmin,
  validate(checkoutSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!isBillingEnabled()) {
      sendProblem(res, 503, 'BILLING_DISABLED', 'Service Unavailable', {
        detail: '计费功能未启用',
      });
      return;
    }
    const { plan } = req.body as { plan: 'pro' | 'enterprise' };
    const base = config.APP_BASE_URL;
    try {
      const url = await createCheckoutSession({
        orgId: req.tenantId as string,
        plan,
        email: undefined,
        successUrl: `${base}/account?billing=success`,
        cancelUrl: `${base}/pricing?billing=cancel`,
      });
      res.json({ success: true, data: { url } });
    } catch (err) {
      const msg = String(err);
      if (msg.includes('price_not_configured')) {
        sendProblem(res, 503, 'PRICE_NOT_CONFIGURED', 'Service Unavailable', {
          detail: '该计划的价格未配置',
        });
        return;
      }
      logger.error({ err: msg, orgId: req.tenantId }, '[billingRoutes] 创建 Checkout 失败');
      sendProblem(res, 502, 'CHECKOUT_FAILED', 'Bad Gateway', { detail: '创建结算会话失败' });
    }
  },
);

/** POST /api/v1/billing/portal - 创建 Billing Portal 会话（admin） */
router.post('/portal', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (!isBillingEnabled()) {
    sendProblem(res, 503, 'BILLING_DISABLED', 'Service Unavailable', { detail: '计费功能未启用' });
    return;
  }
  try {
    const url = await createPortalSession(req.tenantId as string, `${config.APP_BASE_URL}/account`);
    res.json({ success: true, data: { url } });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('no_customer')) {
      sendProblem(res, 404, 'NO_CUSTOMER', 'Not Found', { detail: '该组织尚无计费账户，请先订阅' });
      return;
    }
    logger.error({ err: msg, orgId: req.tenantId }, '[billingRoutes] 创建 Portal 失败');
    sendProblem(res, 502, 'PORTAL_FAILED', 'Bad Gateway', { detail: '创建管理会话失败' });
  }
});

/**
 * Stripe webhook 处理器（免鉴权，需原始请求体）。
 *
 * 由 app.ts 用 `express.raw({ type: 'application/json' })` 在全局 express.json 之前挂载，
 * 以保证签名校验拿到未被解析的原始字节。
 *
 * @param req - 请求（req.body 为 Buffer）
 * @param res - 响应
 */
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
  try {
    await handleWebhookEvent(event);
  } catch (err) {
    logger.error({ err: String(err), eventType: event.type }, '[billingRoutes] webhook 处理失败');
    // 返回 500 让 Stripe 重试
    res.status(500).json({ received: false });
    return;
  }
  res.json({ received: true });
}

export default router;
