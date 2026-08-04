import { useTranslation } from 'react-i18next';
import type { RebalanceFrequency } from '@backtest/shared';
import { Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { LabeledField, RunButton, SelectField } from '@/components/form/sharedFields';
import { ParamSection } from './TacticalSignalEditor';
import { INDICATOR_OPTIONS, REBALANCE_OPTIONS } from './sharedTacticalConstants';
import { OBJECTIVE_OPTIONS } from './tacticalGridUtils';
import type { IndicatorType, ObjectiveType, GridParamRange } from './tacticalGridUtils';
import type { TacticalGridState } from '@/hooks/useTacticalGridState';
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
      <Field>
        <FieldLabel>{t('Min')}</FieldLabel>
        <Input
          type="number"
          aria-label={t('Min')}
          className="font-mono tabular-nums"
          value={range.min}
          min={inputMin}
          onChange={(e) => onChange({ ...range, min: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel>{t('Max')}</FieldLabel>
        <Input
          type="number"
          aria-label={t('Max')}
          className="font-mono tabular-nums"
          value={range.max}
          min={inputMin}
          onChange={(e) => onChange({ ...range, max: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel>{t('Step')}</FieldLabel>
        <Input
          type="number"
          aria-label={t('Step')}
          className="font-mono tabular-nums"
          value={range.step}
          min={0.1}
          step={0.5}
          onChange={(e) => onChange({ ...range, step: Number(e.target.value) })}
        />
      </Field>
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
    <ParamSection title={t('Backtest Parameters')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LabeledField htmlFor="grid-ticker" label={t('Ticker')}>
          <Input
            id="grid-ticker"
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder={t('e.g. SPY')}
          />
        </LabeledField>
        <LabeledField htmlFor="grid-start-date" label={t('Start Date')}>
          <Input
            id="grid-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </LabeledField>
        <LabeledField htmlFor="grid-end-date" label={t('End Date')}>
          <Input
            id="grid-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </LabeledField>
        <LabeledField htmlFor="grid-starting-value" label={t('Initial Capital')}>
          <Input
            id="grid-starting-value"
            type="number"
            min={100}
            className="font-mono tabular-nums"
            value={startingValue}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </LabeledField>
        <SelectField
          id="grid-rebalance"
          label={t('Rebalancing Frequency')}
          value={rebalanceFrequency}
          onChange={(v) => setRebalanceFrequency(v as RebalanceFrequency)}
          options={REBALANCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
      </div>
    </ParamSection>
  );
}
export function GridParamsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { objective, setObjective, isLoading, runSearch } = state;
  return (
    <div className="flex flex-col gap-4">
      <SignalGridSection state={state} />
      <BacktestParamsSection state={state} />
      <ParamSection title={t('Optimization Objective')}>
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
