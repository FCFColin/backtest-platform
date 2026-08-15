import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, ChevronDown, Check } from 'lucide-react';
import { Settings, Rocket, ChevronUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Card } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
const HERO_STORAGE_KEY = 'backtest-hero-expanded';
const RESEARCH_TOOLS = [
  { labelKey: 'nav.monteCarlo', path: '/monte-carlo' },
  { labelKey: 'nav.portfolioOptimize', path: '/optimizer' },
  { labelKey: 'nav.efficientFrontier', path: '/efficient-frontier' },
  { labelKey: 'nav.factorRegression', path: '/factor-regression' },
  { labelKey: 'nav.pca', path: '/pca' },
  { labelKey: 'nav.letfAnalysis', path: '/letf-slippage' },
] as const;
function HeroDetails() {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-body text-fg-tertiary max-w-[860px] mb-8 leading-relaxed">
        {t(
          'This platform is a portfolio backtesting tool supporting ETFs, stocks, funds, synthetic tickers, and custom sequences. Compare multiple portfolios over the same historical period, test rebalancing rules, and simulate cashflow contributions or withdrawals.',
        )}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CapabilityCard
          icon={Settings}
          title={t('What You Can Model')}
          items={t('backtest.hero.model.items', { returnObjects: true }) as string[]}
          linkLabel={t('Start Configuring')}
          linkTo="#parameters"
        />
        <CapabilityCard
          icon={BarChart3}
          title={t('Metrics You Can Inspect')}
          items={t('backtest.hero.inspect.items', { returnObjects: true }) as string[]}
          linkLabel={t('View Results')}
          linkTo="#results"
          subtitle="60+"
        />
        <CapabilityCard
          icon={Rocket}
          title={t('Related Research Tools')}
          tools={RESEARCH_TOOLS.map((tool) => ({
            label: t(tool.labelKey),
            path: tool.path,
          }))}
        />
      </div>
    </>
  );
}
export const BacktestHero = memo(function BacktestHero() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(HERO_STORAGE_KEY);
      return stored === null || stored === '1';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(HERO_STORAGE_KEY, expanded ? '1' : '0');
    } catch {
      /* localStorage not available */
    }
  }, [expanded]);
  return (
    <section className={cn('page-container', 'pt-4 pb-6')} data-testid="page-hero">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-display md:text-display-xl text-fg mb-3" data-testid="page-title">
            {t('nav.portfolioBacktest')}
          </h1>
          <p className="text-h2 text-fg-secondary font-normal max-w-[720px]">
            {t(
              'Professional tools for backtesting portfolios, asset allocations, and retirement cashflows',
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-caption text-fg-tertiary hover:text-fg"
        >
          {expanded ? (
            <>
              {t('Hide Intro')} <ChevronUp className="h-4 w-4 ml-1" />
            </>
          ) : (
            <>
              {t('Show Intro')} <ChevronDown className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
      {expanded && <HeroDetails />}
    </section>
  );
});
interface CapabilityCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items?: string[];
  tools?: Array<{ label: string; path: string }>;
  linkLabel?: string;
  linkTo?: string;
  subtitle?: string;
}
function CapabilityCard({
  icon: Icon,
  title,
  items,
  tools,
  linkLabel,
  linkTo,
  subtitle,
}: CapabilityCardProps) {
  return (
    <Card className="p-5 bg-surface border border-border-subtle hover:border-border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg cursor-default group">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-brand-subtle/8 rounded-lg group-hover:bg-brand-subtle/12 transition-colors">
          <Icon className="h-5 w-5 text-brand" />
        </div>
        <h3 className="text-h3">{title}</h3>
      </div>
      {Array.isArray(items) && (
        <ul className="space-y-2 mb-4">
          {items.map((item, i) => (
            <li key={i} className="text-body text-fg-secondary flex items-start gap-2">
              <Check className="size-3.5 text-success mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {tools && (
        <div className="flex flex-wrap gap-2 mb-4">
          {tools.map((tool) => (
            <Link
              key={tool.path}
              to={tool.path}
              className="text-caption px-2.5 py-1 bg-brand-subtle/8 text-brand rounded-md hover:bg-brand-subtle/15 transition-colors"
            >
              {tool.label}
            </Link>
          ))}
        </div>
      )}
      {subtitle && <p className="text-caption text-fg-tertiary mt-2">{subtitle}</p>}
      {linkLabel && linkTo && (
        <Link
          to={linkTo}
          className="text-caption text-brand hover:underline flex items-center gap-1"
        >
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </Card>
  );
}
