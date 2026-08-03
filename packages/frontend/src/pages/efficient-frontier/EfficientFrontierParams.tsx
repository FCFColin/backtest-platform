import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Checkbox, Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { SectionHeader, SelectField, RunButton } from '@/components/form/sharedFields';
import { TickerTagInput } from '../../components/form/TickerTagInput.js';
import type { SolveSpeed, FrontierSolver, ReturnObjective } from './EfficientFrontierUtils.js';
import type { FrontierState } from './EfficientFrontierUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
const solveSpeedOptions = (t: TFunction): { value: SolveSpeed; label: string }[] => [
  { value: 'ultrafast', label: t('efficientFrontier.solveSpeed.ultrafast') },
  { value: 'fast', label: t('efficientFrontier.solveSpeed.fast') },
  { value: 'medium', label: t('efficientFrontier.solveSpeed.medium') },
  { value: 'slow', label: t('efficientFrontier.solveSpeed.slow') },
];
const rebalanceFreqOptions = (t: TFunction): { value: string; label: string }[] => [
  { value: 'daily', label: t('efficientFrontier.rebalanceFreq.daily') },
  { value: 'weekly', label: t('efficientFrontier.rebalanceFreq.weekly') },
  { value: 'monthly', label: t('efficientFrontier.rebalanceFreq.monthly') },
  { value: 'quarterly', label: t('efficientFrontier.rebalanceFreq.quarterly') },
  { value: 'yearly', label: t('efficientFrontier.rebalanceFreq.yearly') },
];
const returnObjOptions = (t: TFunction): { value: ReturnObjective; label: string }[] => [
  { value: 'maxCagr', label: t('efficientFrontier.returnObjective.maxCagr') },
  { value: 'minVolatility', label: t('efficientFrontier.returnObjective.minVolatility') },
];
const solverOptions = (t: TFunction): { value: FrontierSolver; label: string }[] => [
  { value: 'markowitz', label: t('efficientFrontier.solver.markowitz') },
  { value: 'nsga2', label: t('efficientFrontier.solver.nsga2') },
];
interface FrontierParamsProps {
  state: FrontierState;
}
function TickerListSection({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  const handleTagChange = (newTickers: string[]) => {
    const oldLen = s.tickers.length;
    if (newTickers.length > oldLen) {
      s.addTicker();
    } else if (newTickers.length < oldLen) {
      for (let i = 0; i < oldLen; i++) {
        if (!newTickers.includes(s.tickers[i])) {
          s.removeTicker(i);
          break;
        }
      }
    } else {
      newTickers.forEach((tk, i) => {
        if (tk !== s.tickers[i]) s.updateTicker(i, tk);
      });
    }
  };
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t('efficientFrontier.params.tickerList')} />
      <TickerTagInput
        tickers={s.tickers.filter(Boolean)}
        onChange={handleTagChange}
        minCount={2}
        placeholder={t('efficientFrontier.params.tickerPlaceholder')}
      />
    </section>
  );
}
function DateAndPointsGrid({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  const allHistoryChecked = s.startDate === '' && s.endDate === '';
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <FieldLabel>{t('efficientFrontier.params.startDate')}</FieldLabel>
        <Input type="date" value={s.startDate} onChange={(e) => s.setStartDate(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{t('efficientFrontier.params.endDate')}</FieldLabel>
        <Input type="date" value={s.endDate} onChange={(e) => s.setEndDate(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{t('efficientFrontier.params.numPoints')}</FieldLabel>
        <Input
          type="number"
          min={5}
          max={100}
          value={s.numPoints}
          onChange={(e) => s.setNumPoints(Number(e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel>{t('efficientFrontier.params.allHistory')}</FieldLabel>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-label text-fg-secondary">
          <Checkbox
            checked={allHistoryChecked}
            onCheckedChange={(c) => {
              if (c === true) {
                s.setStartDate('');
                s.setEndDate('');
              } else {
                s.setStartDate(DEFAULT_BACKTEST_START_DATE);
                s.setEndDate(DEFAULT_END_DATE);
              }
            }}
          />
          <span>{t('efficientFrontier.params.allHistory')}</span>
        </label>
      </Field>
    </div>
  );
}
function AdvancedParamsGrid({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SelectField
        label={t('efficientFrontier.params.solveSpeed')}
        value={s.solveSpeed}
        onChange={s.setSolveSpeed}
        options={solveSpeedOptions(t)}
      />
      <Field>
        <FieldLabel>{t('efficientFrontier.params.minInclusionWeight')}</FieldLabel>
        <div className="relative">
          <Input
            type="number"
            min={0}
            max={100}
            className="pr-9"
            value={s.minInclusionWeight}
            onChange={(e) => s.setMinInclusionWeight(Number(e.target.value))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            %
          </span>
        </div>
      </Field>
      <SelectField
        label={t('efficientFrontier.params.rebalanceFreq')}
        value={s.rebalanceFrequency}
        onChange={s.setRebalanceFrequency}
        options={rebalanceFreqOptions(t)}
      />
      <SelectField
        label={t('efficientFrontier.params.returnObjective')}
        value={s.returnObjective}
        onChange={s.setReturnObjective}
        options={returnObjOptions(t)}
      />
      <SelectField
        label={t('efficientFrontier.params.solver')}
        value={s.solver}
        onChange={s.setSolver}
        options={solverOptions(t)}
      />
      <Field>
        <FieldLabel>{t('efficientFrontier.params.allowCash')}</FieldLabel>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-label text-fg-secondary">
          <Checkbox checked={s.allowCash} onCheckedChange={(c) => s.setAllowCash(c === true)} />
          <span>{t('efficientFrontier.params.allowCash')}</span>
        </label>
      </Field>
    </div>
  );
}
function ParamsSection({ s }: { s: FrontierState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={t('efficientFrontier.params.title')} />
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
        label={t('efficientFrontier.params.calcFrontier')}
        loadingLabel={t('efficientFrontier.params.calculating')}
      />
    </div>
  );
}
export { FrontierParams };
export type { FrontierSolver, ReturnObjective };
