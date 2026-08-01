import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import { Card } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import { Switch } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { BasicParamsRow } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { LoadingButton } from '../../components/ui/uiComponents.js';
import { useLumpSumVsDCAState } from '../../hooks/useLumpSumVsDCAState.js';
import type { DcaFrequency, LumpSumVsDCAState } from '../../hooks/useLumpSumVsDCAState.js';
import { LsDcaResultsCard } from './ConclusionSection.js';
import { fmtPct, fmtNum } from '@/utils/format';
const selectClassName =
  'flex h-10 w-full rounded-md border border-border bg-input-bg px-3 py-2 text-body text-fg transition-colors hover:border-border-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50';
function DcaParamsSection({
  dcaFrequency,
  setDcaFrequency,
  dcaPeriods,
  setDcaPeriods,
  startingValue,
  baseCurrency,
  investTbill,
  setInvestTbill,
}: {
  dcaFrequency: DcaFrequency;
  setDcaFrequency: (v: DcaFrequency) => void;
  dcaPeriods: number;
  setDcaPeriods: (v: number) => void;
  startingValue: number;
  baseCurrency: 'usd' | 'cny';
  investTbill: boolean;
  setInvestTbill: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const prefix = baseCurrency === 'usd' ? '$' : '¥';
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-caption font-semibold text-fg-tertiary">
        {t('lumpSumDca.dcaParams')}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="lumpsum-dca-frequency">{t('lumpSumDca.dcaFrequency')}</FieldLabel>
          <select
            id="lumpsum-dca-frequency"
            className={selectClassName}
            value={dcaFrequency}
            onChange={(e) => setDcaFrequency(e.target.value as DcaFrequency)}
          >
            <option value="monthly">{t('lumpSumDca.dcaMonthly')}</option>
            <option value="quarterly">{t('lumpSumDca.dcaQuarterly')}</option>
          </select>
        </Field>
        <Field>
          <FieldLabel>{t('lumpSumDca.dcaPeriods')}</FieldLabel>
          <div className="relative">
            <Input
              type="number"
              className="pr-10"
              value={dcaPeriods}
              onChange={(e) => setDcaPeriods(Number(e.target.value) || 1)}
              min={1}
              max={360}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption text-fg-tertiary">
              {t('lumpSumDca.dcaPeriodsUnit')}
            </span>
          </div>
        </Field>
        <Field>
          <FieldLabel>{t('lumpSumDca.perPeriodAmount')}</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-fg-tertiary">
              {prefix}
            </span>
            <Input
              type="text"
              className="pl-7 opacity-70"
              value={Math.round(startingValue / dcaPeriods).toLocaleString()}
              readOnly
            />
          </div>
        </Field>
        <div className="flex h-10 items-center gap-2">
          <Switch checked={investTbill} onCheckedChange={setInvestTbill} />
          <span className="text-caption text-fg-secondary">{t('lumpSumDca.investTbill')}</span>
        </div>
      </div>
    </div>
  );
}
function LumpSumVsDCAParamsForm({ state }: { state: LumpSumVsDCAState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <BasicParamsRow
        startDate={state.startDate}
        endDate={state.endDate}
        startingValue={state.startingValue}
        baseCurrency={state.baseCurrency}
        adjustForInflation={state.adjustForInflation}
        onChange={(field, value) => {
          if (field === 'startDate') state.setStartDate(value as string);
          else if (field === 'endDate') state.setEndDate(value as string);
          else if (field === 'startingValue') state.setStartingValue(value as number);
          else if (field === 'baseCurrency') state.setBaseCurrency(value as 'usd' | 'cny');
          else if (field === 'adjustForInflation') state.setAdjustForInflation(value as boolean);
        }}
      />
      <DcaParamsSection
        dcaFrequency={state.dcaFrequency}
        setDcaFrequency={state.setDcaFrequency}
        dcaPeriods={state.dcaPeriods}
        setDcaPeriods={state.setDcaPeriods}
        startingValue={state.startingValue}
        baseCurrency={state.baseCurrency}
        investTbill={state.investTbill}
        setInvestTbill={state.setInvestTbill}
      />
      <PortfolioEditor
        singleMode
        assets={state.assets}
        totalWeight={state.totalWeight}
        onAdd={state.addAsset}
        onRemove={state.removeAsset}
        onUpdate={state.updateAsset}
      />
      <LoadingButton
        isLoading={state.isLoading}
        onClick={state.runComparison}
        loadingText={t('lumpSumDca.comparing')}
        className="w-full"
      >
        <Play className="size-4" />
        {t('lumpSumDca.startCompare')}
      </LoadingButton>
    </div>
  );
}
function LumpSumVsDCAResults({ state }: { state: LumpSumVsDCAState }) {
  const { t } = useTranslation();
  const fmtMoney = (v: number) =>
    state.baseCurrency === 'usd'
      ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `¥${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <>
      {state.error && (
        <Card className="mb-3 p-6 text-center text-danger">
          {t('lumpSumDca.compareFailed')}: {state.error}
        </Card>
      )}
      <LsDcaResultsCard s={state} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={fmtMoney} />
    </>
  );
}
const config: ComputeToolConfig<LumpSumVsDCAState> = {
  titleKey: 'lumpSumDca.title',
  seoDescKey: 'lumpSumDca.seo.desc',
  seoFeatures: [
    { titleKey: 'lumpSumDca.seo.configurableTitle', descKey: 'lumpSumDca.seo.configurableDesc' },
    { titleKey: 'lumpSumDca.seo.strategyTitle', descKey: 'lumpSumDca.seo.strategyDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.rebalancingSensitivity', href: '/rebalancing-sensitivity' },
    { titleKey: 'nav.monteCarlo', href: '/monte-carlo' },
  ],
  paramsTitleKey: 'lumpSumDca.paramsSettings',
  params: ({ state }) => <LumpSumVsDCAParamsForm state={state} />,
  results: ({ state }) => <LumpSumVsDCAResults state={state} />,
};
export default function LumpSumVsDCAPage() {
  const { t } = useTranslation();
  const s = useLumpSumVsDCAState(t);
  return <ComputeToolShell config={config} state={s} />;
}
