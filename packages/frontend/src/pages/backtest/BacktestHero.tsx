import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, ChevronDown } from '@/icons/icons.js';
import { Settings, Rocket, ChevronUp, ArrowRight, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/uiComponents';
import { Card } from '@/components/ui/uiComponents';
import { CONTAINER_WIDTHS, CARD_GRID_CLASSES } from '@/lib/layout-widths';
import { cn } from '@/lib/utils';
const HERO_STORAGE_KEY = 'backtest-hero-visit-count';
const RESEARCH_TOOLS = [
  { key: 'mc', path: '/monte-carlo' },
  { key: 'opt', path: '/optimizer' },
  { key: 'ef', path: '/efficient-frontier' },
  { key: 'fr', path: '/factor-regression' },
  { key: 'pca', path: '/pca' },
  { key: 'letf', path: '/letf-slippage' },
] as const;
function HeroDetails() {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-body text-fg-tertiary max-w-[860px] mb-8 leading-relaxed">
        {t('backtest.hero.description')}
      </p>
      {/* 三栏能力展示 */}
      <div className={CARD_GRID_CLASSES.hero}>
        {/* 可建模内容 */}
        <CapabilityCard
          icon={Settings}
          title={t('backtest.hero.model.title')}
          items={t('backtest.hero.model.items', { returnObjects: true }) as string[]}
          linkLabel={t('backtest.hero.model.link')}
          linkTo="#parameters"
        />
        {/* 可查看指标 */}
        <CapabilityCard
          icon={BarChart3}
          title={t('backtest.hero.inspect.title')}
          items={t('backtest.hero.inspect.items', { returnObjects: true }) as string[]}
          linkLabel={t('backtest.hero.inspect.link')}
          linkTo="#results"
          subtitle="60+"
        />
        {/* 相关研究工具 */}
        <CapabilityCard
          icon={Rocket}
          title={t('backtest.hero.tools.title')}
          tools={RESEARCH_TOOLS.map((tool) => ({
            label: t(`backtest.hero.tools.${tool.key}`),
            path: tool.path,
          }))}
        />
      </div>
      {/* 合成标的推广横条 */}
      <div
        className="mt-6 p-4 bg-brand-subtle/6 border border-brand/20 rounded-lg flex items-center gap-4"
        data-testid="synthetic-promo"
      >
        <div className="flex-shrink-0 p-2 bg-brand-subtle/10 rounded-lg">
          <FlaskConical className="h-5 w-5 text-brand" />
        </div>
        <div className="flex-1">
          <div className="text-body font-medium text-fg">{t('hero.syntheticPromo.title')}</div>
          <div className="text-caption text-fg-secondary mt-0.5">
            {t('hero.syntheticPromo.description')}
          </div>
        </div>
        <Link
          to="/data-engine#synthetic"
          className="text-caption text-brand hover:underline flex items-center gap-1"
        >
          {t('hero.syntheticPromo.cta')} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </>
  );
}
export const BacktestHero = memo(function BacktestHero() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(() => {
    try {
      return parseInt(localStorage.getItem(HERO_STORAGE_KEY) ?? '0') < 3;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      const count = parseInt(localStorage.getItem(HERO_STORAGE_KEY) ?? '0');
      localStorage.setItem(HERO_STORAGE_KEY, String(count + 1));
    } catch {
      // 存储不可用时跳过访问计数
    }
  }, []);
  return (
    <section className={cn(CONTAINER_WIDTHS.page, 'pt-4 pb-6')} data-testid="page-hero">
      {/* 标题行 - 始终显示 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-display md:text-display-xl text-fg mb-3" data-testid="page-title">
            {t('backtest.hero.title')}
          </h1>
          <p className="text-h2 text-fg-secondary font-normal max-w-[720px]">
            {t('backtest.hero.subtitle')}
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
              {t('backtest.hero.collapse')} <ChevronUp className="h-4 w-4 ml-1" />
            </>
          ) : (
            <>
              {t('backtest.hero.expand')} <ChevronDown className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
      {/* 可折叠详情 */}
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
              <span className="text-success mt-0.5">&#10003;</span>
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
