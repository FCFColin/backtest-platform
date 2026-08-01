import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import type { InputProps } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/uiComponents';
import { Switch } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
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
function SectionHeader({ title, info }: { title: string; info?: string }) {
  return (
    <div>
      <div className="text-label font-semibold text-fg">{title}</div>
      {info && <div className="text-caption text-fg-tertiary">{info}</div>}
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
function TickerEditor({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const handleTagChange = (newTickers: string[]) => {
    // 空行是占位（badge 渲染时过滤）：按非空列表重建，空行保持数量不变
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
const OBJECTIVES: { value: 'maxSharpe' | 'minVolatility' | 'maxReturn'; labelKey: string }[] = [
  { value: 'maxSharpe', labelKey: 'optimizer.maxSharpe' },
  { value: 'minVolatility', labelKey: 'optimizer.minVolatility' },
  { value: 'maxReturn', labelKey: 'optimizer.maxReturn' },
];
const SOLVERS: { value: 'markowitz' | 'ga'; labelKey: string }[] = [
  { value: 'markowitz', labelKey: 'optimizer.solverMarkowitz' },
  { value: 'ga', labelKey: 'optimizer.solverGA' },
];
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
  options: { value: T; labelKey: string }[];
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
function SolverDateAndObjectiveFields({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const allHistory = s.startDate === '' && s.endDate === '';
  const dateFields = [
    {
      id: 'opt-start-date',
      labelKey: 'optimizer.startDate',
      value: s.startDate,
      setter: s.setStartDate,
    },
    { id: 'opt-end-date', labelKey: 'optimizer.endDate', value: s.endDate, setter: s.setEndDate },
  ];
  return (
    <>
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="opt-all-history">{t('optimizer.allHistory')}</FieldLabel>
          <Switch
            id="opt-all-history"
            checked={allHistory}
            onCheckedChange={(checked) => {
              if (checked) {
                s.setStartDate('');
                s.setEndDate('');
              } else {
                s.setStartDate(DEFAULT_BACKTEST_START_DATE);
                s.setEndDate(DEFAULT_END_DATE);
              }
            }}
          />
        </div>
      </Field>
      {dateFields.map((f) => (
        <LabeledField key={f.id} htmlFor={f.id} labelKey={t(f.labelKey)}>
          <Input
            id={f.id}
            type="date"
            value={f.value}
            disabled={allHistory}
            onChange={(e) => f.setter(e.target.value)}
          />
        </LabeledField>
      ))}
      <SelectField
        id="opt-objective"
        labelKey="optimizer.objective"
        value={s.objective}
        onChange={s.setObjective}
        options={OBJECTIVES}
      />
    </>
  );
}
function SolverWeightsAndTypeFields({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const weightFields = [
    {
      id: 'opt-min-weight',
      labelKey: 'optimizer.minWeight',
      value: s.minWeight,
      setter: s.setMinWeight,
    },
    {
      id: 'opt-max-weight',
      labelKey: 'optimizer.maxWeight',
      value: s.maxWeight,
      setter: s.setMaxWeight,
    },
  ];
  return (
    <>
      {weightFields.map((f) => (
        <LabeledField key={f.id} htmlFor={f.id} labelKey={t(f.labelKey)}>
          <PercentInput
            id={f.id}
            value={f.value}
            min={0}
            max={100}
            onChange={(e) => f.setter(Number(e.target.value))}
          />
        </LabeledField>
      ))}
      <LabeledField htmlFor="opt-tbill" labelKey={t('optimizer.tbillRate')}>
        <PercentInput
          id="opt-tbill"
          step={0.1}
          value={s.tbillRate}
          onChange={(e) => s.setTbillRate(Number(e.target.value))}
        />
      </LabeledField>
      <SelectField
        id="opt-solver"
        labelKey="optimizer.solver"
        value={s.solver}
        onChange={(v) => s.setSolver(v as SolverType)}
        options={SOLVERS}
      />
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="opt-short">{t('optimizer.allowShort')}</FieldLabel>
          <Switch id="opt-short" checked={s.allowShort} onCheckedChange={s.setAllowShort} />
        </div>
      </Field>
    </>
  );
}
function SolverSettings({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('optimizer.solverSettings')}
        info={t('optimizer.solverSettingsInfo')}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SolverDateAndObjectiveFields s={s} />
        <SolverWeightsAndTypeFields s={s} />
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
// eslint-disable-next-line max-lines-per-function -- 合并页面内多区块渲染，内聚保留
function AdvancedConstraints({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const numericFields: {
    labelKey: string;
    value: string | number;
    setter: (v: string) => void;
    inputType?: 'number' | 'percent';
    step?: number;
    min?: number;
    max?: number;
  }[] = [
    {
      labelKey: 'optimizer.minSharpeLabel',
      value: s.minSharpe,
      setter: s.setMinSharpe,
      inputType: 'number',
      step: 0.01,
    },
    {
      labelKey: 'optimizer.minSortinoLabel',
      value: s.minSortino,
      setter: s.setMinSortino,
      inputType: 'number',
      step: 0.01,
    },
    {
      labelKey: 'optimizer.maxAvgDDLabel',
      value: s.maxAvgDD,
      setter: s.setMaxAvgDD,
      inputType: 'percent',
      step: 0.1,
    },
    {
      labelKey: 'optimizer.maxHoldings',
      value: s.maxHoldings,
      setter: s.setMaxHoldings,
      inputType: 'number',
      min: 2,
    },
    {
      labelKey: 'optimizer.minWeightToInclude',
      value: s.minWeightToInclude,
      setter: s.setMinWeightToInclude,
      inputType: 'percent',
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
        {numericFields.map((f) => (
          <LabeledField key={f.labelKey} labelKey={t(f.labelKey)}>
            {f.inputType === 'percent' ? (
              <PercentInput
                step={f.step}
                min={f.min}
                max={f.max}
                value={f.value as number}
                placeholder="-"
                onChange={(e) => f.setter(e.target.value)}
              />
            ) : (
              <Input
                type="number"
                step={f.step}
                min={f.min}
                max={f.max}
                value={f.value as number}
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
