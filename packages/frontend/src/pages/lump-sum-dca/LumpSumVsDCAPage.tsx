/**
 * @file 一次性投入 vs 定投对比页面
 * @description 对比一次性投入（Lump Sum）与定投（DCA）策略在不同标的下的收益与风险指标
 * @route /lumpsum-vs-dca
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { BasicParamsRow, PortfolioEditor } from '../../components/ParamsShared.js';
import { Play } from 'lucide-react';
import LoadingButton from '../../components/LoadingButton.js';
import { useLumpSumVsDCAState } from '../../hooks/useLumpSumVsDCAState.js';
import type { DcaFrequency } from '../../hooks/useLumpSumVsDCAState.js';
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
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        {t('lumpSumDca.dcaParams')}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="param-field" style={{ width: 120 }}>
          <label className="param-label">{t('lumpSumDca.dcaFrequency')}</label>
          <select
            className="param-input"
            value={dcaFrequency}
            onChange={(e) => setDcaFrequency(e.target.value as DcaFrequency)}
          >
            <option value="monthly">{t('lumpSumDca.dcaMonthly')}</option>
            <option value="quarterly">{t('lumpSumDca.dcaQuarterly')}</option>
          </select>
        </div>
        <div className="param-field" style={{ width: 100 }}>
          <label className="param-label">{t('lumpSumDca.dcaPeriods')}</label>
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
        </div>
        <div className="param-field" style={{ width: 140 }}>
          <label className="param-label">{t('lumpSumDca.perPeriodAmount')}</label>
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
        </div>
        <label className="param-check">
          <input
            type="checkbox"
            checked={investTbill}
            onChange={(e) => setInvestTbill(e.target.checked)}
          />
          <span>{t('lumpSumDca.investTbill')}</span>
        </label>
      </div>
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

function buildLumpSumDcaSeoProps(t: TFunction) {
  return {
    desc: t('lumpSumDca.seo.desc'),
    features: [
      {
        title: t('lumpSumDca.seo.configurableTitle'),
        desc: t('lumpSumDca.seo.configurableDesc'),
      },
      {
        title: t('lumpSumDca.seo.strategyTitle'),
        desc: t('lumpSumDca.seo.strategyDesc'),
      },
    ],
    related: [
      { title: t('nav.portfolioBacktest'), href: '/' },
      { title: t('nav.rebalancingSensitivity'), href: '/rebalancing-sensitivity' },
      { title: t('nav.monteCarlo'), href: '/monte-carlo' },
    ],
  };
}

export default function LumpSumVsDCAPage() {
  const { t } = useTranslation();
  const s = useLumpSumVsDCAState(t);
  const fmtMoney = (v: number) =>
    s.baseCurrency === 'usd'
      ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `¥${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('lumpSumDca.title')}</h1>
      </div>
      <ToolSeoCard {...buildLumpSumDcaSeoProps(t)} />
      <ToolPageLayout
        title={t('lumpSumDca.paramsSettings')}
        params={
          <>
            <ParamsSection1
              startDate={s.startDate}
              setStartDate={s.setStartDate}
              endDate={s.endDate}
              setEndDate={s.setEndDate}
              startingValue={s.startingValue}
              setStartingValue={s.setStartingValue}
              baseCurrency={s.baseCurrency}
              setBaseCurrency={s.setBaseCurrency}
              adjustForInflation={s.adjustForInflation}
              setAdjustForInflation={s.setAdjustForInflation}
              dcaFrequency={s.dcaFrequency}
              setDcaFrequency={s.setDcaFrequency}
              dcaPeriods={s.dcaPeriods}
              setDcaPeriods={s.setDcaPeriods}
              investTbill={s.investTbill}
              setInvestTbill={s.setInvestTbill}
            />
            <PortfolioEditor
              assets={s.assets}
              totalWeight={s.totalWeight}
              onAdd={s.addAsset}
              onRemove={s.removeAsset}
              onUpdate={s.updateAsset}
            />
            <div className="bt-action-row">
              <LoadingButton
                isLoading={s.isLoading}
                onClick={s.runComparison}
                loadingText={t('lumpSumDca.comparing')}
                style={{ width: '100%' }}
              >
                <Play className="w-4 h-4" />
                {t('lumpSumDca.startCompare')}
              </LoadingButton>
            </div>
          </>
        }
        results={
          <>
            {s.error && (
              <div
                className="bt-results-card card"
                style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
              >
                {t('lumpSumDca.compareFailed')}: {s.error}
              </div>
            )}
            <LsDcaResultsCard s={s} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={fmtMoney} />
          </>
        }
      />
    </div>
  );
}
