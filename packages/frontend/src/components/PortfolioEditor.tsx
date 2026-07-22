/**
 * @file 投资组合编辑器
 * @description 投资组合配置编辑面板，支持增删标的、调整权重、设置调仓策略及导入导出
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/store/backtestStore';
import type { RebalanceFrequency, BacktestParameters } from '@backtest/shared';
import { useToastStore } from '@/store/toastStore';
import { PORTFOLIO_PRESETS } from '@/store/backtestHelpers.js';
import type { StorePortfolio, TFunc } from './portfolioEditor/shared.js';
import { GlidepathForm } from './portfolioEditor/GlidepathComponents.js';
import { PortfolioCard } from './portfolioEditor/PortfolioCard.js';

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

  const handleComingSoon = () => {
    useToastStore.getState().addToast('warning', 'Coming soon');
  };

  const handlePresetSelect = (presetId: string) => {
    onAddPreset(presetId);
    setPresetOpen(false);
  };

  return (
    <div className="portfolios-header">
      <span className="portfolios-title">{t('portfolio.title')}</span>
      <button className="portfolios-add-btn portfolios-add-btn-secondary" onClick={onLoadExample}>
        Load example
      </button>
      <button className="portfolios-add-btn" onClick={onAdd}>
        {t('portfolio.addEmpty')}
      </button>
      <div ref={presetContainerRef} className="portfolios-add-preset-wrap">
        <button
          className="portfolios-add-btn portfolios-add-btn-support"
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
                onClick={() => handlePresetSelect(preset.id)}
              >
                <span className="preset-dropdown-label">{t(preset.labelKey)}</span>
                <span className="preset-dropdown-desc">{t(preset.descriptionKey)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="portfolios-add-btn portfolios-add-btn-support" onClick={handleComingSoon}>
        {t('portfolio.addAsset')}
      </button>
      <button className="portfolios-add-btn portfolios-add-btn-muted" onClick={handleComingSoon}>
        {t('portfolio.addSaved')}
      </button>
      <button className="portfolios-add-btn portfolios-add-btn-support" onClick={onAddGlidepath}>
        {t('portfolio.addGlidepath')}
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
        onLoadExample={() => addPortfolio()}
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
          <div className="portfolios-empty-placeholder">
            No portfolios yet. Click ADD EMPTY to create one.
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
