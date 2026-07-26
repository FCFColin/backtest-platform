/**
 * @file 组合配置 Section
 * @description 维护参与优化的标的列表与权重，支持增删行。属于参数面板的第一段。
 *   基于 shadcn Input / Button + token 类名。
 */
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ParamsSection } from '../../../components/ParamsPanel.js';
import type { OptimizerSectionProps } from './types.js';

export function PortfolioConfigSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.portfolioConfig')}
      info={t('backtest.optimizer.portfolioConfigInfo')}
    >
      <div className="flex flex-col gap-2">
        {s.assets.map((a, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              type="text"
              value={a.ticker}
              onChange={(e) => s.updateAsset(i, 'ticker', e.target.value)}
              placeholder={t('backtest.optimizer.tickerPlaceholder')}
              className="flex-1"
            />
            <div className="flex items-center gap-1 w-[110px]">
              <Input
                type="number"
                className="font-mono tabular-nums"
                value={a.weight}
                onChange={(e) => s.updateAsset(i, 'weight', e.target.value)}
                placeholder={t('backtest.optimizer.weightPlaceholder')}
                min={0}
                max={100}
              />
              <span className="text-caption text-fg-tertiary shrink-0">%</span>
            </div>
            {s.assets.length > 1 && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => s.removeAsset(i)}
                title={t('backtest.optimizer.delete')}
                aria-label={t('backtest.optimizer.delete')}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2">
        <Button variant="ghost" size="sm" onClick={s.addAsset}>
          <Plus />
          {t('backtest.optimizer.addTicker')}
        </Button>
      </div>
    </ParamsSection>
  );
}
