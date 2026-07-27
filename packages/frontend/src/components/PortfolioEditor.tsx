/**
 * @file 投资组合编辑器
 * @description 投资组合配置编辑面板，支持增删标的、调整权重、设置调仓策略及导入导出。
 *   - 默认模式：多组合完整版，从 useBacktestStore 读取状态（组合回测页使用）
 *   - singleMode：单组合受控版，通过 props 控制（蒙特卡洛/因子回归/调仓敏感性/一次性vs定投使用）
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, ChevronDown, FolderOpen } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import type { RebalanceFrequency, BacktestParameters } from '@backtest/shared';
import { useToastStore } from '@/store/toastStore';
import { PORTFOLIO_PRESETS } from '@/store/backtestHelpers.js';
import { validateAssetWeights } from '@/utils/validation';
import type { StorePortfolio, TFunc } from './portfolioEditor/shared.js';
import { GlidepathForm } from './portfolioEditor/GlidepathComponents.js';
import { PortfolioCardV2 } from './portfolioEditor/PortfolioCardV2.js';
import { AllocationBar, TotalWeightBlock } from './portfolioEditor/WeightBar.js';
import { getPortfolioColor } from '@/lib/chart-colors.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AffixInput } from '@/components/ui/affix-input';
import { Badge } from '@/components/ui/badge';

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
    <div
      className="flex flex-col gap-1.5 p-3 bg-surface border border-border-subtle rounded-lg"
      style={wrapInSection ? undefined : cardStyle}
    >
      {header}
      <div className="flex flex-col gap-1.5">
        {assets.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="text"
              value={a.ticker}
              onChange={(e) => onUpdate(i, 'ticker', e.target.value)}
              placeholder={t('optimizer.tickerPlaceholder')}
              className="h-8 min-w-0 flex-1 font-mono uppercase"
            />
            <AffixInput
              type="number"
              value={a.weight || ''}
              onChange={(e) => onUpdate(i, 'weight', Number(e.target.value))}
              min={0}
              max={100}
              suffix="%"
              className="h-8 w-[96px] shrink-0 font-mono tabular-nums"
            />
            <Button
              variant="destructive"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onRemove(i)}
              title={t('common.delete')}
              aria-label={t('common.delete')}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="pt-1">
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" />
          {t('portfolio.addAsset')}
        </Button>
      </div>
      <div className="flex items-center gap-2 pt-2 mt-1 border-t border-border-subtle">
        <span className="shrink-0 text-caption text-fg-tertiary uppercase tracking-wide">
          {t('portfolio.total')}
        </span>
        <AllocationBar assets={assets} tw={totalWeight} />
        <TotalWeightBlock tw={totalWeight} isComplete={complete} />
      </div>
    </div>
  );

  if (!wrapInSection) {
    return card;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body font-semibold text-fg">{t('portfolio.title')}</span>
      </div>
      <div>{card}</div>
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

/** 添加组合菜单的回调集合 */
interface AddMenuActions {
  t: TFunc;
  onAdd: () => void;
  onAddPreset: (presetId: string) => void;
  onAddGlidepath: () => void;
  onLoadExample: () => void;
  onComingSoon: () => void;
}

/** 添加组合下拉面板（从 AddPortfolioMenu 抽出以控制行数） */
function AddMenuDropdown({
  t,
  onAdd,
  onAddPreset,
  onAddGlidepath,
  onLoadExample,
  onComingSoon,
  presetSubOpen,
  setPresetSubOpen,
  close,
}: AddMenuActions & {
  presetSubOpen: boolean;
  setPresetSubOpen: (v: boolean) => void;
  close: () => void;
}) {
  const wrap = (fn: () => void) => () => {
    fn();
    close();
  };
  return (
    <div
      className="absolute top-full right-0 mt-1 z-30 min-w-[200px] bg-surface border border-border rounded-lg shadow-lg py-1"
      role="menu"
    >
      <MenuButton label={t('portfolio.addEmpty')} onClick={wrap(onAdd)} />
      <PresetSubmenu
        t={t}
        onAddPreset={onAddPreset}
        onSubOpen={presetSubOpen}
        setSubOpen={setPresetSubOpen}
        close={close}
      />
      <MenuButton label={t('portfolio.addSaved')} onClick={wrap(onComingSoon)} />
      <MenuButton label={t('portfolio.addGlidepath')} onClick={wrap(onAddGlidepath)} />
      <div className="h-px bg-border-subtle my-1" />
      <MenuButton label={t('portfolio.loadExample')} onClick={wrap(onLoadExample)} />
    </div>
  );
}

/** 添加组合下拉菜单 */
function AddPortfolioMenu({ t, onAdd, onAddPreset, onAddGlidepath, onLoadExample, onComingSoon }: AddMenuActions) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [presetSubOpen, setPresetSubOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
        setPresetSubOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addMenuOpen]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        variant="secondary"
        size="sm"
        aria-expanded={addMenuOpen}
        onClick={() => setAddMenuOpen((v) => !v)}
      >
        <Plus className="w-3.5 h-3.5" />
        {t('portfolio.addPortfolio')}
        <ChevronDown className="w-3.5 h-3.5" />
      </Button>
      {addMenuOpen && (
        <AddMenuDropdown
          t={t}
          onAdd={onAdd}
          onAddPreset={onAddPreset}
          onAddGlidepath={onAddGlidepath}
          onLoadExample={onLoadExample}
          onComingSoon={onComingSoon}
          presetSubOpen={presetSubOpen}
          setPresetSubOpen={setPresetSubOpen}
          close={() => setAddMenuOpen(false)}
        />
      )}
    </div>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full px-3 py-2 text-left text-caption text-fg bg-transparent hover:bg-hover transition-colors border-0 cursor-pointer"
      role="menuitem"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function PresetSubmenu({
  t,
  onAddPreset,
  onSubOpen,
  setSubOpen,
  close,
}: {
  t: TFunc;
  onAddPreset: (presetId: string) => void;
  onSubOpen: boolean;
  setSubOpen: (v: boolean) => void;
  close: () => void;
}) {
  return (
    <div
      className="relative"
      onMouseEnter={() => setSubOpen(true)}
      onMouseLeave={() => setSubOpen(false)}
    >
      <button
        type="button"
        className="flex w-full px-3 py-2 text-left text-caption text-fg bg-transparent hover:bg-hover transition-colors border-0 cursor-pointer"
        role="menuitem"
      >
        {t('portfolio.addPreset')}
        <ChevronDown className="w-3 h-3 ml-auto rotate-[-90deg]" />
      </button>
      {onSubOpen && (
        <div
          className="absolute top-0 right-full mr-1 min-w-[240px] bg-surface border border-border rounded-lg shadow-lg py-1"
          role="menu"
        >
          {PORTFOLIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="flex flex-col gap-0.5 w-full px-3 py-2 text-left bg-transparent hover:bg-hover transition-colors border-0 cursor-pointer"
              role="menuitem"
              onClick={() => {
                onAddPreset(preset.id);
                close();
              }}
            >
              <span className="text-caption font-medium text-fg">{t(preset.labelKey)}</span>
              <span className="text-caption text-fg-tertiary">{t(preset.descriptionKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 编辑器头部按钮区：2 按钮 + 5 项下拉（P1-4 精简） */
function PortfolioEditorHeader({
  t,
  count,
  onAdd,
  onAddPreset,
  onAddGlidepath,
  onLoadExample,
}: {
  t: TFunc;
  count: number;
  onAdd: () => void;
  onAddPreset: (presetId: string) => void;
  onAddGlidepath: () => void;
  onLoadExample: () => void;
}) {
  const handleComingSoon = () => {
    useToastStore.getState().addToast('warning', t('portfolio.comingSoon'));
  };

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
      <div className="flex items-center gap-2">
        <span className="text-body font-semibold text-fg">{t('portfolio.title')}</span>
        {count > 0 && (
          <Badge variant="secondary" size="sm">
            {count}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={handleComingSoon}>
          <FolderOpen className="w-3.5 h-3.5" />
          {t('portfolio.load')}
        </Button>
        <AddPortfolioMenu
          t={t}
          onAdd={onAdd}
          onAddPreset={onAddPreset}
          onAddGlidepath={onAddGlidepath}
          onLoadExample={onLoadExample}
          onComingSoon={handleComingSoon}
        />
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
    <div className="flex flex-col gap-2">
      <PortfolioEditorHeader
        t={t}
        count={portfolios.length}
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
      <div className="flex flex-wrap items-start gap-3">
        {portfolios.length === 0 ? (
          <div className="flex items-center gap-2 py-2">
            <span className="text-body text-fg-tertiary">{t('portfolio.emptyPortfolios')}</span>
            <Button variant="ghost" size="sm" onClick={() => addPortfolio('60-40')}>
              {t('portfolio.loadExample')}
            </Button>
          </div>
        ) : (
          portfolios.map((portfolio, idx) => (
            <PortfolioCardV2
              key={portfolio.id}
              portfolio={portfolio}
              index={idx}
              color={getPortfolioColor(idx)}
              rebalanceOptions={rebalanceOptions}
              nonGlidepathPortfolios={nonGlidepathPortfolios}
              onUpdate={updatePortfolio}
              onDelete={() => removePortfolio(portfolio.id)}
              onDuplicate={() => duplicatePortfolio(portfolio.id)}
              onSave={(p) => handleSavePortfolio(p, parameters, t)}
              onDeepAnalysis={() => {
                /* TODO: wire deep analysis navigation */
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
