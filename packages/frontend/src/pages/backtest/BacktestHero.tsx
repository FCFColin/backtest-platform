/**
 * @file 回测首页 Hero 区组件
 * @description P1-1 产品化改造：Hero 标语 + 三栏能力展示（建模/检验/洞察）+ 数据引擎推广区块。
 *   替代原先直接进入工具表单的冷启动体验，对标 testfol.io 首屏产品化。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, FlaskConical, Telescope, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** 三栏能力卡片 */
const CAPABILITY_CARDS = [
  {
    icon: LineChart,
    titleKey: 'home.hero.model',
    descKey: 'home.hero.modelDesc',
  },
  {
    icon: FlaskConical,
    titleKey: 'home.hero.test',
    descKey: 'home.hero.testDesc',
  },
  {
    icon: Telescope,
    titleKey: 'home.hero.inspect',
    descKey: 'home.hero.inspectDesc',
  },
] as const;

/**
 * 首页 Hero 区：标语 + CTA + 三栏能力卡片 + 数据引擎推广。
 * @returns Hero 区 JSX
 */
export const BacktestHero = memo(function BacktestHero() {
  const { t } = useTranslation();

  return (
    <section className="mb-8">
      {/* Hero 标语 */}
      <div className="mb-8 text-center">
        <h1 className="text-display text-fg">{t('home.hero.title')}</h1>
        <p className="mt-3 text-body text-fg-secondary">{t('home.hero.subtitle')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/backtest">
            <Button variant="primary" size="default">
              {t('home.hero.cta')}
            </Button>
          </Link>
          <Link to="/analysis">
            <Button variant="secondary" size="default">
              {t('home.hero.secondaryCta')}
            </Button>
          </Link>
        </div>
      </div>

      {/* 三栏能力展示 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CAPABILITY_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.titleKey} className="p-5">
              <Icon className="mb-3 size-6 text-brand" />
              <h3 className="text-h3 text-fg">{t(card.titleKey)}</h3>
              <p className="mt-2 text-caption text-fg-tertiary">{t(card.descKey)}</p>
            </Card>
          );
        })}
      </div>

      {/* 数据引擎推广区块 */}
      <Card className="mt-4 p-5">
        <div className="flex items-center gap-4">
          <Database className="size-8 text-brand" />
          <div className="flex-1">
            <h3 className="text-h3 text-fg">{t('home.hero.dataEngineTitle')}</h3>
            <p className="mt-1 text-caption text-fg-tertiary">{t('home.hero.dataEngineDesc')}</p>
          </div>
          <Link to="/data-engine">
            <Button variant="ghost" size="sm">
              {t('home.hero.dataEngineCta')}
            </Button>
          </Link>
        </div>
      </Card>
    </section>
  );
});
