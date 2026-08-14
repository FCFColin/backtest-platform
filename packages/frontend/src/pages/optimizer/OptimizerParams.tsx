import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { Button, Input, Switch } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/cards.js';
import { TickerTagInput } from '@/components/form/TickerTagInput.js';
import {
  SectionHeader,
  LabeledField,
  SelectField,
  PercentInput,
  SwitchField,
} from '@/components/form/sharedFields';
import type { EfficientFrontierState, SolverType } from './OptimizerUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

const OBJECTIVES = [
  { value: 'maxSharpe', labelKey: 'backtest.optimizer.maxSharpe' },
  { value: 'minVolatility', labelKey: 'Minimize Volatility' },
  { value: 'maxReturn', labelKey: 'optimizer.maxReturn' },
] as const;
const SOLVERS = [
  { value: 'markowitz', labelKey: 'optimizer.solverMarkowitz' },
  { value: 'ga', labelKey: 'optimizer.solverGA' },
] as const;

function TickerEditor({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Asset Selection')}
        info={t('Enter ticker symbols for optimization, at least two required')}
      />
      <TickerTagInput
        tickers={s.tickers.filter(Boolean)}
        onChange={s.setTickers}
        minCount={2}
        placeholder={t('Enter ticker, e.g. VTI')}
      />
    </section>
  );
}

const DATE_FIELDS = [
  {
    id: 'opt-start-date',
    labelKey: 'Start Date',
    get: (s: EfficientFrontierState) => s.startDate,
    set: (s: EfficientFrontierState, v: string) => s.setStartDate(v),
  },
  {
    id: 'opt-end-date',
    labelKey: 'End Date',
    get: (s: EfficientFrontierState) => s.endDate,
    set: (s: EfficientFrontierState, v: string) => s.setEndDate(v),
  },
];
const WEIGHT_FIELDS = [
  {
    id: 'opt-min-weight',
    labelKey: 'Min Weight',
    get: (s: EfficientFrontierState) => s.minWeight,
    set: (s: EfficientFrontierState, v: number) => s.setMinWeight(v),
  },
  {
    id: 'opt-max-weight',
    labelKey: 'Max Weight',
    get: (s: EfficientFrontierState) => s.maxWeight,
    set: (s: EfficientFrontierState, v: number) => s.setMaxWeight(v),
  },
];

function SolverSettings({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const allHistory = s.startDate === '' && s.endDate === '';
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Solver Settings')}
        info={t('Set optimization objective, weight constraints and solver')}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SwitchField
          id="opt-all-history"
          label={t('All History')}
          checked={allHistory}
          onCheckedChange={(checked) => {
            s.setStartDate(checked ? '' : DEFAULT_BACKTEST_START_DATE);
            s.setEndDate(checked ? '' : DEFAULT_END_DATE);
          }}
        />
        {DATE_FIELDS.map((f) => (
          <LabeledField key={f.id} htmlFor={f.id} label={t(f.labelKey)}>
            <Input
              id={f.id}
              type="date"
              value={f.get(s)}
              disabled={allHistory}
              onChange={(e) => f.set(s, e.target.value)}
            />
          </LabeledField>
        ))}
        <SelectField
          id="opt-objective"
          label={t('Objective')}
          value={s.objective}
          onChange={s.setObjective}
          options={OBJECTIVES.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        />
        {WEIGHT_FIELDS.map((f) => (
          <LabeledField key={f.id} htmlFor={f.id} label={t(f.labelKey)}>
            <PercentInput
              id={f.id}
              value={f.get(s)}
              min={0}
              max={100}
              onChange={(e) => f.set(s, Number(e.target.value))}
            />
          </LabeledField>
        ))}
        <LabeledField htmlFor="opt-tbill" label={t('T-Bill Rate')}>
          <PercentInput
            step={0.1}
            value={s.tbillRate}
            onChange={(e) => s.setTbillRate(Number(e.target.value))}
          />
        </LabeledField>
        <SelectField
          id="opt-solver"
          label={t('Solver')}
          value={s.solver}
          onChange={(v) => s.setSolver(v as SolverType)}
          options={SOLVERS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        />
        <SwitchField
          id="opt-short"
          label={t('Allow Short Selling')}
          checked={s.allowShort}
          onCheckedChange={s.setAllowShort}
        />
      </div>
    </section>
  );
}

function ConstraintField({
  label,
  checked,
  onToggle,
  value,
  onValueChange,
  placeholder,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <Switch checked={checked} onCheckedChange={onToggle} aria-label={label} />
      </div>
      <PercentInput
        step={0.1}
        value={value}
        disabled={!checked}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
      />
    </Field>
  );
}

function HistoricalConstraints({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const fields = [
    {
      label: t('Max Drawdown <'),
      checked: s.enableMaxDD,
      onToggle: s.setEnableMaxDD,
      value: s.maxMaxDD,
      onValueChange: s.setMaxMaxDD,
      placeholder: t('e.g. 20'),
    },
    {
      label: t('CAGR >'),
      checked: s.enableMinCagr,
      onToggle: s.setEnableMinCagr,
      value: s.minCagr,
      onValueChange: s.setMinCagr,
      placeholder: t('e.g. 5'),
    },
    {
      label: t('Volatility <'),
      checked: s.enableMaxVol,
      onToggle: s.setEnableMaxVol,
      value: s.maxVol,
      onValueChange: s.setMaxVol,
      placeholder: t('e.g. 15'),
    },
  ];
  return (
    <CollapsibleSection
      title={t('Historical Constraint Optimization')}
      description={t(
        'Filter conditions based on historical backtest metrics, only portfolios meeting constraints will be returned when enabled',
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((f) => (
          <ConstraintField key={f.label} {...f} />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function AdvancedConstraints({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const fields = [
    {
      labelKey: 'optimizer.minSharpeLabel',
      value: s.minSharpe,
      setter: s.setMinSharpe,
      step: 0.01,
    },
    {
      labelKey: 'optimizer.minSortinoLabel',
      value: s.minSortino,
      setter: s.setMinSortino,
      step: 0.01,
    },
    {
      labelKey: 'Max Avg DD',
      value: s.maxAvgDD,
      setter: s.setMaxAvgDD,
      percent: true,
      step: 0.1,
    },
    { labelKey: 'optimizer.maxHoldings', value: s.maxHoldings, setter: s.setMaxHoldings, min: 2 },
    {
      labelKey: 'optimizer.minWeightToInclude',
      value: s.minWeightToInclude,
      setter: s.setMinWeightToInclude,
      percent: true,
      min: 0,
      max: 100,
    },
  ];
  return (
    <CollapsibleSection
      title={t('Advanced Constraints')}
      description={t(
        'Other historical metric constraints and holding limits, leave empty for no limit',
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((f) => (
          <LabeledField key={f.labelKey} label={t(f.labelKey)}>
            <PercentInput
              showPercent={f.percent}
              step={f.step}
              min={f.min}
              max={f.max}
              value={f.value}
              placeholder="-"
              onChange={(e) => f.setter(e.target.value)}
            />
          </LabeledField>
        ))}
      </div>
    </CollapsibleSection>
  );
}

export function OptimizerParams({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const running = s.isLoading || s.isCalculatingStats;
  const btnLabel = s.isCalculatingStats
    ? t('Calculating backtest statistics...')
    : s.isLoading
      ? t('Optimizing...')
      : t('OPTIMIZE');
  return (
    <div className="flex flex-col gap-5">
      <TickerEditor s={s} />
      <SolverSettings s={s} />
      <HistoricalConstraints s={s} />
      <AdvancedConstraints s={s} />
      <div className="flex justify-end pt-1">
        <Button variant="primary" size="lg" disabled={running} onClick={() => void s.runOptimize()}>
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {btnLabel}
        </Button>
      </div>
    </div>
  );
}
