import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Checkbox, Input, AffixInput } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { SectionHeader, SelectField, RunButton, DateField } from '@/components/form/sharedFields';
import { TickerTagInput } from '../../components/form/TickerTagInput.js';
import { AllHistoryCheckbox } from '@/components/params/toolFields.js';
import type { SolveSpeed, FrontierSolver, ReturnObjective } from './EfficientFrontierUtils.js';
import type { FrontierState } from './EfficientFrontierUtils.js';
const solveSpeedOptions = (t: TFunction): { value: SolveSpeed; label: string }[] => [
  { value: 'ultrafast', label: t('Ultra Fast') },
  { value: 'fast', label: t('Fast') },
  { value: 'medium', label: t('Medium') },
  { value: 'slow', label: t('Slow') },
];
const rebalanceFreqOptions = (t: TFunction): { value: string; label: string }[] => [
  { value: 'daily', label: t('Daily') },
  { value: 'weekly', label: t('Weekly') },
  { value: 'monthly', label: t('Monthly') },
  { value: 'quarterly', label: t('Quarterly') },
  { value: 'yearly', label: t('Annual') },
];
const returnObjOptions = (t: TFunction): { value: ReturnObjective; label: string }[] => [
  { value: 'maxCagr', label: t('backtest.optimizer.maxCagr') },
  { value: 'minVolatility', label: t('Minimize Volatility') },
];
const solverOptions = (t: TFunction): { value: FrontierSolver; label: string }[] => [
  { value: 'markowitz', label: t('Markowitz') },
  { value: 'nsga2', label: t('NSGA-II') },
];
interface FrontierParamsProps {
  state: FrontierState;
}
function TickerListSection({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t('Ticker List')} />
      <TickerTagInput
        tickers={s.tickers.filter(Boolean)}
        onChange={s.setTickers}
        minCount={2}
        placeholder={t('Enter ticker, e.g. VTI')}
      />
    </section>
  );
}
function DateAndPointsGrid({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DateField label={t('Start Date')} value={s.startDate} onChange={s.setStartDate} />
      <DateField label={t('End Date')} value={s.endDate} onChange={s.setEndDate} />
      <Field>
        <FieldLabel>{t('Sample Points')}</FieldLabel>
        <Input
          type="number"
          min={5}
          max={100}
          value={s.numPoints}
          onChange={(e) => s.setNumPoints(Number(e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel>{t('All History')}</FieldLabel>
        <AllHistoryCheckbox
          startDate={s.startDate}
          endDate={s.endDate}
          onStartDateChange={s.setStartDate}
          onEndDateChange={s.setEndDate}
          label={t('All History')}
        />
      </Field>
    </div>
  );
}
function AdvancedParamsGrid({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SelectField
        label={t('Solve Speed')}
        value={s.solveSpeed}
        onChange={s.setSolveSpeed}
        options={solveSpeedOptions(t)}
      />
      <Field>
        <FieldLabel>{t('Min Inclusion Weight')}</FieldLabel>
        <AffixInput
          type="number"
          min={0}
          max={100}
          suffix="%"
          value={s.minInclusionWeight}
          onChange={(e) => s.setMinInclusionWeight(Number(e.target.value))}
        />
      </Field>
      <SelectField
        label={t('Rebalancing Frequency')}
        value={s.rebalanceFrequency}
        onChange={s.setRebalanceFrequency}
        options={rebalanceFreqOptions(t)}
      />
      <SelectField
        label={t('Return Objective')}
        value={s.returnObjective}
        onChange={s.setReturnObjective}
        options={returnObjOptions(t)}
      />
      <SelectField
        label={t('Solver')}
        value={s.solver}
        onChange={s.setSolver}
        options={solverOptions(t)}
      />
      <Field>
        <FieldLabel>{t('Allow Cash Allocation')}</FieldLabel>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-label text-fg-secondary">
          <Checkbox checked={s.allowCash} onCheckedChange={(c) => s.setAllowCash(c === true)} />
          <span>{t('Allow Cash Allocation')}</span>
        </label>
      </Field>
    </div>
  );
}
function ParamsSection({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={t('Parameters')} />
      <DateAndPointsGrid s={s} />
      <AdvancedParamsGrid s={s} />
    </section>
  );
}
function FrontierParams({ state }: FrontierParamsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <TickerListSection s={state} />
      <ParamsSection s={state} />
      <RunButton
        isLoading={state.isLoading}
        onClick={state.runFrontier}
        label={t('Calculate Efficient Frontier')}
        loadingLabel={t('Calculating...')}
      />
    </div>
  );
}
export { FrontierParams };
export type { FrontierSolver, ReturnObjective };
