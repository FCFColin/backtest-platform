import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, ExternalLink, Check } from 'lucide-react';
import { StandardPageShell } from '../../components/shells/index.js';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/utils/apiClient';
import { useOrgAuth } from '@/hooks/miscHooks';
import { LoginRequiredCard } from '@/components/auth/formFields';
import { ErrorBanner } from '@/components/stateDisplay';
import { cn } from '@/lib/utils';
import { BILLABLE_PLANS, planPrice, planPeriod } from '@/lib/pricing';
import { Button, Card } from '@/components/ui/uiComponents';

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
  return BILLABLE_PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    price: `${planPrice(p, t)}${planPeriod(p, t)}`,
    features: p.features.filter((f) => f.included).map((f) => t(f.key)),
  }));
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
    <Card className={cn('p-[18px]', active ? 'border-2 border-brand' : 'border border-border')}>
      <div className="flex justify-between items-baseline">
        <h3 className="text-base font-bold text-fg m-0">{plan.name}</h3>
        {active && <span className="text-label-tiny text-brand font-semibold">{t('Current')}</span>}
      </div>
      <div className="text-lg font-bold text-fg my-2">{plan.price}</div>
      <ul className="list-none p-0 m-0 mb-3.5 flex flex-col gap-1.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-1.5 text-label text-fg">
            <Check className="w-3.5 h-3.5 text-success" /> {f}
          </li>
        ))}
      </ul>
      {isAdmin && !active && (
        <Button
          type="button"
          variant="primary"
          className="w-full h-[38px]"
          onClick={() => void onCheckout(plan.id)}
          disabled={busy}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('Upgrade to {{name}}', { name: plan.name })}
        </Button>
      )}
    </Card>
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
        <Button
          type="button"
          variant="secondary"
          className="h-[38px] px-4"
          onClick={() => void onOpenPortal()}
          disabled={busy}
        >
          <ExternalLink className="w-4 h-4" /> {t('Manage Subscription Portal')}
        </Button>
      ) : (
        <p className="text-label text-fg-tertiary">
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
  const { isAuthed, org, isAdmin } = useOrgAuth();
  const { state, loading, busy, error, checkout, openPortal } = useBillingState(isAuthed);
  if (!isAuthed) return <LoginRequiredCard message={t('to manage your subscription.')} />;
  const currentPlan = state?.subscription?.plan ?? org?.plan ?? 'free';
  const statusPrefix = state?.subscription?.status
    ? t('Status: {{status}}', { status: state.subscription.status })
    : '';
  return (
    <StandardPageShell
      config={{
        titleKey: 'Billing',
        headerExtra: <CreditCard className="w-5 h-5 text-brand" />,
      }}
    >
      <Card className="p-6 mt-7">
        <p className="text-label text-fg-tertiary mb-4">
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
      </Card>
    </StandardPageShell>
  );
}
