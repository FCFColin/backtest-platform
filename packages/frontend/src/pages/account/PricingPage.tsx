import { Check, X, Star, Zap, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import pricingData from './pricing/pricingData.json';
const PLAN_ICONS: Record<string, ComponentType<{ className?: string }>> = { Star, Zap, Crown };
const STATIC_SYMBOLS = new Set(['-', '✓']);
interface PlanFeatureEntry {
  key: string;
  included: boolean;
}
interface PlanEntry {
  name: string;
  iconName: string;
  price?: string;
  priceKey?: string;
  period?: string;
  periodKey?: string;
  descKey: string;
  ctaKey: string;
  recommended?: boolean;
  features: PlanFeatureEntry[];
}
interface ComparisonRowEntry {
  featureKey: string;
  free: string;
  pro: string;
  proPlus: string;
}
interface Plan {
  name: string;
  icon: React.ReactNode;
  price: string;
  period: string;
  desc: string;
  recommended?: boolean;
  features: { text: string; included: boolean }[];
  cta: string;
}
function usePlans(): Plan[] {
  const { t } = useTranslation();
  return (pricingData.plans as PlanEntry[]).map((p) => {
    const Icon = PLAN_ICONS[p.iconName] ?? Star;
    return {
      name: p.name,
      icon: <Icon className="w-5 h-5" />,
      price: p.priceKey ? t(p.priceKey) : (p.price ?? ''),
      period: p.periodKey ? t(p.periodKey) : (p.period ?? ''),
      desc: t(p.descKey),
      recommended: p.recommended,
      features: p.features.map((f) => ({ text: t(f.key), included: f.included })),
      cta: t(p.ctaKey),
    };
  });
}
const resolveCellValue = (value: string, t: (key: string) => string) =>
  STATIC_SYMBOLS.has(value) ? value : t(value);
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
  marginBottom: 24,
  alignItems: 'stretch',
};
const thStyle = (align: string, color: string, weight: number): React.CSSProperties => ({
  textAlign: align as React.CSSProperties['textAlign'],
  padding: '10px 12px',
  color,
  fontWeight: weight,
});
export default function PricingPage() {
  const { t } = useTranslation();
  const plans = usePlans();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('Pricing Plans')}</h1>
      </div>
      <div className="bt-main-card card" style={{ padding: 24 }}>
        <div
          style={{
            fontSize: 14,
            color: 'var(--text-body)',
            lineHeight: 1.8,
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          {t('Choose the plan that suits you. All plans include core backtest features.')}
        </div>
        <div style={gridStyle}>
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>
        <ComparisonTable />
        <PricingNotice />
      </div>
    </div>
  );
}
function ComparisonTable() {
  const { t } = useTranslation();
  const rows = pricingData.comparisonRows as ComparisonRowEntry[];
  const ths: { text: string; align: string; color: string; weight: number }[] = [
    {
      text: t('Feature'),
      align: 'left',
      color: 'var(--text-muted)',
      weight: 600,
    },
    { text: 'Free', align: 'center', color: 'var(--text-muted)', weight: 600 },
    { text: 'Pro', align: 'center', color: 'var(--brand)', weight: 700 },
    { text: 'Pro+', align: 'center', color: 'var(--text-muted)', weight: 600 },
  ];
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('Plan Comparison')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-soft)' }}>
              {ths.map((th, i) => (
                <th key={i} style={thStyle(th.align, th.color, th.weight)}>
                  {th.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cells = [
                { v: t(r.featureKey), color: 'var(--text-body)', weight: 500, align: 'left' },
                {
                  v: resolveCellValue(r.free, t),
                  color: 'var(--text-muted)',
                  weight: 400,
                  align: 'center',
                },
                {
                  v: resolveCellValue(r.pro, t),
                  color: 'var(--brand)',
                  weight: 600,
                  align: 'center',
                },
                {
                  v: resolveCellValue(r.proPlus, t),
                  color: 'var(--text-body)',
                  weight: 400,
                  align: 'center',
                },
              ];
              return (
                <tr key={r.featureKey} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  {cells.map((c, i) => (
                    <td key={i} style={thStyle(c.align, c.color, c.weight)}>
                      {c.v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function PricingNotice() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        marginTop: 24,
        padding: 16,
        background: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        fontSize: 12,
        color: 'var(--text-muted)',
        lineHeight: 1.7,
      }}
    >
      <strong style={{ color: 'var(--text-body)' }}>{t('Notice:')}</strong>
      {t('Prices are for display only; the self-hosted version requires no payment.')}
    </div>
  );
}
function PlanCard({ plan }: { plan: Plan }) {
  const isRecommended = plan.recommended;
  const brandColor = 'hsl(var(--brand))';
  const ctaStyle: React.CSSProperties = {
    marginTop: 24,
    padding: '10px 16px',
    background: isRecommended ? brandColor : 'transparent',
    color: isRecommended ? '#fff' : brandColor,
    border: isRecommended ? 'none' : '1px solid var(--brand)',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  };
  return (
    <div
      style={{
        padding: 24,
        background: isRecommended ? 'var(--color-brand-soft)' : 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        border: isRecommended ? '2px solid var(--brand)' : '1px solid var(--border-soft)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isRecommended && <RecommendedBadge />}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          color: isRecommended ? brandColor : 'var(--text-muted)',
        }}
      >
        {plan.icon}
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
          {plan.name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: isRecommended ? brandColor : 'var(--text-strong)',
          }}
        >
          {plan.price}
        </span>
        {plan.period && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{plan.period}</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, minHeight: 32 }}>
        {plan.desc}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {plan.features.map((f, i) => {
          const Icon = f.included ? Check : X;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Icon
                className="w-4 h-4"
                style={{
                  color: f.included ? 'hsl(var(--success))' : 'var(--text-muted)',
                  opacity: f.included ? 1 : 0.5,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: f.included ? 'var(--text-body)' : 'var(--text-muted)',
                  opacity: f.included ? 1 : 0.7,
                }}
              >
                {f.text}
              </span>
            </div>
          );
        })}
      </div>
      <button style={ctaStyle}>{plan.cta}</button>
    </div>
  );
}
function RecommendedBadge() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        position: 'absolute',
        top: -12,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 14px',
        background: 'hsl(var(--brand))',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 12,
        whiteSpace: 'nowrap',
      }}
    >
      {t('Recommended')}
    </div>
  );
}
