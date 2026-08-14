import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import {
  Card,
  Switch,
  AffixInput,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { BasicParamsRow } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { LoadingButton } from '../../components/ui/uiComponents.js';
import { useLumpSumVsDCAState } from '../../hooks/useLumpSumVsDCAState.js';
import type { DcaFrequency, LumpSumVsDCAState } from '../../hooks/useLumpSumVsDCAState.js';
import { LsDcaResultsCard } from './ConclusionSection.js';
import { fmtPct, fmtNum } from '@/utils/format';
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
        {t('DCA Parameters')}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="lumpsum-dca-frequency">{t('DCA Frequency')}</FieldLabel>
          <Select value={dcaFrequency} onValueChange={(v) => setDcaFrequency(v as DcaFrequency)}>
            <SelectTrigger id="lumpsum-dca-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              <SelectItem value="monthly">{t('Monthly')}</SelectItem>
              <SelectItem value="quarterly">{t('Quarterly')}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t('DCA Periods')}</FieldLabel>
          <AffixInput
            type="number"
            value={dcaPeriods}
            onChange={(e) => setDcaPeriods(Number(e.target.value) || 1)}
            min={1}
            max={360}
            suffix={t('periods')}
          />
        </Field>
        <Field>
          <FieldLabel>{t('Per-Period Amount')}</FieldLabel>
          <AffixInput
            type="text"
            prefix={prefix}
            className="opacity-70"
            value={Math.round(startingValue / dcaPeriods).toLocaleString()}
            readOnly
          />
        </Field>
        <div className="flex h-10 items-center gap-2">
          <Switch checked={investTbill} onCheckedChange={setInvestTbill} />
          <span className="text-caption text-fg-secondary">
            {t('Put uninvested funds in T-Bill')}
          </span>
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
        loadingText={t('Comparing...')}
        className="w-full"
      >
        <Play className="size-4" />
        {t('Start Comparison')}
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
          {t('Comparison failed')}: {state.error}
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
  params: ({ state }) => <LumpSumVsDCAParamsForm state={state} />,
  results: ({ state }) => <LumpSumVsDCAResults state={state} />,
};
export default function LumpSumVsDCAPage() {
  const { t } = useTranslation();
  const s = useLumpSumVsDCAState(t);
  return <ComputeToolShell config={config} state={s} />;
}
