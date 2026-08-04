import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button, Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/cards.js';
import {
  SectionHeader,
  PercentInput,
  DollarInput,
  RunButton,
} from '@/components/form/sharedFields';
import type { GoalAsset } from './goalOptimizerUtils.js';
interface GoalParamsProps {
  targetAmount: number;
  initialAmount: number;
  years: number;
  assets: GoalAsset[];
  totalWeight: number;
  isLoading: boolean;
  maxDrawdown: number | '';
  minSuccessRate: number | '';
  maxVolatility: number | '';
  numSimulations: number;
  onTargetAmountChange: (v: number) => void;
  onInitialAmountChange: (v: number) => void;
  onYearsChange: (v: number) => void;
  onAddAsset: () => void;
  onRemoveAsset: (idx: number) => void;
  onUpdateAsset: (idx: number, field: 'ticker' | 'weight', val: string | number) => void;
  onMaxDrawdownChange: (v: number | '') => void;
  onMinSuccessRateChange: (v: number | '') => void;
  onMaxVolatilityChange: (v: number | '') => void;
  onNumSimulationsChange: (v: number) => void;
  onRun: () => void;
}
function GoalSettingsSection({
  targetAmount,
  initialAmount,
  years,
  onTargetAmountChange,
  onInitialAmountChange,
  onYearsChange,
}: Pick<
  GoalParamsProps,
  | 'targetAmount'
  | 'initialAmount'
  | 'years'
  | 'onTargetAmountChange'
  | 'onInitialAmountChange'
  | 'onYearsChange'
>) {
  const { t } = useTranslation();
  const dollarFields = [
    {
      id: 'go-target',
      label: t('Target Amount'),
      value: targetAmount,
      onChange: onTargetAmountChange,
    },
    {
      id: 'go-initial',
      label: t('Initial Amount'),
      value: initialAmount,
      onChange: onInitialAmountChange,
    },
  ];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Goal Settings')}
        info={t(
          'Set your financial goal: target amount, initial amount, and investment time horizon',
        )}
        variant="label"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dollarFields.map((f) => (
          <Field key={f.id}>
            <FieldLabel htmlFor={f.id}>{f.label}</FieldLabel>
            <DollarInput
              id={f.id}
              min={0}
              value={f.value}
              onChange={(e) => f.onChange(Number(e.target.value))}
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor="go-years">{t('Time Horizon')}</FieldLabel>
          <div className="relative">
            <Input
              id="go-years"
              type="number"
              min={1}
              className="pr-14"
              value={years}
              onChange={(e) => onYearsChange(Number(e.target.value))}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
              {t('years')}
            </span>
          </div>
        </Field>
      </div>
    </section>
  );
}
type AssetProps = Pick<
  GoalParamsProps,
  'assets' | 'totalWeight' | 'onAddAsset' | 'onRemoveAsset' | 'onUpdateAsset'
>;
function AssetConfigSection({
  assets,
  totalWeight,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
}: AssetProps) {
  const { t } = useTranslation();
  const isComplete = Math.abs(totalWeight - 100) <= 0.01;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Asset Allocation')}
        info={t('Add tickers and weights; total weight must equal 100%')}
      />
      <div className="flex flex-col gap-2">
        {assets.map((a, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              type="text"
              className="flex-1 uppercase"
              value={a.ticker}
              placeholder={t('Enter ticker, e.g. VTI')}
              onChange={(e) => onUpdateAsset(idx, 'ticker', e.target.value)}
            />
            <div className="relative w-28 shrink-0">
              <Input
                type="number"
                className="pr-7"
                min={0}
                max={100}
                placeholder="%"
                value={a.weight || ''}
                onChange={(e) => onUpdateAsset(idx, 'weight', Number(e.target.value))}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
                %
              </span>
            </div>
            {assets.length > 1 && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => onRemoveAsset(idx)}
                title={t('Delete')}
                aria-label={t('Delete')}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onAddAsset}>
          <Plus />
          {t('Add Ticker')}
        </Button>
        <div className="text-caption">
          <span className="text-fg-tertiary">{t('Total')}</span>{' '}
          <span
            className={
              isComplete ? 'font-mono tabular-nums text-pos' : 'font-mono tabular-nums text-danger'
            }
          >
            {totalWeight}%
          </span>
        </div>
      </div>
    </section>
  );
}
type ConstraintProps = Pick<
  GoalParamsProps,
  | 'maxDrawdown'
  | 'minSuccessRate'
  | 'maxVolatility'
  | 'numSimulations'
  | 'onMaxDrawdownChange'
  | 'onMinSuccessRateChange'
  | 'onMaxVolatilityChange'
  | 'onNumSimulationsChange'
>;
function ConstraintsAndSimulation({
  maxDrawdown,
  minSuccessRate,
  maxVolatility,
  numSimulations,
  onMaxDrawdownChange,
  onMinSuccessRateChange,
  onMaxVolatilityChange,
  onNumSimulationsChange,
}: ConstraintProps) {
  const { t } = useTranslation();
  const numOrEmpty = (v: string) => (v === '' ? '' : Number(v));
  const constraints = [
    {
      id: 'go-maxdd',
      label: t('Max Drawdown Limit'),
      value: maxDrawdown,
      onChange: onMaxDrawdownChange,
    },
    {
      id: 'go-minsr',
      label: t('Min Success Rate'),
      value: minSuccessRate,
      onChange: onMinSuccessRateChange,
    },
    {
      id: 'go-maxvol',
      label: t('Max Volatility'),
      value: maxVolatility,
      onChange: onMaxVolatilityChange,
    },
  ];
  return (
    <>
      <CollapsibleSection
        title={t('Constraints')}
        description={t(
          'Optional: set max drawdown, min success rate, and max volatility constraints; simulation will filter paths that violate max drawdown and max volatility',
        )}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {constraints.map((c) => (
            <Field key={c.id}>
              <FieldLabel htmlFor={c.id}>{c.label}</FieldLabel>
              <PercentInput
                id={c.id}
                min={0}
                max={100}
                placeholder={t('No limit')}
                value={c.value}
                onChange={(e) => c.onChange(numOrEmpty(e.target.value))}
              />
            </Field>
          ))}
        </div>
      </CollapsibleSection>
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('Simulation Parameters')}
          info={t(
            'Number of Monte Carlo simulations; more is more accurate but slower (default 1000, max 10000)',
          )}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field>
            <FieldLabel htmlFor="go-sims">{t('Simulation Count')}</FieldLabel>
            <Input
              id="go-sims"
              type="number"
              min={100}
              max={10000}
              value={numSimulations}
              onChange={(e) => onNumSimulationsChange(Number(e.target.value))}
            />
          </Field>
        </div>
      </section>
    </>
  );
}
export function GoalOptimizerParamsPanel(props: GoalParamsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <GoalSettingsSection {...props} />
      <AssetConfigSection {...props} />
      <ConstraintsAndSimulation {...props} />
      <RunButton
        isLoading={props.isLoading}
        onClick={props.onRun}
        label={t('Start Optimization')}
        loadingLabel={t('Optimizing...')}
        size="lg"
      />
    </div>
  );
}
