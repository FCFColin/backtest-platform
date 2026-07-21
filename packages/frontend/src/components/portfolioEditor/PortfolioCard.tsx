import { useTranslation } from 'react-i18next';
import { Copy, Download, Trash2 } from 'lucide-react';
import type { RebalanceFrequency, RebalanceBands, Portfolio } from '@backtest/shared';
import type { StorePortfolio, TFunc, BatchUpdate, AssetPatch } from './shared.js';
import { PortfolioToolbarAndAssets } from './PortfolioAssets.js';
import { GlidepathConfig } from './GlidepathComponents.js';

/** 卡片头部操作按钮 - hover 显示 */
function PortfolioCardActions({
  portfolio,
  onDuplicate,
  onRemove,
  onSave,
  t,
}: {
  portfolio: StorePortfolio;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onSave: (p: StorePortfolio) => void;
  t: TFunc;
}) {
  return (
    <div className="portfolio-card-actions">
      <button
        className="portfolio-card-action"
        title={t('portfolio.copyPortfolio')}
        onClick={() => onDuplicate(portfolio.id)}
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      <button
        className="portfolio-card-action"
        title={t('portfolio.saveAsJson')}
        onClick={() => onSave(portfolio)}
      >
        <Download className="w-3.5 h-3.5" />
      </button>
      <button
        className="portfolio-card-action portfolio-card-action-danger"
        title={t('common.delete')}
        onClick={() => onRemove(portfolio.id)}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** 名称行（名称 + 调仓频率 + 偏移 + 阈值） */
function PortfolioNameRow({
  portfolio,
  idx,
  rebalanceOptions,
  onUpdate,
  t,
}: {
  portfolio: StorePortfolio;
  idx: number;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  t: TFunc;
}) {
  return (
    <div className="portfolio-card-name-row">
      <input
        type="text"
        value={portfolio.name || `${t('portfolio.portfolio')} ${idx + 1}`}
        className="portfolio-name-input"
        onChange={(e) => onUpdate(portfolio.id, { name: e.target.value })}
      />
      <select
        value={portfolio.rebalanceFrequency}
        className="portfolio-rebalance-select"
        onChange={(e) =>
          onUpdate(portfolio.id, { rebalanceFrequency: e.target.value as RebalanceFrequency })
        }
      >
        {rebalanceOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="offset-cell">
        <input
          type="number"
          value={portfolio.rebalanceOffset ?? 0}
          min={0}
          max={252}
          className="offset-input"
          title={t('portfolio.offsetTitle')}
          onChange={(e) => onUpdate(portfolio.id, { rebalanceOffset: Number(e.target.value) || 0 })}
        />
        <span className="offset-suffix">{t('portfolio.offset')}</span>
      </div>
      {portfolio.rebalanceFrequency === 'threshold' && (
        <div className="threshold-cell">
          <input
            type="number"
            value={portfolio.rebalanceThreshold ?? 5}
            min={1}
            max={50}
            className="threshold-input"
            onChange={(e) => onUpdate(portfolio.id, { rebalanceThreshold: Number(e.target.value) })}
          />
          <span className="threshold-suffix">%</span>
        </div>
      )}
    </div>
  );
}

/** 高级参数行（拖累 + 总回报 + 偏差带开关） */
function PortfolioAdvancedRow({
  portfolio,
  onUpdate,
  t,
}: {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  t: TFunc;
}) {
  return (
    <div className="portfolio-advanced-row">
      <div className="advanced-field">
        <label className="advanced-label">{t('portfolio.drag')}</label>
        <div className="advanced-input-wrap">
          <input
            type="number"
            value={portfolio.drag ?? 0}
            min={0}
            max={10}
            step={0.1}
            className="advanced-input"
            title={t('portfolio.dragTitle')}
            onChange={(e) => onUpdate(portfolio.id, { drag: Number(e.target.value) || 0 })}
          />
          <span className="advanced-suffix">%</span>
        </div>
      </div>
      <label className="param-check advanced-check">
        <input
          type="checkbox"
          checked={portfolio.totalReturn ?? true}
          onChange={(e) => onUpdate(portfolio.id, { totalReturn: e.target.checked })}
        />
        <span>{t('portfolio.totalReturn')}</span>
      </label>
      <label className="param-check advanced-check">
        <input
          type="checkbox"
          checked={portfolio.rebalanceBands?.enabled ?? false}
          onChange={(e) =>
            onUpdate(portfolio.id, {
              rebalanceBands: {
                enabled: e.target.checked,
                absoluteBand: portfolio.rebalanceBands?.absoluteBand,
                relativeBand: portfolio.rebalanceBands?.relativeBand,
              } as RebalanceBands,
            })
          }
        />
        <span>{t('portfolio.deviationBands')}</span>
      </label>
    </div>
  );
}

/** Rebalance Bands 参数行 */
function RebalanceBandsRow({
  portfolio,
  onUpdate,
}: {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}) {
  const { t } = useTranslation();
  if (!portfolio.rebalanceBands?.enabled) return null;
  const bands = portfolio.rebalanceBands;
  return (
    <div className="portfolio-advanced-row" style={{ marginTop: '4px' }}>
      <div className="advanced-field">
        <label className="advanced-label">{t('portfolio.absoluteDeviation')}</label>
        <div className="advanced-input-wrap">
          <input
            type="number"
            value={bands.absoluteBand ?? 5}
            min={0.1}
            max={50}
            step={0.5}
            className="advanced-input"
            title={t('portfolio.absoluteDeviationTitle')}
            onChange={(e) =>
              onUpdate(portfolio.id, {
                rebalanceBands: {
                  enabled: true,
                  absoluteBand: Number(e.target.value) || undefined,
                  relativeBand: bands.relativeBand,
                },
              })
            }
          />
          <span className="advanced-suffix">%</span>
        </div>
      </div>
      <div className="advanced-field">
        <label className="advanced-label">{t('portfolio.relativeDeviation')}</label>
        <div className="advanced-input-wrap">
          <input
            type="number"
            value={bands.relativeBand ?? 20}
            min={1}
            max={100}
            step={1}
            className="advanced-input"
            title={t('portfolio.relativeDeviationTitle')}
            onChange={(e) =>
              onUpdate(portfolio.id, {
                rebalanceBands: {
                  enabled: true,
                  absoluteBand: bands.absoluteBand,
                  relativeBand: Number(e.target.value) || undefined,
                },
              })
            }
          />
          <span className="advanced-suffix">%</span>
        </div>
      </div>
    </div>
  );
}

/** 组合卡片（单个组合的完整编辑界面） */
export function PortfolioCard({
  portfolio,
  idx,
  rebalanceOptions,
  nonGlidepathPortfolios,
  onDuplicate,
  onRemove,
  onSave,
  onUpdate,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
  onBatchUpdate,
}: {
  portfolio: StorePortfolio;
  idx: number;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  nonGlidepathPortfolios: StorePortfolio[];
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onSave: (p: StorePortfolio) => void;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  onAddAsset: (id: string) => void;
  onRemoveAsset: (id: string, ticker: string) => void;
  onUpdateAsset: (portfolioId: string, assetIdx: number, patch: AssetPatch) => void;
  onBatchUpdate: BatchUpdate;
}) {
  const { t } = useTranslation();
  const tw = portfolio.assets.reduce((sum, a) => sum + a.weight, 0);
  const isComplete = Math.abs(tw - 100) <= 0.01;
  const isGp = portfolio.isGlidepath;
  const cardStyle = isGp
    ? { borderLeft: '3px solid var(--accent)', backgroundColor: 'var(--bg-subtle)' }
    : undefined;

  return (
    <div className="portfolio-card" style={cardStyle}>
      {isGp && (
        <GlidepathConfig
          portfolio={portfolio}
          nonGlidepathPortfolios={nonGlidepathPortfolios}
          onUpdate={onUpdate}
        />
      )}
      <PortfolioCardActions
        portfolio={portfolio}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onSave={onSave}
        t={t}
      />
      <PortfolioNameRow
        portfolio={portfolio}
        idx={idx}
        rebalanceOptions={rebalanceOptions}
        onUpdate={onUpdate}
        t={t}
      />
      <PortfolioAdvancedRow portfolio={portfolio} onUpdate={onUpdate} t={t} />
      <RebalanceBandsRow portfolio={portfolio} onUpdate={onUpdate} />
      <PortfolioToolbarAndAssets
        portfolio={portfolio}
        tw={tw}
        onAddAsset={onAddAsset}
        onRemoveAsset={onRemoveAsset}
        onUpdateAsset={onUpdateAsset}
        onBatchUpdate={onBatchUpdate}
      />
      <div className={`portfolio-total ${isComplete ? 'complete' : 'incomplete'}`}>
        <span>{t('portfolio.total')}</span>
        <span className="total-value">{tw.toFixed(0)}%</span>
      </div>
    </div>
  );
}
