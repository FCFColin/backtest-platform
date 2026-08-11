import { Check, X, Star, Zap, Crown } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  PLANS,
  COMPARISON_ROWS,
  planPrice,
  planPeriod,
  resolveCellValue,
  type PlanEntry,
  type ComparisonRowEntry,
} from '@/lib/pricing';
import { Button, Card } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';

const PLAN_ICONS: Record<string, ComponentType<{ className?: string }>> = { Star, Zap, Crown };
const HEAD_CLS = [
  'text-left font-semibold text-fg-tertiary',
  'text-center font-semibold text-fg-tertiary',
  'text-center font-bold text-brand',
  'text-center font-semibold text-fg-tertiary',
];
const CELL_CLS = [
  'text-left font-medium text-fg-secondary',
  'text-center text-fg-tertiary',
  'text-center font-semibold text-brand',
  'text-center text-fg-tertiary',
];
interface Plan {
  id: string;
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
  return (PLANS as PlanEntry[]).map((p) => {
    const Icon = PLAN_ICONS[p.iconName] ?? Star;
    return {
      id: p.id,
      name: p.name,
      icon: <Icon className="w-5 h-5" />,
      price: planPrice(p, t),
      period: planPeriod(p, t),
      desc: t(p.descKey),
      recommended: p.recommended,
      features: p.features.map((f) => ({ text: t(f.key), included: f.included })),
      cta: t(p.ctaKey),
    };
  });
}
export default function PricingPage() {
  const { t } = useTranslation();
  const plans = usePlans();
  return (
    <div className="page-container pt-0 pb-3 sm:pb-4">
      <div className="flex justify-between items-start px-1 mb-3">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-bold tracking-[-0.02em] text-fg leading-[1.15] m-0">
          {t('Pricing Plans')}
        </h1>
      </div>
      <Card className="p-6">
        <p className="mb-6 text-center text-body leading-[1.8] text-fg-secondary">
          {t('Choose the plan that suits you. All plans include core backtest features.')}
        </p>
        <div className="mb-6 grid items-stretch gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>
        <ComparisonTable />
        <PricingNotice />
      </Card>
    </div>
  );
}
function ComparisonTable() {
  const { t } = useTranslation();
  const rows = COMPARISON_ROWS as ComparisonRowEntry[];
  const ths = [t('Feature'), ...PLANS.map((p) => p.name)];
  return (
    <div className="mt-4">
      <div className="mb-3 text-h2">{t('Plan Comparison')}</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-label">
          <thead>
            <tr className="border-b-2 border-border-subtle">
              {ths.map((text, i) => (
                <th key={i} className={cn('px-3 py-2.5', HEAD_CLS[i])}>
                  {text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cells = [
                t(r.featureKey),
                resolveCellValue(r.free, t),
                resolveCellValue(r.pro, t),
                resolveCellValue(r.proPlus, t),
              ];
              return (
                <tr key={r.featureKey} className="border-b border-border-subtle">
                  {cells.map((v, i) => (
                    <td key={i} className={cn('px-3 py-2.5', CELL_CLS[i])}>
                      {v}
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
    <div className="mt-6 rounded-lg bg-hover p-4 text-caption leading-[1.7] text-fg-tertiary">
      <strong className="text-fg-secondary">{t('Notice:')}</strong>
      {t('Prices are for display only; the self-hosted version requires no payment.')}
    </div>
  );
}
function PlanCard({ plan }: { plan: Plan }) {
  const rec = plan.recommended;
  return (
    <div
      className={cn(
        'relative flex flex-col p-6',
        rec ? 'border-2 border-brand bg-brand/10' : 'border border-border-subtle bg-hover',
      )}
    >
      {rec && <RecommendedBadge />}
      <div className={cn('mb-2 flex items-center gap-2', rec ? 'text-brand' : 'text-fg-tertiary')}>
        {plan.icon}
        <span className="text-h2">{plan.name}</span>
      </div>
      <div className="mb-2 flex items-baseline gap-1">
        <span className={cn('text-display', rec ? 'text-brand' : 'text-fg')}>{plan.price}</span>
        {plan.period && <span className="text-label text-fg-tertiary">{plan.period}</span>}
      </div>
      <div className="mb-5 min-h-8 text-caption text-fg-tertiary">{plan.desc}</div>
      <div className="flex flex-1 flex-col gap-2.5">
        {plan.features.map((f, i) => {
          const Icon = f.included ? Check : X;
          return (
            <div key={i} className="flex items-center gap-2 text-label">
              <Icon
                className={cn(
                  'h-4 w-4 flex-shrink-0',
                  f.included ? 'text-success' : 'text-fg-tertiary opacity-50',
                )}
              />
              <span
                className={cn(f.included ? 'text-fg-secondary' : 'text-fg-tertiary opacity-70')}
              >
                {f.text}
              </span>
            </div>
          );
        })}
      </div>
      <PlanCta plan={plan} />
    </div>
  );
}
function PlanCta({ plan }: { plan: Plan }) {
  const isCurrent = plan.id === 'free';
  const isAuth = useAuthStore((s) => s.user !== null);
  const cls = cn(
    'mt-6 h-10 text-label font-semibold',
    !plan.recommended &&
      'border-brand bg-transparent text-brand hover:border-brand hover:bg-brand/10 hover:text-brand',
  );
  return (
    <Button
      asChild={!isCurrent}
      variant={plan.recommended ? 'primary' : 'secondary'}
      disabled={isCurrent}
      className={cls}
    >
      {isCurrent ? (
        plan.cta
      ) : (
        <Link to={isAuth ? '/billing' : '/signup'} className="no-underline hover:no-underline">
          {plan.cta}
        </Link>
      )}
    </Button>
  );
}
function RecommendedBadge() {
  const { t } = useTranslation();
  return (
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-3.5 py-1 text-label-tiny font-bold text-brand-fg">
      {t('Recommended')}
    </div>
  );
}
