import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Loader2, ExternalLink, Check } from 'lucide-react';
import { StandardPageShell } from '../../components/shells/index.js';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/utils/apiClient';
import { useAuthStore } from '@/store/authStore';
import { ErrorBanner } from '@/components/stateDisplay';
interface SubscriptionSummary {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}
interface BillingState {
  enabled: boolean;
  publishableKey: string | null;
  subscription: SubscriptionSummary | null;
}
interface PlanDef {
  id: 'pro' | 'enterprise';
  name: string;
  price: string;
  features: string[];
}
const usePlans = (): PlanDef[] => {
  const { t } = useTranslation();
  return [
    {
      id: 'pro',
      name: 'Pro',
      price: t('account.billing.plans.pro.price'),
      features: [
        t('account.billing.plans.pro.feature1'),
        t('account.billing.plans.pro.feature2'),
        t('account.billing.plans.pro.feature3'),
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: t('account.billing.plans.enterprise.price'),
      features: [
        t('account.billing.plans.enterprise.feature1'),
        t('account.billing.plans.enterprise.feature2'),
        t('account.billing.plans.enterprise.feature3'),
      ],
    },
  ];
};
// eslint-disable-next-line max-lines-per-function -- 套餐卡片渲染含价格/特性/按钮多区块，内聚保留
function PlanCard({
  plan,
  active,
  isAdmin,
  busy,
  onCheckout,
}: {
  plan: PlanDef;
  active: boolean;
  isAdmin: boolean;
  busy: boolean;
  onCheckout: (plan: 'pro' | 'enterprise') => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="card"
      style={{
        padding: 18,
        border: active ? '2px solid var(--brand)' : '1px solid var(--border, #e5e7eb)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
          {plan.name}
        </h3>
        {active && (
          <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>
            {t('account.billing.current')}
          </span>
        )}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0' }}>
        {plan.price}
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '0 0 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {plan.features.map((f) => (
          <li
            key={f}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'var(--text-body)',
            }}
          >
            <Check className="w-3.5 h-3.5" style={{ color: 'var(--success, #16a34a)' }} /> {f}
          </li>
        ))}
      </ul>
      {isAdmin && !active && (
        <button
          onClick={() => void onCheckout(plan.id)}
          disabled={busy}
          className="main-action-btn"
          style={{
            width: '100%',
            height: 38,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{' '}
          {t('account.billing.upgradeTo', { name: plan.name })}
        </button>
      )}
    </div>
  );
}
// eslint-disable-next-line max-lines-per-function -- 账单主视图含订阅/发票/用量多区块，内聚保留
function BillingContent({
  state,
  loading,
  busy,
  error,
  isAdmin,
  currentPlan,
  onCheckout,
  onOpenPortal,
}: {
  state: BillingState | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  isAdmin: boolean;
  currentPlan: string;
  onCheckout: (plan: 'pro' | 'enterprise') => void;
  onOpenPortal: () => void;
}) {
  const { t } = useTranslation();
  const plans = usePlans();
  if (error) return <ErrorBanner message={error} style={{ marginBottom: 14 }} />;
  if (loading)
    return (
      <div style={{ padding: 30, textAlign: 'center' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} />
      </div>
    );
  if (state && !state.enabled)
    return (
      <div
        style={{
          padding: 16,
          background: 'var(--bg-subtle)',
          borderRadius: 10,
          fontSize: 14,
          color: 'var(--text-muted)',
        }}
      >
        {t('account.billing.disabledNotice')}
      </div>
    );
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {plans.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            active={currentPlan === p.id}
            isAdmin={isAdmin}
            busy={busy}
            onCheckout={onCheckout}
          />
        ))}
      </div>
      {isAdmin ? (
        <button
          onClick={() => void onOpenPortal()}
          disabled={busy}
          className="bg-input-bg text-fg border border-border-subtle rounded font-medium"
          style={{
            height: 38,
            padding: '0 16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <ExternalLink className="w-4 h-4" /> {t('account.billing.managePortal')}
        </button>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('account.billing.adminOnlyNotice')}
        </p>
      )}
    </>
  );
}
function useBillingState(isAuthed: boolean) {
  const { t } = useTranslation();
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/billing/subscription');
      if (res.ok) setState((await res.json())?.data ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (isAuthed) void load();
    else setLoading(false);
  }, [isAuthed, load]);
  /** POST 后重定向到返回的 URL，否则抛错 */
  const postRedirect = async (url: string, body: Record<string, unknown>, failKey: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (res.ok && payload?.data?.url) window.location.href = payload.data.url;
      else setError(payload?.detail || t(failKey));
    } finally {
      setBusy(false);
    }
  };
  const checkout = (plan: 'pro' | 'enterprise') =>
    postRedirect('/api/v1/billing/checkout', { plan }, 'account.billing.checkoutFailed');
  const openPortal = () =>
    postRedirect('/api/v1/billing/portal', {}, 'account.billing.portalFailed');
  return { state, loading, busy, error, checkout, openPortal };
}
export default function BillingPage() {
  const { t } = useTranslation();
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const org = useAuthStore((s) => s.org);
  const orgRole = useAuthStore((s) => s.user?.orgRole ?? null);
  const isAdmin = orgRole === 'owner' || orgRole === 'admin';
  const { state, loading, busy, error, checkout, openPortal } = useBillingState(isAuthed);
  if (!isAuthed) {
    return (
      <div className="bt-page" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div
          className="bt-main-card card"
          style={{ padding: 28, marginTop: 40, textAlign: 'center' }}
        >
          <p style={{ color: 'var(--text-muted)' }}>
            {t('account.billing.loginRequiredPrefix')}{' '}
            <Link to="/login" style={{ color: 'var(--brand)' }}>
              {t('account.billing.loginRequiredLink')}
            </Link>{' '}
            {t('account.billing.loginRequiredSuffix')}
          </p>
        </div>
      </div>
    );
  }
  const currentPlan = state?.subscription?.plan ?? org?.plan ?? 'free';
  const statusPrefix = state?.subscription?.status
    ? t('account.billing.statusPrefix', { status: state.subscription.status })
    : '';
  return (
    <StandardPageShell
      config={{
        titleKey: 'account.billing.title',
        headerExtra: <CreditCard className="w-5 h-5" style={{ color: 'var(--brand)' }} />,
      }}
    >
      <div className="bt-main-card card" style={{ padding: 24, marginTop: 28 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          {org
            ? t('account.billing.orgPrefix', { name: org.name })
            : t('account.billing.currentOrg')}
          {t('account.billing.currentPlanPrefix')}
          <strong style={{ textTransform: 'capitalize' }}>{currentPlan}</strong>
          {statusPrefix}
        </p>
        <BillingContent
          state={state}
          loading={loading}
          busy={busy}
          error={error}
          isAdmin={isAdmin}
          currentPlan={currentPlan}
          onCheckout={checkout}
          onOpenPortal={openPortal}
        />
      </div>
    </StandardPageShell>
  );
}
