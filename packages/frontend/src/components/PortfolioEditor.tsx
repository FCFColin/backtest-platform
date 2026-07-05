/**
 * @file 投资组合编辑器
 * @description 投资组合配置编辑面板，支持增删标的、调整权重、设置调仓策略及导入导出
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/store/backtestStore';
import { X, Plus, Copy, Download, Trash2, Share2 } from 'lucide-react';
import TickerInput from './TickerInput';
import WeightInput from './WeightInput';
import type {
  RebalanceFrequency,
  RebalanceBands,
  Portfolio,
  BacktestParameters,
} from '@backtest/shared/types';
import { useToastStore } from '@/store/toastStore';

type StorePortfolio = ReturnType<typeof useBacktestStore.getState>['portfolios'][number];
type TFunc = (key: string) => string;
type AssetPatch = { ticker?: string; weight?: number };
type BatchUpdate = (portfolioId: string, updates: Array<{ index: number; weight: number }>) => void;

const FIELD_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px' };
const LABEL_STYLE: React.CSSProperties = { fontSize: '11px', color: 'var(--text-muted)' };
const GP_FORM_STYLE: React.CSSProperties = {
  padding: '12px 16px',
  marginBottom: '8px',
  backgroundColor: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-soft)',
};
const GP_TITLE_STYLE: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-strong)',
  marginBottom: '8px',
};
const GP_CONFIG_STYLE: React.CSSProperties = {
  padding: '8px 10px',
  marginBottom: '6px',
  backgroundColor: 'var(--bg-elevated)',
  borderRadius: '6px',
  border: '1px solid var(--border-soft)',
};
const GP_CONFIG_TITLE_STYLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--accent)',
  marginBottom: '6px',
  letterSpacing: '0.02em',
};
const FIELDS_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  alignItems: 'flex-end',
};

/** 带标签的表单字段容器 */
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={FIELD_STYLE}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

/** 组合选择下拉框 */
function PortfolioSelect({
  value,
  onChange,
  portfolios,
  t,
}: {
  value: string;
  onChange: (value: string) => void;
  portfolios: StorePortfolio[];
  t: TFunc;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="portfolio-rebalance-select"
      style={{ width: '120px' }}
    >
      {portfolios.map((p, idx) => (
        <option key={p.id} value={p.id}>
          {p.name || `${t('portfolio.portfolio')} ${idx + 1}`}
        </option>
      ))}
    </select>
  );
}

/** Glidepath 目标权重编辑区 */
function GlidepathTargetWeights({
  portfolio,
  onUpdate,
  t,
}: {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  t: TFunc;
}) {
  return (
    <>
      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
        {t('portfolio.targetWeights')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
        {portfolio.assets.map((asset, ai) => {
          const w = portfolio.glidepathToWeights?.[ai];
          return (
            <div
              key={ai}
              style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '90px' }}
            >
              <label
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {asset.ticker || `${t('portfolio.asset')} ${ai + 1}`}
              </label>
              <div className="advanced-input-wrap" style={{ height: '28px' }}>
                <input
                  type="number"
                  value={w != null ? +(w * 100).toFixed(2) : ''}
                  min={0}
                  max={100}
                  step={1}
                  className="advanced-input"
                  style={{ height: '28px', fontSize: '12px' }}
                  onChange={(e) => {
                    const v = e.target.value === '' ? 0 : Number(e.target.value) / 100;
                    const next = [
                      ...(portfolio.glidepathToWeights ?? portfolio.assets.map(() => 0)),
                    ];
                    next[ai] = v;
                    onUpdate(portfolio.id, { glidepathToWeights: next });
                  }}
                />
                <span className="advanced-suffix" style={{ fontSize: '11px' }}>
                  %
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Glidepath 创建表单 */
function GlidepathForm({
  nonGlidepathPortfolios,
  onConfirm,
  onCancel,
}: {
  nonGlidepathPortfolios: StorePortfolio[];
  onConfirm: (name: string, from: string, to: string, years: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [gpName, setGpName] = useState('');
  const [gpFrom, setGpFrom] = useState('');
  const [gpTo, setGpTo] = useState('');
  const [gpYears, setGpYears] = useState(10);
  const canConfirm = gpFrom && gpTo && gpFrom !== gpTo;

  return (
    <div style={GP_FORM_STYLE}>
      <div style={GP_TITLE_STYLE}>{t('portfolio.newGlidepath')}</div>
      <div style={FIELDS_ROW_STYLE}>
        <FieldLabel label={t('portfolio.name')}>
          <input
            type="text"
            value={gpName}
            onChange={(e) => setGpName(e.target.value)}
            className="portfolio-name-input"
            style={{ width: '120px' }}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.sourcePortfolio')}>
          <PortfolioSelect
            value={gpFrom}
            onChange={setGpFrom}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.targetPortfolio')}>
          <PortfolioSelect
            value={gpTo}
            onChange={setGpTo}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.transitionYears')}>
          <input
            type="number"
            value={gpYears}
            onChange={(e) => setGpYears(Number(e.target.value) || 1)}
            min={1}
            max={50}
            className="offset-input"
            style={{ width: '60px' }}
          />
        </FieldLabel>
        <button
          className="portfolios-add-btn"
          style={{ fontSize: '12px' }}
          disabled={!canConfirm}
          onClick={() => canConfirm && onConfirm(gpName, gpFrom, gpTo, gpYears)}
        >
          {t('common.confirm')}
        </button>
        <button
          className="portfolios-add-btn portfolios-add-btn-secondary"
          style={{ fontSize: '12px' }}
          onClick={onCancel}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Glidepath 配置区（已存在的 glidepath 组合卡片内） */
function GlidepathConfig({
  portfolio,
  nonGlidepathPortfolios,
  onUpdate,
}: {
  portfolio: StorePortfolio;
  nonGlidepathPortfolios: StorePortfolio[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={GP_CONFIG_STYLE}>
      <div style={GP_CONFIG_TITLE_STYLE}>{t('portfolio.glidepathConfig')}</div>
      <div style={FIELDS_ROW_STYLE}>
        <FieldLabel label={t('portfolio.sourcePortfolio')}>
          <PortfolioSelect
            value={portfolio.glidepathFrom ?? ''}
            onChange={(v) => onUpdate(portfolio.id, { glidepathFrom: v })}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.targetPortfolio')}>
          <PortfolioSelect
            value={portfolio.glidepathTo ?? ''}
            onChange={(v) => onUpdate(portfolio.id, { glidepathTo: v })}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.transitionYears')}>
          <input
            type="number"
            value={portfolio.glidepathYears ?? 10}
            onChange={(e) =>
              onUpdate(portfolio.id, { glidepathYears: Number(e.target.value) || 1 })
            }
            min={1}
            max={50}
            className="offset-input"
            style={{ width: '60px' }}
          />
        </FieldLabel>
      </div>
      <GlidepathTargetWeights portfolio={portfolio} onUpdate={onUpdate} t={t} />
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
function PortfolioToolbarAndAssets({
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

/** 卡片头部操作按钮 */
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
    <div className="portfolio-card-header">
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

/** 组合卡片（单个组合的完整编辑界面） */
function PortfolioCard({
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

function handleSavePortfolio(portfolio: StorePortfolio, parameters: BacktestParameters, t: TFunc) {
  const data = { portfolios: [portfolio], parameters, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${portfolio.name || 'portfolio'}.json`;
  a.click();
  URL.revokeObjectURL(url);
  useToastStore.getState().addToast('success', t('portfolio.savedAsJson'));
}

function handleSharePortfolios(
  portfolios: StorePortfolio[],
  parameters: BacktestParameters,
  t: TFunc,
) {
  const shareData = { p: portfolios.map(({ id: _id, ...rest }) => rest), params: parameters };
  const encoded = btoa(encodeURIComponent(JSON.stringify(shareData)));
  const url = `${window.location.origin}${window.location.pathname}#share=${encoded}`;
  navigator.clipboard
    .writeText(url)
    .then(() => {
      useToastStore.getState().addToast('success', t('backtest.shareLinkCopied'));
    })
    .catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      useToastStore.getState().addToast('success', t('backtest.shareLinkCopied'));
    });
}

/** 编辑器头部按钮区 */
function PortfolioEditorHeader({
  t,
  onAdd,
  onAddGlidepath,
  onShare,
}: {
  t: TFunc;
  onAdd: () => void;
  onAddGlidepath: () => void;
  onShare: () => void;
}) {
  return (
    <div className="portfolios-header">
      <span className="portfolios-title">{t('portfolio.title')}</span>
      <button className="portfolios-add-btn" onClick={onAdd}>
        {t('portfolio.addEmpty')}
      </button>
      <button className="portfolios-add-btn portfolios-add-btn-secondary" onClick={onAddGlidepath}>
        {t('portfolio.addGlidepath')}
      </button>
      <button className="portfolios-add-btn portfolios-add-btn-secondary" onClick={onShare}>
        <Share2 className="w-3.5 h-3.5" />
        {t('portfolio.shareLink')}
      </button>
    </div>
  );
}

export default function PortfolioEditor() {
  const { t } = useTranslation();
  const portfolios = useBacktestStore((s) => s.portfolios);
  const addPortfolio = useBacktestStore((s) => s.addPortfolio);
  const addGlidepath = useBacktestStore((s) => s.addGlidepath);
  const duplicatePortfolio = useBacktestStore((s) => s.duplicatePortfolio);
  const removePortfolio = useBacktestStore((s) => s.removePortfolio);
  const addAsset = useBacktestStore((s) => s.addAsset);
  const removeAsset = useBacktestStore((s) => s.removeAsset);
  const updateAsset = useBacktestStore((s) => s.updateAsset);
  const batchUpdateAssets = useBacktestStore((s) => s.batchUpdateAssets);
  const updatePortfolio = useBacktestStore((s) => s.updatePortfolio);
  const parameters = useBacktestStore((s) => s.parameters);

  const rebalanceOptions = useMemo<{ value: RebalanceFrequency; label: string }[]>(
    () => [
      { value: 'none', label: t('portfolio.rebalanceNone') },
      { value: 'annual', label: t('portfolio.rebalanceAnnual') },
      { value: 'quarterly', label: t('portfolio.rebalanceQuarterly') },
      { value: 'monthly', label: t('portfolio.rebalanceMonthly') },
      { value: 'weekly', label: t('portfolio.rebalanceWeekly') },
      { value: 'daily', label: t('portfolio.rebalanceDaily') },
      { value: 'threshold', label: t('portfolio.rebalanceThreshold') },
    ],
    [t],
  );

  const [showGlidepathForm, setShowGlidepathForm] = useState(false);
  const nonGlidepathPortfolios = useMemo(
    () => portfolios.filter((p) => !p.isGlidepath),
    [portfolios],
  );

  const handleAddGlidepath = () => {
    if (nonGlidepathPortfolios.length < 2) {
      useToastStore.getState().addToast('warning', t('portfolio.needTwoPortfolios'));
      return;
    }
    setShowGlidepathForm(true);
  };

  return (
    <div className="portfolios-section">
      <PortfolioEditorHeader
        t={t}
        onAdd={addPortfolio}
        onAddGlidepath={handleAddGlidepath}
        onShare={() => handleSharePortfolios(portfolios, parameters, t)}
      />
      {showGlidepathForm && (
        <GlidepathForm
          nonGlidepathPortfolios={nonGlidepathPortfolios}
          onConfirm={(name, from, to, years) => {
            addGlidepath(name, from, to, years);
            setShowGlidepathForm(false);
          }}
          onCancel={() => setShowGlidepathForm(false)}
        />
      )}
      <div className="portfolios-cards">
        {portfolios.map((portfolio, idx) => (
          <PortfolioCard
            key={portfolio.id}
            portfolio={portfolio}
            idx={idx}
            rebalanceOptions={rebalanceOptions}
            nonGlidepathPortfolios={nonGlidepathPortfolios}
            onDuplicate={duplicatePortfolio}
            onRemove={removePortfolio}
            onSave={(p) => handleSavePortfolio(p, parameters, t)}
            onUpdate={updatePortfolio}
            onAddAsset={addAsset}
            onRemoveAsset={removeAsset}
            onUpdateAsset={updateAsset}
            onBatchUpdate={batchUpdateAssets}
          />
        ))}
      </div>
    </div>
  );
}
