/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslation } from 'react-i18next';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';
import { BasicParamsRow, PortfolioEditor } from '../../components/ParamsShared.js';
import { Play } from 'lucide-react';
import LoadingButton from '../../components/LoadingButton.js';
import { useLumpSumVsDCAState } from '../../hooks/useLumpSumVsDCAState.js';
import type { DcaFrequency } from '../../hooks/useLumpSumVsDCAState.js';
import { LsDcaResultsCard } from './ConclusionSection.js';
import { fmtPct, fmtNum } from '@/utils/format';
import { ParamRow, ParamCard } from '../../components/params/index.js';

type LSState = any;

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
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        {t('lumpSumDca.dcaParams')}
      </div>
      <ParamRow>
        <ParamCard label={t('lumpSumDca.dcaFrequency')}>
          <select
            className="param-input"
            value={dcaFrequency}
            onChange={(e) => setDcaFrequency(e.target.value as DcaFrequency)}
          >
            <option value="monthly">{t('lumpSumDca.dcaMonthly')}</option>
            <option value="quarterly">{t('lumpSumDca.dcaQuarterly')}</option>
          </select>
        </ParamCard>
        <ParamCard label={t('lumpSumDca.dcaPeriods')}>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={dcaPeriods}
              onChange={(e) => setDcaPeriods(Number(e.target.value) || 1)}
              min={1}
              max={360}
            />
            <span className="param-input-suffix">{t('lumpSumDca.dcaPeriodsUnit')}</span>
          </div>
        </ParamCard>
        <ParamCard label={t('lumpSumDca.perPeriodAmount')}>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">{baseCurrency === 'usd' ? '$' : '¥'}</span>
            <input
              type="text"
              className="param-input param-input-with-prefix"
              value={Math.round(startingValue / dcaPeriods).toLocaleString()}
              readOnly
              style={{ opacity: 0.7 }}
            />
          </div>
        </ParamCard>
        <ParamCard label={t('lumpSumDca.investTbill')}>
          <label className="param-check">
            <input
              type="checkbox"
              checked={investTbill}
              onChange={(e) => setInvestTbill(e.target.checked)}
            />
            <span>{t('lumpSumDca.investTbill')}</span>
          </label>
        </ParamCard>
      </ParamRow>
    </div>
  );
}

function ParamsSection1(props: {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  baseCurrency: 'usd' | 'cny';
  setBaseCurrency: (v: 'usd' | 'cny') => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  dcaFrequency: DcaFrequency;
  setDcaFrequency: (v: DcaFrequency) => void;
  dcaPeriods: number;
  setDcaPeriods: (v: number) => void;
  investTbill: boolean;
  setInvestTbill: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="params-section">
      <div className="params-title">{t('lumpSumDca.paramsSettings')}</div>
      <BasicParamsRow
        startDate={props.startDate}
        endDate={props.endDate}
        startingValue={props.startingValue}
        baseCurrency={props.baseCurrency}
        adjustForInflation={props.adjustForInflation}
        onChange={(field, value) => {
          if (field === 'startDate') props.setStartDate(value as string);
          else if (field === 'endDate') props.setEndDate(value as string);
          else if (field === 'startingValue') props.setStartingValue(value as number);
          else if (field === 'baseCurrency') props.setBaseCurrency(value as 'usd' | 'cny');
          else if (field === 'adjustForInflation') props.setAdjustForInflation(value as boolean);
        }}
      />
      <DcaParamsSection
        dcaFrequency={props.dcaFrequency}
        setDcaFrequency={props.setDcaFrequency}
        dcaPeriods={props.dcaPeriods}
        setDcaPeriods={props.setDcaPeriods}
        startingValue={props.startingValue}
        baseCurrency={props.baseCurrency}
        investTbill={props.investTbill}
        setInvestTbill={props.setInvestTbill}
      />
    </div>
  );
}

function LSParamsWrapper({ state }: { state: LSState }) {
  const { t } = useTranslation();
  return (
    <>
      <ParamsSection1
        startDate={state.startDate}
        setStartDate={state.setStartDate}
        endDate={state.endDate}
        setEndDate={state.setEndDate}
        startingValue={state.startingValue}
        setStartingValue={state.setStartingValue}
        baseCurrency={state.baseCurrency}
        setBaseCurrency={state.setBaseCurrency}
        adjustForInflation={state.adjustForInflation}
        setAdjustForInflation={state.setAdjustForInflation}
        dcaFrequency={state.dcaFrequency}
        setDcaFrequency={state.setDcaFrequency}
        dcaPeriods={state.dcaPeriods}
        setDcaPeriods={state.setDcaPeriods}
        investTbill={state.investTbill}
        setInvestTbill={state.setInvestTbill}
      />
      <PortfolioEditor
        assets={state.assets}
        totalWeight={state.totalWeight}
        onAdd={state.addAsset}
        onRemove={state.removeAsset}
        onUpdate={state.updateAsset}
      />
      <div className="bt-action-row">
        <LoadingButton
          isLoading={state.isLoading}
          onClick={state.runComparison}
          loadingText={t('lumpSumDca.comparing')}
          style={{ width: '100%' }}
        >
          <Play className="w-4 h-4" />
          {t('lumpSumDca.startCompare')}
        </LoadingButton>
      </div>
    </>
  );
}

function LSResultsWrapper({ state }: { state: LSState }) {
  const { t } = useTranslation();
  const fmtMoney = (v: number) =>
    state.baseCurrency === 'usd'
      ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `¥${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <>
      {state.error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
        >
          {t('lumpSumDca.compareFailed')}: {state.error}
        </div>
      )}
      <LsDcaResultsCard s={state} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={fmtMoney} />
    </>
  );
}

const config: ComputeToolConfig<LSState> = {
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
  params: LSParamsWrapper,
  results: LSResultsWrapper,
};

export default function LumpSumVsDCAPage() {
  const { t } = useTranslation();
  const s = useLumpSumVsDCAState(t);
  return <ComputeToolShell config={config} state={s} />;
}
