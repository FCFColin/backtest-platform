import { useTranslation } from 'react-i18next';
import type { RebalanceFrequency } from '@backtest/shared';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { LabeledField, RunButton } from '@/components/form/sharedFields';
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
        <FieldLabel>{t('tacticalGrid.params.min')}</FieldLabel>
        <Input
          type="number"
          aria-label={t('tacticalGrid.params.min')}
          className="font-mono tabular-nums"
          value={range.min}
          min={inputMin}
          onChange={(e) => onChange({ ...range, min: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel>{t('tacticalGrid.params.max')}</FieldLabel>
        <Input
          type="number"
          aria-label={t('tacticalGrid.params.max')}
          className="font-mono tabular-nums"
          value={range.max}
          min={inputMin}
          onChange={(e) => onChange({ ...range, max: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel>{t('tacticalGrid.params.step')}</FieldLabel>
        <Input
          type="number"
          aria-label={t('tacticalGrid.params.step')}
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
    <ParamSection title={t('tacticalGrid.params.signalGrid')}>
      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel>{t('tacticalGrid.params.indicator')}</FieldLabel>
          <Select value={indicator} onValueChange={(v) => setIndicator(v as IndicatorType)}>
            <SelectTrigger aria-label={t('tacticalGrid.params.indicator')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDICATOR_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
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
            ? t('tacticalGrid.params.rsiHint')
            : t('tacticalGrid.params.breakoutHint')}
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
    <ParamSection title={t('tacticalGrid.params.backtestParams')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LabeledField htmlFor="grid-ticker" label={t('tacticalGrid.params.ticker')}>
          <Input
            id="grid-ticker"
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder={t('tacticalGrid.params.tickerPlaceholder')}
          />
        </LabeledField>
        <LabeledField htmlFor="grid-start-date" label={t('tacticalGrid.params.startDate')}>
          <Input
            id="grid-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </LabeledField>
        <LabeledField htmlFor="grid-end-date" label={t('tacticalGrid.params.endDate')}>
          <Input
            id="grid-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </LabeledField>
        <LabeledField htmlFor="grid-starting-value" label={t('tacticalGrid.params.startingValue')}>
          <Input
            id="grid-starting-value"
            type="number"
            min={100}
            className="font-mono tabular-nums"
            value={startingValue}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </LabeledField>
        <Field>
          <FieldLabel htmlFor="grid-rebalance">{t('tacticalGrid.params.rebalanceFreq')}</FieldLabel>
          <Select
            value={rebalanceFrequency}
            onValueChange={(v) => setRebalanceFrequency(v as RebalanceFrequency)}
          >
            <SelectTrigger id="grid-rebalance">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REBALANCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
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
      <ParamSection title={t('tacticalGrid.params.objectiveSection')}>
        <Field>
          <FieldLabel>{t('tacticalGrid.params.objective')}</FieldLabel>
          <Select value={objective} onValueChange={(v) => setObjective(v as ObjectiveType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJECTIVE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </ParamSection>
      <RunButton
        isLoading={isLoading}
        onClick={runSearch}
        label={t('tacticalGrid.params.startSearch')}
        loadingLabel={t('tacticalGrid.params.searching')}
      />
    </div>
  );
}
