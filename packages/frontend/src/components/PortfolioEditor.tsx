/**
 * @file 投资组合编辑器
 * @description 投资组合配置编辑面板，支持增删标的、调整权重、设置调仓策略及导入导出
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/store/backtestStore';
import { Share2 } from 'lucide-react';
import type { RebalanceFrequency, BacktestParameters } from '@backtest/shared';
import { useToastStore } from '@/store/toastStore';
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
