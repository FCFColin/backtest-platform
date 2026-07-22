/**
 * @file 定价页面
 * @description Free / Pro / Pro+ 三档定价对比，Pro 档高亮推荐
 * @route /pricing
 */
import { Check, X, Star, Zap, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import pricingData from './pricing/pricingData.json';

const PLAN_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Star,
  Zap,
  Crown,
};

/** 已知的静态符号值（非 i18n key），其余字符串均按 i18n key 解析 */
const STATIC_SYMBOLS = new Set(['—', '✓']);

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

/** 若值为已知静态符号则原样返回，否则按 i18n key 解析 */
function resolveCellValue(value: string, t: (key: string) => string): string {
  return STATIC_SYMBOLS.has(value) ? value : t(value);
}

export default function PricingPage() {
  const { t } = useTranslation();
  const plans = usePlans();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('account.pricing.title')}</h1>
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
          {t('account.pricing.intro')}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
            marginBottom: 24,
            alignItems: 'stretch',
          }}
        >
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
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('account.pricing.comparisonTitle')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-soft)' }}>
              <CompareTh
                text={t('account.pricing.compare.feature')}
                align="left"
                color="var(--text-muted)"
                weight={600}
              />
              <CompareTh text="Free" align="center" color="var(--text-muted)" weight={600} />
              <CompareTh text="Pro" align="center" color="var(--brand)" weight={700} />
              <CompareTh text="Pro+" align="center" color="var(--text-muted)" weight={600} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CompareRow
                key={r.featureKey}
                feature={t(r.featureKey)}
                free={resolveCellValue(r.free, t)}
                pro={resolveCellValue(r.pro, t)}
                proPlus={resolveCellValue(r.proPlus, t)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareTh({
  text,
  align,
  color,
  weight,
}: {
  text: string;
  align: string;
  color: string;
  weight: number;
}) {
  return (
    <th
      style={{
        textAlign: align as React.CSSProperties['textAlign'],
        padding: '10px 12px',
        color,
        fontWeight: weight,
      }}
    >
      {text}
    </th>
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
      <strong style={{ color: 'var(--text-body)' }}>{t('account.pricing.noticeTitle')}</strong>
      {t('account.pricing.noticeBody')}
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const isRecommended = plan.recommended;
  return (
    <div
      style={{
        padding: 24,
        background: isRecommended ? 'var(--brand-soft)' : 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        border: isRecommended ? '2px solid var(--brand)' : '1px solid var(--border-soft)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isRecommended && <RecommendedBadge />}
      <PlanCardHeader plan={plan} isRecommended={isRecommended} />
      <PlanCardPrice plan={plan} isRecommended={isRecommended} />
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, minHeight: 32 }}>
        {plan.desc}
      </div>
      <PlanFeatures features={plan.features} />
      <PlanCtaButton plan={plan} isRecommended={isRecommended} />
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
        background: 'var(--brand)',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 12,
        whiteSpace: 'nowrap',
      }}
    >
      {t('account.pricing.recommended')}
    </div>
  );
}

function PlanCardHeader({ plan, isRecommended }: { plan: Plan; isRecommended?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        color: isRecommended ? 'var(--brand)' : 'var(--text-muted)',
      }}
    >
      {plan.icon}
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
        {plan.name}
      </span>
    </div>
  );
}

function PlanCardPrice({ plan, isRecommended }: { plan: Plan; isRecommended?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
      <span
        style={{
          fontSize: 32,
          fontWeight: 800,
          color: isRecommended ? 'var(--brand)' : 'var(--text-strong)',
        }}
      >
        {plan.price}
      </span>
      {plan.period && (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{plan.period}</span>
      )}
    </div>
  );
}

function PlanFeatures({ features }: { features: { text: string; included: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
      {features.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          {f.included ? (
            <Check className="w-4 h-4" style={{ color: 'var(--success)', flexShrink: 0 }} />
          ) : (
            <X
              className="w-4 h-4"
              style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }}
            />
          )}
          <span
            style={{
              color: f.included ? 'var(--text-body)' : 'var(--text-muted)',
              opacity: f.included ? 1 : 0.7,
            }}
          >
            {f.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlanCtaButton({ plan, isRecommended }: { plan: Plan; isRecommended?: boolean }) {
  return (
    <button
      style={{
        marginTop: 24,
        padding: '10px 16px',
        background: isRecommended ? 'var(--brand)' : 'transparent',
        color: isRecommended ? '#fff' : 'var(--brand)',
        border: isRecommended ? 'none' : '1px solid var(--brand)',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s',
      }}
    >
      {plan.cta}
    </button>
  );
}

function CompareRow({
  feature,
  free,
  pro,
  proPlus,
}: {
  feature: string;
  free: string;
  pro: string;
  proPlus: string;
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <td style={{ padding: '10px 12px', color: 'var(--text-body)', fontWeight: 500 }}>
        {feature}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
        {free}
      </td>
      <td
        style={{
          padding: '10px 12px',
          textAlign: 'center',
          color: 'var(--brand)',
          fontWeight: 600,
        }}
      >
        {pro}
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-body)' }}>
        {proPlus}
      </td>
    </tr>
  );
}
