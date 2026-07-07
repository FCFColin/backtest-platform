/**
 * @file 计费页
 * @description 展示当前订阅状态，提供升级（Stripe Checkout 跳转）与管理（Billing Portal 跳转）。
 *              数据来源 /api/v1/billing/*，写操作要求 owner/admin。
 * @route /billing
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Loader2, ExternalLink, Check } from 'lucide-react';
import { apiFetch } from '@/utils/apiClient';
import { useAuthStore } from '@/store/authStore';

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

const PLANS: { id: 'pro' | 'enterprise'; name: string; price: string; features: string[] }[] = [
  {
    id: 'pro',
    name: 'Pro',
    price: '$29/月',
    features: ['更高回测配额', '异步并发提升', '邮件支持'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '联系销售',
    features: ['无限回测', '专属并发', '优先支持与 SLA'],
  },
];

interface PlanCardProps {
  plan: { id: 'pro' | 'enterprise'; name: string; price: string; features: string[] };
  active: boolean;
  isAdmin: boolean;
  busy: boolean;
  onCheckout: (plan: 'pro' | 'enterprise') => void;
}

function PlanCard({ plan, active, isAdmin, busy, onCheckout }: PlanCardProps) {
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
          <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>当前</span>
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
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 升级到 {plan.name}
        </button>
      )}
    </div>
  );
}

/** 计费内容区域 */
interface BillingContentProps {
  state: BillingState | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  isAdmin: boolean;
  currentPlan: string;
  onCheckout: (plan: 'pro' | 'enterprise') => void;
  onOpenPortal: () => void;
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
}: BillingContentProps) {
  if (error) return <BillingError error={error} />;
  if (loading) return <BillingLoading />;
  if (state && !state.enabled) return <BillingDisabled />;
  return (
    <>
      <PlansGrid currentPlan={currentPlan} isAdmin={isAdmin} busy={busy} onCheckout={onCheckout} />
      {isAdmin ? (
        <button
          onClick={() => void onOpenPortal()}
          disabled={busy}
          className="portfolio-rebalance-select"
          style={{
            height: 38,
            padding: '0 16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <ExternalLink className="w-4 h-4" /> 管理订阅 / 账单
        </button>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>仅组织管理员可变更订阅。</p>
      )}
    </>
  );
}

function BillingError({ error }: { error: string }) {
  return (
    <div
      style={{
        fontSize: 13,
        color: 'var(--danger, #dc2626)',
        padding: '8px 10px',
        background: 'var(--danger-soft, #fef2f2)',
        borderRadius: 8,
        marginBottom: 14,
      }}
    >
      {error}
    </div>
  );
}

function BillingLoading() {
  return (
    <div style={{ padding: 30, textAlign: 'center' }}>
      <Loader2 className="w-5 h-5 animate-spin" style={{ margin: '0 auto' }} />
    </div>
  );
}

function BillingDisabled() {
  return (
    <div
      style={{
        padding: '16px',
        background: 'var(--bg-subtle)',
        borderRadius: 10,
        fontSize: 14,
        color: 'var(--text-muted)',
      }}
    >
      计费功能尚未启用（管理员需配置 Stripe 密钥）。
    </div>
  );
}

function PlansGrid({
  currentPlan,
  isAdmin,
  busy,
  onCheckout,
}: {
  currentPlan: string;
  isAdmin: boolean;
  busy: boolean;
  onCheckout: (plan: 'pro' | 'enterprise') => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 20,
      }}
    >
      {PLANS.map((p) => (
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
  );
}

/** 计费状态管理 hook */
function useBillingState(isAuthed: boolean) {
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

  const checkout = async (plan: 'pro' | 'enterprise') => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (res.ok && body?.data?.url) window.location.href = body.data.url;
      else setError(body?.detail || '创建结算会话失败');
    } finally {
      setBusy(false);
    }
  };

  const openPortal = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/billing/portal', { method: 'POST' });
      const body = await res.json();
      if (res.ok && body?.data?.url) window.location.href = body.data.url;
      else setError(body?.detail || '打开管理页失败');
    } finally {
      setBusy(false);
    }
  };

  return { state, loading, busy, error, checkout, openPortal };
}

export default function BillingPage() {
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
            请先{' '}
            <Link to="/login" style={{ color: 'var(--brand)' }}>
              登录
            </Link>{' '}
            后查看计费信息。
          </p>
        </div>
      </div>
    );
  }

  const currentPlan = state?.subscription?.plan ?? org?.plan ?? 'free';

  return (
    <div className="bt-page" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="bt-main-card card" style={{ padding: 24, marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <CreditCard className="w-5 h-5" style={{ color: 'var(--brand)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
            订阅与计费
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          {org ? `组织：${org.name}` : '当前组织'} · 当前计划：
          <strong style={{ textTransform: 'capitalize' }}>{currentPlan}</strong>
          {state?.subscription?.status ? ` · 状态：${state.subscription.status}` : ''}
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
    </div>
  );
}
