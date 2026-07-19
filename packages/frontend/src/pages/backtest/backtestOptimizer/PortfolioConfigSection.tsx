/**
 * @file 组合配置 Section
 * @description 维护参与优化的标的列表与权重，支持增删行。属于参数面板的第一段。
 */
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ParamsSection } from '../../../components/ParamsPanel.js';
import type { OptimizerSectionProps } from './types.js';

export function PortfolioConfigSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.portfolioConfig')}
      info={t('backtest.optimizer.portfolioConfigInfo')}
    >
      <div
        className="portfolio-card"
        style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}
      >
        {s.assets.map((a, i) => (
          <div key={i} className="ticker-row" style={{ gap: 6 }}>
            <input
              type="text"
              value={a.ticker}
              onChange={(e) => s.updateAsset(i, 'ticker', e.target.value)}
              placeholder={t('backtest.optimizer.tickerPlaceholder')}
              className="ticker-input"
              style={{ flex: '1 1 0' }}
            />
            <div className="param-input-suffix-wrap" style={{ width: 90 }}>
              <input
                type="number"
                className="param-input param-input-with-suffix"
                value={a.weight}
                onChange={(e) => s.updateAsset(i, 'weight', e.target.value)}
                placeholder={t('backtest.optimizer.weightPlaceholder')}
                min={0}
                max={100}
              />
              <span className="param-input-suffix">%</span>
            </div>
            {s.assets.length > 1 && (
              <button
                onClick={() => s.removeAsset(i)}
                className="row-remove-btn"
                title={t('backtest.optimizer.delete')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button className="toolbar-btn" onClick={s.addAsset}>
          <Plus className="w-4 h-4" />
          {t('backtest.optimizer.addTicker')}
        </button>
      </div>
    </ParamsSection>
  );
}
