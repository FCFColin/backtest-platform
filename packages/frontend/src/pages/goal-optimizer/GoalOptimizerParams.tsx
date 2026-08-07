import { useTranslation } from 'react-i18next';
import { Input, AffixInput } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/cards.js';
import {
  SectionHeader,
  PercentInput,
  DollarInput,
  RunButton,
} from '@/components/form/sharedFields';
import type { GoalOptimizerState } from '@/hooks/useGoalOptimizerState.js';
import SinglePortfolioEditor from '@/components/PortfolioEditor.js';
function GoalSettingsSection({
  targetAmount,
  initialAmount,
  years,
  setTargetAmount,
  setInitialAmount,
  setYears,
}: Pick<
  GoalOptimizerState,
  'targetAmount' | 'initialAmount' | 'years' | 'setTargetAmount' | 'setInitialAmount' | 'setYears'
>) {
  const { t } = useTranslation();
  const dollarFields = [
    {
      id: 'go-target',
      label: t('Target Amount'),
      value: targetAmount,
      onChange: setTargetAmount,
    },
    {
      id: 'go-initial',
      label: t('Initial Amount'),
      value: initialAmount,
      onChange: setInitialAmount,
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
          <AffixInput
            id="go-years"
            type="number"
            min={1}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            suffix={t('y')}
          />
        </Field>
      </div>
    </section>
  );
}
function AssetConfigSection({ state }: { state: GoalOptimizerState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Asset Allocation')}
        info={t('Add tickers and weights; total weight must equal 100%')}
      />
      <SinglePortfolioEditor
        singleMode
        assets={state.assets}
        totalWeight={state.totalWeight}
        onAdd={state.addAsset}
        onRemove={state.removeAsset}
        onUpdate={state.updateAsset}
        wrapInSection={false}
      />
    </section>
  );
}
type ConstraintProps = Pick<
  GoalOptimizerState,
  | 'maxDrawdown'
  | 'minSuccessRate'
  | 'maxVolatility'
  | 'numSimulations'
  | 'setMaxDrawdown'
  | 'setMinSuccessRate'
  | 'setMaxVolatility'
  | 'setNumSimulations'
>;
function ConstraintsAndSimulation({
  maxDrawdown,
  minSuccessRate,
  maxVolatility,
  numSimulations,
  setMaxDrawdown,
  setMinSuccessRate,
  setMaxVolatility,
  setNumSimulations,
}: ConstraintProps) {
  const { t } = useTranslation();
  const numOrEmpty = (v: string) => (v === '' ? '' : Number(v));
  const constraints = [
    {
      id: 'go-maxdd',
      label: t('Max Drawdown Limit'),
      value: maxDrawdown,
      onChange: setMaxDrawdown,
    },
    {
      id: 'go-minsr',
      label: t('Min Success Rate'),
      value: minSuccessRate,
      onChange: setMinSuccessRate,
    },
    {
      id: 'go-maxvol',
      label: t('Max Vol'),
      value: maxVolatility,
      onChange: setMaxVolatility,
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
              onChange={(e) => setNumSimulations(Number(e.target.value))}
            />
          </Field>
        </div>
      </section>
    </>
  );
}
export function GoalOptimizerParamsPanel({ state }: { state: GoalOptimizerState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <GoalSettingsSection {...state} />
      <AssetConfigSection state={state} />
      <ConstraintsAndSimulation {...state} />
      <RunButton
        isLoading={state.isLoading}
        onClick={state.runOptimize}
        label={t('Start Optimization')}
        loadingLabel={t('Optimizing...')}
        size="lg"
      />
    </div>
  );
}
