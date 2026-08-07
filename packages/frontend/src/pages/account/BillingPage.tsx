import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CreditCard, Loader2, ExternalLink, Check } from 'lucide-react';
import { StandardPageShell } from '../../components/shells/index.js';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/utils/apiClient';
import { useAuthStore } from '@/store/authStore';
import { ErrorBanner } from '@/components/stateDisplay';
import { cn } from '@/lib/utils';

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
      price: t('$29/mo'),
      features: [
        t('Advanced backtest features'),
        t('Unlimited portfolios'),
        t('10 years of historical data'),
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: t('Contact Us'),
      features: [
        t('Unlimited portfolios and backtests'),
        t('API access (REST + WebSocket)'),
        t('24/7 priority support'),
      ],
    },
  ];
};

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
    <div className={cn('card p-[18px]', active ? 'border-2 border-brand' : 'border border-border')}>
      <div className="flex justify-between items-baseline">
        <h3 className="text-base font-bold text-fg-strong m-0">{plan.name}</h3>
        {active && <span className="text-[11px] text-brand font-semibold">{t('Current')}</span>}
      </div>
      <div className="text-lg font-bold text-fg-strong my-2">{plan.price}</div>
      <ul className="list-none p-0 m-0 mb-3.5 flex flex-col gap-1.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-1.5 text-[13px] text-fg">
            <Check className="w-3.5 h-3.5 text-success" /> {f}
          </li>
        ))}
      </ul>
      {isAdmin && !active && (
        <button
          onClick={() => void onCheckout(plan.id)}
          disabled={busy}
          className="main-action-btn w-full h-[38px] inline-flex items-center justify-center gap-1.5"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}{' '}
          {t('Upgrade to {{name}}', { name: plan.name })}
        </button>
      )}
    </div>
  );
}
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
      <div className="p-8 text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  if (state && !state.enabled)
    return (
      <div className="p-4 bg-surface-sunken rounded-[10px] text-sm text-fg-tertiary">
        {t('Subscription management is not enabled')}
      </div>
    );
  return (
    <>
      <div className="grid gap-4 mb-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
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
          className="bg-input-bg text-fg border border-border-subtle rounded font-medium h-[38px] px-4 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ExternalLink className="w-4 h-4" /> {t('Manage Subscription Portal')}
        </button>
      ) : (
        <p className="text-[13px] text-fg-tertiary">
          {t('Only administrators can manage subscriptions')}
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
      <div className="bt-page max-w-[720px] mx-auto">
        <div className="bt-main-card card p-7 mt-10 text-center">
          <p className="text-fg-tertiary">
            {t('Please')}{' '}
            <Link to="/login" className="text-brand">
              {t('Log In')}
            </Link>{' '}
            {t('to manage your subscription.')}
          </p>
        </div>
      </div>
    );
  }
  const currentPlan = state?.subscription?.plan ?? org?.plan ?? 'free';
  const statusPrefix = state?.subscription?.status
    ? t('Status: {{status}}', { status: state.subscription.status })
    : '';
  return (
    <StandardPageShell
      config={{
        titleKey: 'account.billing.title',
        headerExtra: <CreditCard className="w-5 h-5 text-brand" />,
      }}
    >
      <div className="bt-main-card card p-6 mt-7">
        <p className="text-[13px] text-fg-tertiary mb-4">
          {org ? t('Organization: {{name}}', { name: org.name }) : t('Current Organization')}
          {t('Current plan:')}
          <strong className="capitalize">{currentPlan}</strong>
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
