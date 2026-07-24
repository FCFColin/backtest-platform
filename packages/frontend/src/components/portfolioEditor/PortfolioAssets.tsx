/**
 * @file 组合资产行与工具栏
 * @description 渲染组合卡片内的资产工具栏（新增/均分/拉伸）与持产行列表。
 *   持产行复用 WeightInput 的 HoldingRow 模式（TickerInput + 权重 + 删除按钮）。
 */
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import WeightInput from '../WeightInput.js';
import { Button } from '@/components/ui/button';
import type { StorePortfolio, TFunc, BatchUpdate, AssetPatch } from './shared.js';

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

/** Ticker 资产行（HoldingRow 模式） */
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
    <WeightInput
      key={asset.id ?? assetIdx}
      value={asset.weight}
      onChange={(num) => onUpdateAsset(portfolioId, assetIdx, { weight: num })}
      ticker={asset.ticker}
      tickerPlaceholder={t('portfolio.tickerPlaceholder')}
      onTickerChange={(newTicker) => onUpdateAsset(portfolioId, assetIdx, { ticker: newTicker })}
      onDelete={() => onRemoveAsset(portfolioId, asset.ticker)}
    />
  );
}

/**
 * 工具栏 + Ticker 行
 * @param props - portfolio/tw/onAddAsset/onRemoveAsset/onUpdateAsset/onBatchUpdate
 * @returns 渲染的工具栏与持产行列表
 */
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
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => onAddAsset(portfolio.id)}>
          <Plus />
          {t('portfolio.addAsset')}
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleEvenDistribute(portfolio, onBatchUpdate)}
        >
          {t('portfolio.evenDistribute')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleStretchTo100(portfolio, tw, onBatchUpdate)}
        >
          {t('portfolio.stretchTo100')}
        </Button>
      </div>
      <div className="mt-2 flex flex-col gap-2">
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
      </div>
    </>
  );
}
