import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import TickerInput from '../TickerInput.js';
import WeightInput from '../WeightInput.js';
import type { StorePortfolio, TFunc, AssetPatch, BatchUpdate } from './shared.js';

/** 均分权重 */
function handleEvenDistribute(portfolio: StorePortfolio, onBatchUpdate: BatchUpdate) {
  if (portfolio.assets.length === 0) return;
  const evenWeight = Math.floor(100 / portfolio.assets.length);
  onBatchUpdate(
    portfolio.id,
    portfolio.assets.map((_, i) => ({
      index: i,
      weight: i === 0 ? evenWeight + (100 - evenWeight * portfolio.assets.length) : evenWeight,
    })),
  );
}

/** 拉伸权重至 100% */
function handleStretchTo100(portfolio: StorePortfolio, tw: number, onBatchUpdate: BatchUpdate) {
  if (tw === 0) return;
  const rawWeights = portfolio.assets.map((a) => (a.weight / tw) * 100);
  const rounded = rawWeights.map((w) => Math.round(w * 100) / 100);
  const remainder = Math.round((100 - rounded.reduce((s, w) => s + w, 0)) * 100) / 100;
  rounded[0] = Math.round((rounded[0] + remainder) * 100) / 100;
  onBatchUpdate(
    portfolio.id,
    portfolio.assets.map((_, i) => ({ index: i, weight: rounded[i] })),
  );
}

/** Ticker 资产行 */
function TickerAssetRow({
  asset,
  assetIdx,
  portfolioId,
  onRemoveAsset,
  onUpdateAsset,
  t,
}: {
  asset: StorePortfolio['assets'][number];
  assetIdx: number;
  portfolioId: string;
  onRemoveAsset: (id: string, ticker: string) => void;
  onUpdateAsset: (portfolioId: string, assetIdx: number, patch: AssetPatch) => void;
  t: TFunc;
}) {
  return (
    <div key={asset.id ?? assetIdx} className="ticker-row">
      <TickerInput
        value={asset.ticker}
        placeholder={t('portfolio.tickerPlaceholder')}
        onChange={(newTicker) => onUpdateAsset(portfolioId, assetIdx, { ticker: newTicker })}
      />
      <div className="weight-cell">
        <WeightInput
          value={asset.weight}
          onChange={(num) => onUpdateAsset(portfolioId, assetIdx, { weight: num })}
        />
        <span className="weight-suffix">%</span>
      </div>
      <button
        onClick={() => onRemoveAsset(portfolioId, asset.ticker)}
        className="row-remove-btn"
        title={t('common.delete')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** 工具栏 + Ticker 行 */
export function PortfolioToolbarAndAssets({
  portfolio,
  tw,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
  onBatchUpdate,
}: {
  portfolio: StorePortfolio;
  tw: number;
  onAddAsset: (id: string) => void;
  onRemoveAsset: (id: string, ticker: string) => void;
  onUpdateAsset: (portfolioId: string, assetIdx: number, patch: AssetPatch) => void;
  onBatchUpdate: BatchUpdate;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="portfolio-card-toolbar">
        <button
          className="toolbar-btn"
          onClick={() => handleEvenDistribute(portfolio, onBatchUpdate)}
        >
          {t('portfolio.evenDistribute')}
        </button>
        <button
          className="toolbar-btn"
          onClick={() => handleStretchTo100(portfolio, tw, onBatchUpdate)}
        >
          {t('portfolio.stretchTo100')}
        </button>
        <button className="toolbar-btn" onClick={() => onAddAsset(portfolio.id)}>
          <Plus className="w-3.5 h-3.5" />
          {t('portfolio.addAsset')}
        </button>
      </div>
      {portfolio.assets.map((asset, assetIdx) => (
        <TickerAssetRow
          key={asset.id ?? assetIdx}
          asset={asset}
          assetIdx={assetIdx}
          portfolioId={portfolio.id}
          onRemoveAsset={onRemoveAsset}
          onUpdateAsset={onUpdateAsset}
          t={t}
        />
      ))}
    </>
  );
}
