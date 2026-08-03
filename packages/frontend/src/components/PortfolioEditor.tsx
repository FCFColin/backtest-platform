import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, ChevronDown, FolderOpen, GitCompare } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import type { RebalanceFrequency, BacktestParameters } from '@backtest/shared';
import { useToastStore } from '@/store/toastStore';
import { PORTFOLIO_PRESETS } from '@/store/backtestHelpers.js';
import { validateAssetWeights } from '@/utils/validation';
import type { StorePortfolio, TFunc } from './portfolioEditor/portfolioEditor.js';
import {
  GlidepathForm,
  PortfolioCard,
  AllocationBar,
  TotalWeightBlock,
} from './portfolioEditor/portfolioEditor.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { downloadJSON } from '@/utils/format';
import { REBALANCE_LBL } from '@/utils/constants';
import {
  AffixInput,
  Badge,
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/uiComponents';
interface PortfolioAsset {
  ticker: string;
  weight: number;
}
interface SingleModeProps {
  singleMode: true;
  assets: PortfolioAsset[];
  totalWeight: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: 'ticker' | 'weight', val: string | number) => void;
  header?: ReactNode;
  wrapInSection?: boolean;
  cardStyle?: React.CSSProperties;
  isComplete?: boolean;
}
interface MultiModeProps {
  singleMode?: false;
}
type PortfolioEditorProps = SingleModeProps | MultiModeProps;
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
  if (!wrapInSection) return card;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body font-semibold text-fg">{t('portfolio.title')}</span>
      </div>
      <div>{card}</div>
    </div>
  );
}
function handleSavePortfolio(portfolio: StorePortfolio, parameters: BacktestParameters, t: TFunc) {
  const data = { portfolios: [portfolio], parameters, exportedAt: new Date().toISOString() };
  downloadJSON(data, `${portfolio.name || 'portfolio'}.json`);
  useToastStore.getState().addToast('success', t('portfolio.savedAsJson'));
}
const REBALANCE_KEYS: RebalanceFrequency[] = [
  'none',
  'annual',
  'quarterly',
  'monthly',
  'weekly',
  'daily',
  'threshold',
];
const buildRebalanceOptions = (t: TFunc) =>
  REBALANCE_KEYS.map((value) => ({ value, label: t(REBALANCE_LBL[value]) }));
interface AddMenuActions {
  t: TFunc;
  onAdd: () => void;
  onAddPreset: (presetId: string) => void;
  onAddGlidepath: () => void;
  onLoadExample: () => void;
  onLoadCompareExample: () => void;
  onComingSoon: () => void;
}
function AddPortfolioMenu(props: AddMenuActions) {
  const { t } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus className="w-3.5 h-3.5" />
          {t('portfolio.addPortfolio')}
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onClick={props.onAdd}>{t('portfolio.addEmpty')}</DropdownMenuItem>
        {PORTFOLIO_PRESETS.map((preset) => (
          <DropdownMenuItem key={preset.id} onClick={() => props.onAddPreset(preset.id)}>
            <div className="flex flex-col gap-0.5">
              <span className="text-caption font-medium text-fg">{t(preset.labelKey)}</span>
              <span className="text-caption text-fg-tertiary">{t(preset.descriptionKey)}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={props.onComingSoon}>{t('portfolio.addSaved')}</DropdownMenuItem>
        <DropdownMenuItem onClick={props.onAddGlidepath}>
          {t('portfolio.addGlidepath')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={props.onLoadExample}>
          {t('portfolio.loadExample')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={props.onLoadCompareExample}>
          <GitCompare className="w-3.5 h-3.5 shrink-0" />
          {t('portfolio.loadCompareExample')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function PortfolioEditorHeader({
  t,
  count,
  ...menuActions
}: { t: TFunc; count: number } & AddMenuActions) {
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useToastStore.getState().addToast('warning', t('portfolio.comingSoon'))}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t('portfolio.load')}
        </Button>
        <AddPortfolioMenu t={t} {...menuActions} />
      </div>
    </div>
  );
}
export default function PortfolioEditor(props?: PortfolioEditorProps) {
  if (props?.singleMode === true) {
    const { singleMode: _, ...rest } = props;
    return <SinglePortfolioEditor {...rest} />;
  }
  return <MultiPortfolioEditor />;
}
function MultiPortfolioEditor() {
  const { t } = useTranslation();
  const portfolios = useBacktestStore((s) => s.portfolios);
  const addPortfolio = useBacktestStore((s) => s.addPortfolio);
  const addGlidepath = useBacktestStore((s) => s.addGlidepath);
  const duplicatePortfolio = useBacktestStore((s) => s.duplicatePortfolio);
  const removePortfolio = useBacktestStore((s) => s.removePortfolio);
  const updatePortfolio = useBacktestStore((s) => s.updatePortfolio);
  const parameters = useBacktestStore((s) => s.parameters);
  const rebalanceOptions = useMemo(() => buildRebalanceOptions(t), [t]);
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
  const handleLoadCompareExample = () => {
    addPortfolio('60-40');
    addPortfolio('80-20');
    addPortfolio('all-weather');
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
        onLoadCompareExample={handleLoadCompareExample}
        onComingSoon={() => useToastStore.getState().addToast('warning', t('portfolio.comingSoon'))}
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
      <div
        className={portfolios.length === 1 ? 'max-w-[460px]' : 'flex flex-wrap items-start gap-3'}
      >
        {portfolios.length === 0 ? (
          <div className="flex items-center gap-2 py-2">
            <span className="text-body text-fg-tertiary">{t('portfolio.emptyPortfolios')}</span>
            <Button variant="ghost" size="sm" onClick={() => addPortfolio('60-40')}>
              {t('portfolio.loadExample')}
            </Button>
          </div>
        ) : (
          portfolios.map((portfolio, idx) => (
            <PortfolioCard
              key={portfolio.id}
              portfolio={portfolio}
              color={getPortfolioColor(idx)}
              rebalanceOptions={rebalanceOptions}
              nonGlidepathPortfolios={nonGlidepathPortfolios}
              onUpdate={updatePortfolio}
              onDelete={() => removePortfolio(portfolio.id)}
              onDuplicate={() => duplicatePortfolio(portfolio.id)}
              onSave={(p) => handleSavePortfolio(p, parameters, t)}
              onDeepAnalysis={() => {}}
            />
          ))
        )}
      </div>
    </div>
  );
}
