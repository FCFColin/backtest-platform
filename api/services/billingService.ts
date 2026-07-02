/**
 * Stripe 计费服务（ADR-036）
 *
 * 企业理由：SaaS 变现的核心——把组织（租户）映射到 Stripe customer/subscription，
 * 通过 Checkout 完成订阅购买、通过 Billing Portal 自助管理，并以 webhook 把订阅状态
 * 权威同步回本地 organizations.plan/status 与 subscriptions 表。
 *
 * 设计要点：
 * - Stripe 客户端懒初始化；未配置 STRIPE_SECRET_KEY 时返回 null，路由层据此回 503。
 * - webhook 必须用原始请求体做签名校验（路由层用 express.raw 在全局 json 之前挂载）。
 * - 计划与 Stripe Price 的映射由 STRIPE_PRICE_* 配置驱动，便于多环境切换。
 */
import Stripe from 'stripe';
import { config } from '../config/index.js';
import { getPool } from '../db/index.js';
import { logger } from '../utils/logger.js';

/** 可购买的付费计划 */
export type BillablePlan = 'pro' | 'enterprise';

let stripe: Stripe | null = null;

/**
 * 懒初始化 Stripe 客户端。
 *
 * @returns Stripe 实例；未配置密钥时返回 null
 */
export function getStripe(): Stripe | null {
  if (!config.STRIPE_SECRET_KEY) return null;
  if (stripe) return stripe;
  stripe = new Stripe(config.STRIPE_SECRET_KEY);
  return stripe;
}

/** 计费是否已启用（密钥已配置） */
export function isBillingEnabled(): boolean {
  return Boolean(config.STRIPE_SECRET_KEY);
}

/**
 * 把计划名映射到对应的 Stripe Price ID。
 *
 * @param plan - 付费计划
 * @returns Stripe Price ID；未配置时返回空串
 */
export function priceIdForPlan(plan: BillablePlan): string {
  return plan === 'pro' ? config.STRIPE_PRICE_PRO : config.STRIPE_PRICE_ENTERPRISE;
}

/**
 * 反查 Stripe Price ID 对应的计划（webhook 同步用）。
 *
 * @param priceId - Stripe Price ID
 * @returns 计划名；未匹配时返回 'free'
 */
export function planForPriceId(priceId: string | null | undefined): 'free' | BillablePlan {
  if (priceId && priceId === config.STRIPE_PRICE_PRO) return 'pro';
  if (priceId && priceId === config.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return 'free';
}

/**
 * 获取或创建组织对应的 Stripe customer，并持久化映射。
 *
 * @param orgId - 组织 UUID
 * @param email - 计费联系邮箱（可空）
 * @returns Stripe customer ID
 * @throws 当 Stripe 未启用时抛出
 */
export async function ensureCustomer(orgId: string, email?: string | null): Promise<string> {
  const s = getStripe();
  if (!s) throw new Error('billing_disabled');
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT stripe_customer_id FROM stripe_customers WHERE org_id = $1',
    [orgId],
  );
  if (rows.length > 0) return rows[0].stripe_customer_id as string;

  const orgRow = await pool.query('SELECT name FROM organizations WHERE id = $1', [orgId]);
  const customer = await s.customers.create({
    email: email ?? undefined,
    name: orgRow.rows[0]?.name ?? undefined,
    metadata: { org_id: orgId },
  });
  await pool.query(
    `INSERT INTO stripe_customers (org_id, stripe_customer_id) VALUES ($1, $2)
     ON CONFLICT (org_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = NOW()`,
    [orgId, customer.id],
  );
  return customer.id;
}

/**
 * 创建订阅 Checkout 会话。
 *
 * @param input - orgId/plan/email/successUrl/cancelUrl
 * @returns Checkout 会话的跳转 URL
 * @throws 当 Stripe 未启用或价格未配置时抛出
 */
export async function createCheckoutSession(input: {
  orgId: string;
  plan: BillablePlan;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const s = getStripe();
  if (!s) throw new Error('billing_disabled');
  const price = priceIdForPlan(input.plan);
  if (!price) throw new Error('price_not_configured');
  const customerId = await ensureCustomer(input.orgId, input.email);
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { org_id: input.orgId, plan: input.plan },
    subscription_data: { metadata: { org_id: input.orgId } },
  });
  if (!session.url) throw new Error('checkout_session_no_url');
  return session.url;
}

/**
 * 创建 Billing Portal 会话（自助管理/取消订阅）。
 *
 * @param orgId - 组织 UUID
 * @param returnUrl - 用户从 Portal 返回的地址
 * @returns Portal 会话 URL
 * @throws 当 Stripe 未启用或组织无客户记录时抛出
 */
export async function createPortalSession(orgId: string, returnUrl: string): Promise<string> {
  const s = getStripe();
  if (!s) throw new Error('billing_disabled');
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT stripe_customer_id FROM stripe_customers WHERE org_id = $1',
    [orgId],
  );
  if (rows.length === 0) throw new Error('no_customer');
  const session = await s.billingPortal.sessions.create({
    customer: rows[0].stripe_customer_id as string,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * 校验 webhook 签名并解析事件。
 *
 * @param rawBody - 原始请求体（Buffer）
 * @param signature - Stripe-Signature 头
 * @returns 解析后的事件
 * @throws 签名校验失败时抛出
 */
export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const s = getStripe();
  if (!s) throw new Error('billing_disabled');
  if (!config.STRIPE_WEBHOOK_SECRET) throw new Error('webhook_secret_not_configured');
  return s.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
}

/** 按 Stripe customer 反查组织 ID */
async function orgIdForCustomer(customerId: string): Promise<string | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT org_id FROM stripe_customers WHERE stripe_customer_id = $1',
    [customerId],
  );
  return rows.length > 0 ? (rows[0].org_id as string) : null;
}

/** 把订阅状态映射到 organizations.status（active/suspended/canceled） */
function orgStatusFromSub(subStatus: string): 'active' | 'suspended' | 'canceled' {
  if (subStatus === 'active' || subStatus === 'trialing') return 'active';
  if (subStatus === 'canceled' || subStatus === 'incomplete_expired') return 'canceled';
  return 'suspended';
}

/**
 * upsert 本地订阅记录并同步 organizations.plan/status。
 *
 * @param orgId - 组织 UUID
 * @param sub - Stripe 订阅对象
 */
async function syncSubscription(orgId: string, sub: Stripe.Subscription): Promise<void> {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = planForPriceId(priceId);
  const periodEnd = sub.items.data[0]?.current_period_end ?? null;
  const pool = getPool();
  await pool.query(
    `INSERT INTO subscriptions (org_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       plan = EXCLUDED.plan, status = EXCLUDED.status,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end, updated_at = NOW()`,
    [
      orgId,
      sub.id,
      plan,
      sub.status,
      periodEnd ? new Date(periodEnd * 1000) : null,
      sub.cancel_at_period_end ?? false,
    ],
  );
  const orgStatus = orgStatusFromSub(sub.status);
  // 订阅终止时计划回落 free
  const effectivePlan = orgStatus === 'canceled' ? 'free' : plan;
  await pool.query(
    'UPDATE organizations SET plan = $2, status = $3, updated_at = NOW() WHERE id = $1',
    [orgId, effectivePlan, orgStatus],
  );
  logger.info(
    { orgId, plan: effectivePlan, status: orgStatus, subStatus: sub.status },
    '[billingService] 订阅已同步',
  );
}

/**
 * 处理 Stripe webhook 事件（订阅生命周期 -> 本地同步）。
 *
 * @param event - 已校验的 Stripe 事件
 */
/** 处理 checkout.session.completed 事件 */
async function handleCheckoutCompleted(s: Stripe, event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId =
    (session.metadata?.org_id as string | undefined) ??
    (typeof session.customer === 'string' ? await orgIdForCustomer(session.customer) : null);
  if (!orgId || !session.subscription) return;
  const subId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  const sub = await s.subscriptions.retrieve(subId);
  await syncSubscription(orgId, sub);
}

/** 处理 customer.subscription.* 事件 */
async function handleSubscriptionEvent(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const orgId =
    (sub.metadata?.org_id as string | undefined) ?? (await orgIdForCustomer(customerId));
  if (!orgId) {
    logger.warn({ customerId, eventType: event.type }, '[billingService] 找不到订阅对应的组织');
    return;
  }
  await syncSubscription(orgId, sub);
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  const s = getStripe();
  if (!s) return;

  const SUBSCRIPTION_EVENTS = new Set([
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ]);

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(s, event);
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    await handleSubscriptionEvent(event);
  } else {
    logger.debug({ eventType: event.type }, '[billingService] 忽略未处理的 webhook 事件');
  }
}

/**
 * 查询组织当前订阅摘要（供前端展示）。
 *
 * @param orgId - 组织 UUID
 */
export async function getSubscriptionSummary(orgId: string): Promise<{
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT plan, status, current_period_end, cancel_at_period_end
       FROM subscriptions WHERE org_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [orgId],
  );
  if (rows.length === 0) return null;
  return {
    plan: rows[0].plan,
    status: rows[0].status,
    currentPeriodEnd: rows[0].current_period_end
      ? new Date(rows[0].current_period_end).toISOString()
      : null,
    cancelAtPeriodEnd: rows[0].cancel_at_period_end,
  };
}
