import Stripe from 'stripe';
import { config } from '../../config/index.js';
import { getPool, withTenant } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';

type BillablePlan = 'pro' | 'enterprise';

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!config.STRIPE_SECRET_KEY) return null;
  if (stripe) return stripe;
  stripe = new Stripe(config.STRIPE_SECRET_KEY);
  return stripe;
}

export function isBillingEnabled(): boolean {
  return Boolean(config.STRIPE_SECRET_KEY);
}

export function priceIdForPlan(plan: BillablePlan): string {
  return plan === 'pro' ? config.STRIPE_PRICE_PRO : config.STRIPE_PRICE_ENTERPRISE;
}

export function planForPriceId(priceId: string | null | undefined): 'free' | BillablePlan {
  if (priceId && priceId === config.STRIPE_PRICE_PRO) return 'pro';
  if (priceId && priceId === config.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return 'free';
}

export async function ensureCustomer(orgId: string, email?: string | null): Promise<string> {
  const s = getStripe();
  if (!s) throw new Error('billing_disabled');
  const existing = await withTenant(orgId, (client) =>
    client.query('SELECT stripe_customer_id FROM stripe_customers WHERE org_id = $1', [orgId]),
  );
  if (existing.rows.length > 0) return existing.rows[0].stripe_customer_id as string;
  const orgRow = await withTenant(orgId, (client) =>
    client.query('SELECT name FROM organizations WHERE id = $1', [orgId]),
  );
  const customer = await s.customers.create({
    email: email ?? undefined,
    name: orgRow.rows[0]?.name ?? undefined,
    metadata: { org_id: orgId },
  });
  await withTenant(orgId, (client) =>
    client.query(
      `INSERT INTO stripe_customers (org_id, stripe_customer_id) VALUES ($1, $2) ON CONFLICT (org_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = NOW()`,
      [orgId, customer.id],
    ),
  );
  return customer.id;
}

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
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer: await ensureCustomer(input.orgId, input.email),
    line_items: [{ price, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { org_id: input.orgId, plan: input.plan },
    subscription_data: { metadata: { org_id: input.orgId } },
  });
  if (!session.url) throw new Error('checkout_session_no_url');
  return session.url;
}

export async function createPortalSession(orgId: string, returnUrl: string): Promise<string> {
  const s = getStripe();
  if (!s) throw new Error('billing_disabled');
  const { rows } = await withTenant(orgId, (client) =>
    client.query('SELECT stripe_customer_id FROM stripe_customers WHERE org_id = $1', [orgId]),
  );
  if (rows.length === 0) throw new Error('no_customer');
  const session = await s.billingPortal.sessions.create({
    customer: rows[0].stripe_customer_id as string,
    return_url: returnUrl,
  });
  return session.url;
}

export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const s = getStripe();
  if (!s) throw new Error('billing_disabled');
  if (!config.STRIPE_WEBHOOK_SECRET) throw new Error('webhook_secret_not_configured');
  return s.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
}

async function orgIdForCustomer(customerId: string): Promise<string | null> {
  const { rows } = await getPool().query(
    'SELECT org_id FROM stripe_customers WHERE stripe_customer_id = $1',
    [customerId],
  );
  return rows.length > 0 ? (rows[0].org_id as string) : null;
}

function orgStatusFromSub(subStatus: string): 'active' | 'suspended' | 'canceled' {
  if (subStatus === 'active' || subStatus === 'trialing') return 'active';
  if (subStatus === 'canceled' || subStatus === 'incomplete_expired') return 'canceled';
  return 'suspended';
}

async function syncSubscription(orgId: string, sub: Stripe.Subscription): Promise<void> {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = planForPriceId(priceId);
  const periodEnd = sub.current_period_end ?? null;
  const orgStatus = orgStatusFromSub(sub.status);
  const effectivePlan = orgStatus === 'canceled' ? 'free' : plan;
  await withTenant(orgId, async (client) => {
    await client.query(
      `INSERT INTO subscriptions (org_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (stripe_subscription_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end, updated_at = NOW()`,
      [
        orgId,
        sub.id,
        plan,
        sub.status,
        periodEnd ? new Date(periodEnd * 1000) : null,
        sub.cancel_at_period_end ?? false,
      ],
    );
    await client.query(
      'UPDATE organizations SET plan = $2, status = $3, updated_at = NOW() WHERE id = $1',
      [orgId, effectivePlan, orgStatus],
    );
  });
  logger.info(
    { orgId, plan: effectivePlan, status: orgStatus, subStatus: sub.status },
    '[billingService] 订阅已同步',
  );
}

async function handleCheckoutCompleted(s: Stripe, event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId =
    (session.metadata?.org_id as string | undefined) ??
    (typeof session.customer === 'string' ? await orgIdForCustomer(session.customer) : null);
  if (!orgId || !session.subscription) return;
  const subId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  await syncSubscription(orgId, await s.subscriptions.retrieve(subId));
}

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

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  const s = getStripe();
  if (!s) return;
  if (event.type === 'checkout.session.completed') await handleCheckoutCompleted(s, event);
  else if (SUBSCRIPTION_EVENTS.has(event.type)) await handleSubscriptionEvent(event);
  else logger.debug({ eventType: event.type }, '[billingService] 忽略未处理的 webhook 事件');
}

export async function getSubscriptionSummary(orgId: string): Promise<{
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  const { rows } = await withTenant(orgId, (client) =>
    client.query(
      `SELECT plan, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE org_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [orgId],
    ),
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
