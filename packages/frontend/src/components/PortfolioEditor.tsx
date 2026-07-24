/**
 * @file 投资组合编辑器
 * @description 投资组合配置编辑面板，支持增删标的、调整权重、设置调仓策略及导入导出。
 *   - 默认模式：多组合完整版，从 useBacktestStore 读取状态（组合回测页使用）
 *   - singleMode：单组合受控版，通过 props 控制（蒙特卡洛/因子回归/调仓敏感性/一次性vs定投使用）
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import type { RebalanceFrequency, BacktestParameters } from '@backtest/shared';
import { useToastStore } from '@/store/toastStore';
import { PORTFOLIO_PRESETS } from '@/store/backtestHelpers.js';
import { validateAssetWeights } from '@/utils/validation';
import type { StorePortfolio, TFunc } from './portfolioEditor/shared.js';
import { GlidepathForm } from './portfolioEditor/GlidepathComponents.js';
import { PortfolioCard } from './portfolioEditor/PortfolioCard.js';

// ──────────────────────────────────────────────
// 单组合模式（受控版）
// ──────────────────────────────────────────────

/** 标的项结构 */
interface PortfolioAsset {
  /** 标的代码 */
  ticker: string;
  /** 权重（0-100） */
  weight: number;
}

/** 单组合模式 Props */
interface SingleModeProps {
  /** 单组合模式标记 */
  singleMode: true;
  /** 标的列表 */
  assets: PortfolioAsset[];
  /** 权重合计（0-100） */
  totalWeight: number;
  /** 新增标的 */
  onAdd: () => void;
  /** 删除指定下标标的 */
  onRemove: (index: number) => void;
  /** 更新指定下标标的字段 */
  onUpdate: (index: number, field: 'ticker' | 'weight', val: string | number) => void;
  /** 卡片内可选头部（如组合名/调仓频率编辑），不传则不渲染 */
  header?: ReactNode;
  /** 是否包裹 portfolios-section + 标题栏。默认 true。多组合卡片场景（如蒙特卡洛）传 false */
  wrapInSection?: boolean;
  /** 是否外层为单一卡片宽度约束。wrapInSection=false 时生效，默认无约束 */
  cardStyle?: React.CSSProperties;
  /** 覆盖权重是否合规的判定（默认 |totalWeight-100|<=0.01） */
  isComplete?: boolean;
}

/** 多组合模式 Props（无额外 props，从 store 读取） */
interface MultiModeProps {
  singleMode?: false;
}

/** PortfolioEditor 统一 Props */
export type PortfolioEditorProps = SingleModeProps | MultiModeProps;

/**
 * 单组合受控编辑器：标的增删改 + 权重合计。
 * 既支持带 portfolios-section 标题栏的独立用法（一次性 vs 定投、因子回归、调仓敏感性），
 * 也支持无外层包裹、由调用方自备 header 的卡片用法（蒙特卡洛多组合）。
 */
function SinglePortfolioEditor({
  assets,
  totalWeight,
  onAdd,
  onRemove,
  onUpdate,
  header,
  wrapInSection = true,
  cardStyle,
  isComplete,
}: Omit<SingleModeProps, 'singleMode'>) {
  const { t } = useTranslation();
  const complete = isComplete ?? validateAssetWeights(assets) === null;

  const card = (
    <div className="portfolio-card" style={wrapInSection ? undefined : cardStyle}>
      {header}
      {assets.map((a, i) => (
        <div key={i} className="ticker-row">
          <input
            type="text"
            value={a.ticker}
            onChange={(e) => onUpdate(i, 'ticker', e.target.value)}
            placeholder={t('optimizer.tickerPlaceholder')}
            className="ticker-input"
          />
          <div className="weight-cell">
            <input
              type="number"
              value={a.weight || ''}
              onChange={(e) => onUpdate(i, 'weight', Number(e.target.value))}
              min={0}
              max={100}
              className="weight-input"
              placeholder="%"
            />
            <span className="weight-suffix">%</span>
          </div>
          <button onClick={() => onRemove(i)} className="row-remove-btn" title={t('common.delete')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="portfolio-card-toolbar">
        <button className="btn-ghost" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" />
          {t('portfolio.addAsset')}
        </button>
      </div>
      <div className={`portfolio-total ${complete ? 'complete' : 'incomplete'}`}>
        <span>{t('portfolio.total')}</span>
        <span className="total-value">{totalWeight}%</span>
      </div>
    </div>
  );

  if (!wrapInSection) {
    return card;
  }

  return (
    <div className="portfolios-section">
      <div className="portfolios-header">
        <span className="portfolios-title">{t('portfolio.title')}</span>
      </div>
      <div className="portfolios-cards">{card}</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 多组合模式（完整版）
// ──────────────────────────────────────────────

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

/** 构建调仓频率下拉选项（抽出以避免触发 max-lines-per-function 规则） */
function buildRebalanceOptions(t: TFunc): { value: RebalanceFrequency; label: string }[] {
  return [
    { value: 'none', label: t('portfolio.rebalanceNone') },
    { value: 'annual', label: t('portfolio.rebalanceAnnual') },
    { value: 'quarterly', label: t('portfolio.rebalanceQuarterly') },
    { value: 'monthly', label: t('portfolio.rebalanceMonthly') },
    { value: 'weekly', label: t('portfolio.rebalanceWeekly') },
    { value: 'daily', label: t('portfolio.rebalanceDaily') },
    { value: 'threshold', label: t('portfolio.rebalanceThreshold') },
  ];
}

/** 预设下拉按钮（从 PortfolioEditorHeader 抽出以控制行数） */
function PresetDropdownButton({
  t,
  onAddPreset,
}: {
  t: TFunc;
  onAddPreset: (presetId: string) => void;
}) {
  const [presetOpen, setPresetOpen] = useState(false);
  const presetContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!presetOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (presetContainerRef.current && !presetContainerRef.current.contains(e.target as Node)) {
        setPresetOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [presetOpen]);

  return (
    <div ref={presetContainerRef} className="portfolios-add-preset-wrap">
      <button
        className="btn-secondary-sm"
        aria-expanded={presetOpen}
        onClick={() => setPresetOpen((v) => !v)}
      >
        {t('portfolio.addPreset')}
      </button>
      {presetOpen && (
        <div className="preset-dropdown" role="menu">
          {PORTFOLIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="preset-dropdown-item"
              role="menuitem"
              onClick={() => {
                onAddPreset(preset.id);
                setPresetOpen(false);
              }}
            >
              <span className="preset-dropdown-label">{t(preset.labelKey)}</span>
              <span className="preset-dropdown-desc">{t(preset.descriptionKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 编辑器头部按钮区 */
function PortfolioEditorHeader({
  t,
  onAdd,
  onAddPreset,
  onAddGlidepath,
  onLoadExample,
}: {
  t: TFunc;
  onAdd: () => void;
  onAddPreset: (presetId: string) => void;
  onAddGlidepath: () => void;
  onLoadExample: () => void;
}) {
  const handleComingSoon = () => {
    useToastStore.getState().addToast('warning', t('portfolio.comingSoon'));
  };

  return (
    <div className="portfolios-header">
      <span className="portfolios-title">{t('portfolio.title')}</span>
      <div className="portfolios-actions">
        <button className="btn-secondary-sm" onClick={onAdd}>
          {t('portfolio.addEmpty')}
        </button>
        <PresetDropdownButton t={t} onAddPreset={onAddPreset} />
        <button className="btn-secondary-sm" onClick={handleComingSoon}>
          {t('portfolio.addAsset')}
        </button>
        <button className="btn-secondary-sm" onClick={handleComingSoon} disabled>
          {t('portfolio.addSaved')}
        </button>
        <button className="btn-secondary-sm" onClick={onAddGlidepath}>
          {t('portfolio.addGlidepath')}
        </button>
        <span className="divider-v" />
        <button className="btn-ghost-sm" onClick={onLoadExample}>
          {t('portfolio.loadExample')}
        </button>
      </div>
    </div>
  );
}

/**
 * 投资组合编辑器
 *
 * @param props - 当 `singleMode=true` 时使用受控模式（通过 props 管理单个组合）；
 *                默认（不传或 `singleMode=false`）使用多组合模式（从 useBacktestStore 读取状态）。
 */
export default function PortfolioEditor(props?: PortfolioEditorProps) {
  if (props?.singleMode === true) {
    const { singleMode: _, ...rest } = props;
    return <SinglePortfolioEditor {...rest} />;
  }

  return <MultiPortfolioEditor />;
}

/** 多组合完整版编辑器（从 useBacktestStore 读取状态） */
function MultiPortfolioEditor() {
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
    () => buildRebalanceOptions(t),
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
        onAdd={() => addPortfolio()}
        onAddPreset={(presetId) => addPortfolio(presetId)}
        onAddGlidepath={handleAddGlidepath}
        onLoadExample={() => addPortfolio('60-40')}
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
        {portfolios.length === 0 ? (
          <div className="portfolios-empty-inline">
            <span className="empty-text">{t('portfolio.emptyPortfolios')}</span>
            <button className="btn-text-link" onClick={() => addPortfolio('60-40')}>
              {t('portfolio.loadExample')}
            </button>
          </div>
        ) : (
          portfolios.map((portfolio, idx) => (
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
          ))
        )}
      </div>
    </div>
  );
}
