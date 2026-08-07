import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { LabeledField, RunButton, SelectField } from '@/components/form/sharedFields';
import { ParamSection } from './TacticalSignalEditor';
import { INDICATOR_OPTIONS } from './sharedTacticalConstants';
import { BacktestParamsFields } from './sharedBacktestParams';
import { OBJECTIVE_OPTIONS } from './tacticalGridUtils';
import type { IndicatorType, ObjectiveType, GridParamRange } from './tacticalGridUtils';
import type { TacticalGridState } from '@/hooks/useTacticalGridState';
const RANGE_FIELDS: { key: keyof GridParamRange; label: string; min?: number; step?: number }[] = [
  { key: 'min', label: 'Min' },
  { key: 'max', label: 'Max' },
  { key: 'step', label: 'backtest.optimizer.step', min: 0.1, step: 0.5 },
];
function ParamRangeRow({
  range,
  onChange,
  inputMin,
}: {
  range: GridParamRange;
  onChange: (v: GridParamRange) => void;
  inputMin?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2">
      {RANGE_FIELDS.map((f) => (
        <Field key={f.key}>
          <FieldLabel>{t(f.label)}</FieldLabel>
          <Input
            type="number"
            aria-label={t(f.label)}
            className="font-mono tabular-nums"
            value={range[f.key]}
            min={f.min ?? inputMin}
            step={f.step}
            onChange={(e) => onChange({ ...range, [f.key]: Number(e.target.value) })}
          />
        </Field>
      ))}
    </div>
  );
}
function SignalGridSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { indicator, setIndicator, param1, setParam1, param2, setParam2, paramLabels } = state;
  return (
    <ParamSection title={t('Signal Parameter Grid')}>
      <div className="flex flex-col gap-3">
        <SelectField
          label={t('Technical Indicator')}
          value={indicator}
          onChange={(v) => setIndicator(v as IndicatorType)}
          options={INDICATOR_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
        <Field>
          <FieldLabel>{paramLabels.p1}</FieldLabel>
          <ParamRangeRow range={param1} onChange={setParam1} inputMin={1} />
        </Field>
        <Field>
          <FieldLabel>{paramLabels.p2}</FieldLabel>
          <ParamRangeRow range={param2} onChange={setParam2} />
        </Field>
        <FieldDescription>
          {indicator === 'rsi'
            ? t('Enter when RSI falls below oversold threshold, exit when above 100-threshold')
            : t(
                'Enter when price breaks through MA±threshold%, exit when falls below MA∓threshold%',
              )}
        </FieldDescription>
      </div>
    </ParamSection>
  );
}
function BacktestParamsSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const {
    ticker,
    setTicker,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    rebalanceFrequency,
    setRebalanceFrequency,
  } = state;
  return (
    <BacktestParamsFields
      idPrefix="grid"
      startDate={startDate}
      setStartDate={setStartDate}
      endDate={endDate}
      setEndDate={setEndDate}
      startingValue={startingValue}
      setStartingValue={setStartingValue}
      rebalanceFrequency={rebalanceFrequency}
      setRebalanceFrequency={setRebalanceFrequency}
    >
      <LabeledField htmlFor="grid-ticker" label={t('Ticker')}>
        <Input
          id="grid-ticker"
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder={t('e.g. SPY')}
        />
      </LabeledField>
    </BacktestParamsFields>
  );
}
export function GridParamsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { objective, setObjective, isLoading, runSearch } = state;
  return (
    <div className="flex flex-col gap-4">
      <SignalGridSection state={state} />
      <BacktestParamsSection state={state} />
      <ParamSection title={t('Objective')}>
        <SelectField
          label={t('Objective')}
          value={objective}
          onChange={(v) => setObjective(v as ObjectiveType)}
          options={OBJECTIVE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
      </ParamSection>
      <RunButton
        isLoading={isLoading}
        onClick={runSearch}
        label={t('Start Grid Search')}
        loadingLabel={t('Searching...')}
      />
    </div>
  );
}
