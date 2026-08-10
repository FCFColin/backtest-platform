import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, ChevronDown, GitCompare } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import {
  ALL_REBALANCE_FREQUENCIES,
  REBALANCE_LABELS,
  type BacktestParameters,
} from '@backtest/shared';
import { useToastStore } from '@/store/toastStore';
import { PRESET_PORTFOLIOS } from '@/store/presetPortfolios.js';
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
  const weightError = isComplete !== undefined ? null : validateAssetWeights(assets);
  const complete = isComplete ?? weightError === null;
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
              placeholder={t('Enter ticker, e.g. VTI')}
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
              title={t('Delete')}
              aria-label={t('Delete')}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="pt-1">
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" />
          {t('Add Asset')}
        </Button>
      </div>
      <div
        className="flex items-center gap-2 pt-2 mt-1 border-t border-border-subtle"
        aria-invalid={!complete}
      >
        <span className="shrink-0 text-caption text-fg-tertiary uppercase tracking-wide">
          {t('Total')}
        </span>
        <AllocationBar assets={assets} tw={totalWeight} />
        <TotalWeightBlock tw={totalWeight} isComplete={complete} />
      </div>
      {weightError && (
        <p role="alert" className="text-caption text-danger">
          {t('Weights must sum to 100%, got {{total}}%', { total: totalWeight.toFixed(2) })}
        </p>
      )}
    </div>
  );
  if (!wrapInSection) return card;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body font-semibold text-fg">{t('Portfolio')}</span>
      </div>
      <div>{card}</div>
    </div>
  );
}
function handleSavePortfolio(portfolio: StorePortfolio, parameters: BacktestParameters, t: TFunc) {
  const data = { portfolios: [portfolio], parameters, exportedAt: new Date().toISOString() };
  downloadJSON(data, `${portfolio.name || 'portfolio'}.json`);
  useToastStore.getState().addToast('success', t('Portfolio saved as JSON file'));
}
const buildRebalanceOptions = (t: TFunc) =>
  ALL_REBALANCE_FREQUENCIES.map((value) => ({ value, label: t(REBALANCE_LABELS[value]) }));
interface AddMenuActions {
  t: TFunc;
  onAdd: () => void;
  onAddPreset: (presetId: string) => void;
  onAddGlidepath: () => void;
  onLoadExample: () => void;
  onLoadCompareExample: () => void;
}
function AddPortfolioMenu(props: AddMenuActions) {
  const { t } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus className="w-3.5 h-3.5" />
          {t('Add Portfolio')}
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onClick={props.onAdd}>{t('Add Empty')}</DropdownMenuItem>
        {PRESET_PORTFOLIOS.map((preset) => (
          <DropdownMenuItem key={preset.id} onClick={() => props.onAddPreset(preset.id)}>
            <div className="flex flex-col gap-0.5">
              <span className="text-caption font-medium text-fg">{t(preset.nameKey)}</span>
              <span className="text-caption text-fg-tertiary">{t(preset.descriptionKey)}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={props.onAddGlidepath}>{t('Add Glidepath')}</DropdownMenuItem>
        <DropdownMenuItem onClick={props.onLoadExample}>{t('Load Example')}</DropdownMenuItem>
        <DropdownMenuItem onClick={props.onLoadCompareExample}>
          <GitCompare className="w-3.5 h-3.5 shrink-0" />
          {t('Load Comparison Example')}
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
        <span className="text-body font-semibold text-fg">{t('Portfolio')}</span>
        {count > 0 && (
          <Badge variant="secondary" size="sm">
            {count}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5">
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
      useToastStore
        .getState()
        .addToast('warning', t('At least 2 regular portfolios required to create a glide path'));
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
            <span className="text-body text-fg-tertiary">{t('No portfolios added yet')}</span>
            <Button variant="ghost" size="sm" onClick={() => addPortfolio('60-40')}>
              {t('Load Example')}
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
            />
          ))
        )}
      </div>
    </div>
  );
}
