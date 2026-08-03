import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  type InputProps,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/cards.js';
import { TickerTagInput } from '@/components/form/TickerTagInput.js';
import type { EfficientFrontierState, SolverType } from './OptimizerUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

function PercentInput(props: InputProps) {
  return (
    <div className="relative">
      <Input type="number" className="pr-8" {...props} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
        %
      </span>
    </div>
  );
}
function LabeledField({
  htmlFor,
  labelKey,
  children,
}: {
  htmlFor?: string;
  labelKey: string;
  children: React.ReactNode;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={htmlFor}>{labelKey}</FieldLabel>
      {children}
    </Field>
  );
}
function SectionHeader({ title, info }: { title: string; info?: string }) {
  return (
    <div>
      <div className="text-label font-semibold text-fg">{title}</div>
      {info && <div className="text-caption text-fg-tertiary">{info}</div>}
    </div>
  );
}

const OBJECTIVES = [
  { value: 'maxSharpe', labelKey: 'optimizer.maxSharpe' },
  { value: 'minVolatility', labelKey: 'optimizer.minVolatility' },
  { value: 'maxReturn', labelKey: 'optimizer.maxReturn' },
] as const;
const SOLVERS = [
  { value: 'markowitz', labelKey: 'optimizer.solverMarkowitz' },
  { value: 'ga', labelKey: 'optimizer.solverGA' },
] as const;

function SelectField<T extends string>({
  id,
  value,
  onChange,
  options,
  labelKey,
}: {
  id?: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; labelKey: string }[];
  labelKey: string;
}) {
  const { t } = useTranslation();
  return (
    <LabeledField htmlFor={id} labelKey={t(labelKey)}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {t(o.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LabeledField>
  );
}

function SwitchField({
  htmlFor,
  labelKey,
  checked,
  onCheckedChange,
}: {
  htmlFor: string;
  labelKey: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={htmlFor}>{t(labelKey)}</FieldLabel>
        <Switch id={htmlFor} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </Field>
  );
}

function TickerEditor({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const handleTagChange = (newTickers: string[]) => {
    const emptyRows = s.tickers.length - s.tickers.filter(Boolean).length;
    s.setTickers([...newTickers, ...Array(emptyRows).fill('')]);
  };
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('optimizer.assetSelection')}
        info={t('optimizer.assetSelectionInfo')}
      />
      <TickerTagInput
        tickers={s.tickers.filter(Boolean)}
        onChange={handleTagChange}
        minCount={2}
        placeholder={t('optimizer.tickerPlaceholder')}
      />
    </section>
  );
}

function GridField({
  id,
  labelKey,
  value,
  onChange,
  type,
  disabled,
  step,
  min,
  max,
}: {
  id: string;
  labelKey: string;
  value: string | number;
  onChange: (v: string) => void;
  type: 'date' | 'percent';
  disabled?: boolean;
  step?: number;
  min?: number;
  max?: number;
}) {
  const { t } = useTranslation();
  return (
    <LabeledField htmlFor={id} labelKey={t(labelKey)}>
      {type === 'date' ? (
        <Input
          id={id}
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <PercentInput
          id={id}
          step={step}
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </LabeledField>
  );
}

function SolverSettingsGrid({ s, allHistory }: { s: EfficientFrontierState; allHistory: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <SwitchField
        htmlFor="opt-all-history"
        labelKey="optimizer.allHistory"
        checked={allHistory}
        onCheckedChange={(checked) => {
          const [sd, ed] = checked ? ['', ''] : [DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE];
          s.setStartDate(sd);
          s.setEndDate(ed);
        }}
      />
      <GridField
        id="opt-start-date"
        labelKey="optimizer.startDate"
        value={s.startDate}
        onChange={s.setStartDate}
        type="date"
        disabled={allHistory}
      />
      <GridField
        id="opt-end-date"
        labelKey="optimizer.endDate"
        value={s.endDate}
        onChange={s.setEndDate}
        type="date"
        disabled={allHistory}
      />
      <GridField
        id="opt-min-weight"
        labelKey="optimizer.minWeight"
        value={s.minWeight}
        onChange={(v) => s.setMinWeight(Number(v))}
        type="percent"
        min={0}
        max={100}
      />
      <GridField
        id="opt-max-weight"
        labelKey="optimizer.maxWeight"
        value={s.maxWeight}
        onChange={(v) => s.setMaxWeight(Number(v))}
        type="percent"
        min={0}
        max={100}
      />
      <SelectField
        id="opt-objective"
        labelKey="optimizer.objective"
        value={s.objective}
        onChange={s.setObjective}
        options={OBJECTIVES}
      />
      <GridField
        id="opt-tbill"
        labelKey="optimizer.tbillRate"
        value={s.tbillRate}
        onChange={(v) => s.setTbillRate(Number(v))}
        type="percent"
        step={0.1}
      />
      <SelectField
        id="opt-solver"
        labelKey="optimizer.solver"
        value={s.solver}
        onChange={(v) => s.setSolver(v as SolverType)}
        options={SOLVERS}
      />
      <SwitchField
        htmlFor="opt-short"
        labelKey="optimizer.allowShort"
        checked={s.allowShort}
        onCheckedChange={s.setAllowShort}
      />
    </div>
  );
}

function SolverSettings({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const allHistory = s.startDate === '' && s.endDate === '';
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('optimizer.solverSettings')}
        info={t('optimizer.solverSettingsInfo')}
      />
      <SolverSettingsGrid s={s} allHistory={allHistory} />
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
      label: t('optimizer.maxDrawdownLT'),
      checked: s.enableMaxDD,
      onToggle: s.setEnableMaxDD,
      value: s.maxMaxDD,
      onValueChange: s.setMaxMaxDD,
      placeholder: t('optimizer.placeholderDD'),
    },
    {
      label: t('optimizer.cagrGT'),
      checked: s.enableMinCagr,
      onToggle: s.setEnableMinCagr,
      value: s.minCagr,
      onValueChange: s.setMinCagr,
      placeholder: t('optimizer.placeholderCagr'),
    },
    {
      label: t('optimizer.volatilityLT'),
      checked: s.enableMaxVol,
      onToggle: s.setEnableMaxVol,
      value: s.maxVol,
      onValueChange: s.setMaxVol,
      placeholder: t('optimizer.placeholderVol'),
    },
  ];
  return (
    <CollapsibleSection
      title={t('optimizer.historicalConstraints')}
      description={t('optimizer.historicalConstraintsInfo')}
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
      labelKey: 'optimizer.maxAvgDDLabel',
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
      title={t('optimizer.advancedConstraints')}
      description={t('optimizer.advancedConstraintsInfo')}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((f) => (
          <LabeledField key={f.labelKey} labelKey={t(f.labelKey)}>
            {f.percent ? (
              <PercentInput
                step={f.step}
                min={f.min}
                max={f.max}
                value={f.value}
                placeholder="-"
                onChange={(e) => f.setter(e.target.value)}
              />
            ) : (
              <Input
                type="number"
                step={f.step}
                min={f.min}
                max={f.max}
                value={f.value}
                placeholder="-"
                onChange={(e) => f.setter(e.target.value)}
              />
            )}
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
    ? t('optimizer.calculatingStats')
    : s.isLoading
      ? t('optimizer.optimizing')
      : t('optimizer.startCalc');
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
