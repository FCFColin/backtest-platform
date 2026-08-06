import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { LabeledField, RunButton, DateField } from '@/components/form/sharedFields';
import { cn } from '@/lib/utils';
import { LETFResultsPanel } from './LETFSlippageResults.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { useComputeTool } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import type { LETFResult } from '@backtest/shared';

function useLETFSlippageState() {
  const { t } = useTranslation();
  const [letfTicker, setLetfTicker] = useState('TQQQ');
  const [benchmarkTicker, setBenchmarkTicker] = useState('QQQ');
  const [leverage, setLeverage] = useState(3);
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<LETFResult>(
    async () =>
      apiPostJSON<LETFResult>(
        '/api/v1/letf/analyze',
        {
          letfTicker: letfTicker.trim(),
          benchmarkTicker: benchmarkTicker.trim(),
          leverage,
          startDate,
          endDate,
        },
        i18n.t('LETF slippage analysis failed'),
      ),
    () =>
      letfTicker.trim() && benchmarkTicker.trim()
        ? null
        : t('Please enter both the leveraged ETF and benchmark index symbols'),
  );
  return {
    letfTicker,
    benchmarkTicker,
    leverage,
    startDate,
    endDate,
    isLoading,
    error,
    results,
    setLetfTicker,
    setBenchmarkTicker,
    setLeverage,
    setStartDate,
    setEndDate,
    runAnalysis,
  };
}
type LETFState = ReturnType<typeof useLETFSlippageState>;

const LEVERAGE_OPTIONS = [2, 3] as const;
function LeverageSelector({
  leverage,
  onChange,
}: {
  leverage: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-10 gap-1.5">
      {LEVERAGE_OPTIONS.map((lev) => {
        const active = leverage === lev;
        return (
          <button
            key={lev}
            type="button"
            onClick={() => onChange(lev)}
            className={cn(
              'h-full rounded-md border px-5 text-body font-medium transition-colors duration-150',
              active
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border bg-input-bg text-fg-secondary hover:bg-hover',
            )}
          >
            {lev}x
          </button>
        );
      })}
    </div>
  );
}

function LETFParamsPanel({ state: s }: { state: LETFState }) {
  const { t } = useTranslation();
  const letfId = useId();
  const benchId = useId();
  const levId = useId();
  const startId = useId();
  const endId = useId();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <LabeledField htmlFor={letfId} label={t('Leveraged ETF')}>
          <Input
            id={letfId}
            type="text"
            value={s.letfTicker}
            onChange={(e) => s.setLetfTicker(e.target.value)}
            placeholder={t('e.g. TQQQ')}
          />
        </LabeledField>
        <LabeledField htmlFor={benchId} label={t('Benchmark Index')}>
          <Input
            id={benchId}
            type="text"
            value={s.benchmarkTicker}
            onChange={(e) => s.setBenchmarkTicker(e.target.value)}
            placeholder={t('e.g. QQQ')}
          />
        </LabeledField>
        <Field>
          <FieldLabel htmlFor={levId}>{t('Leverage Multiplier')}</FieldLabel>
          <LeverageSelector leverage={s.leverage} onChange={s.setLeverage} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <DateField
          id={startId}
          label={t('Start Date')}
          value={s.startDate}
          onChange={s.setStartDate}
        />
        <DateField id={endId} label={t('End Date')} value={s.endDate} onChange={s.setEndDate} />
      </div>
      <RunButton
        isLoading={s.isLoading}
        onClick={s.runAnalysis}
        label={t('Run Analysis')}
        loadingLabel={t('Analyzing...')}
      />
    </div>
  );
}

function LETFResultsWrapper({ state: s }: { state: LETFState }) {
  return (
    <LETFResultsPanel
      results={s.results}
      error={s.error}
      isLoading={s.isLoading}
      leverage={s.leverage}
    />
  );
}

const config: ComputeToolConfig<LETFState> = {
  titleKey: 'letf.title',
  seoDescKey: 'letf.seo.desc',
  seoFeatures: [
    { titleKey: 'letf.seo.analyzableTitle', descKey: 'letf.seo.analyzableDesc' },
    { titleKey: 'letf.seo.scenarioTitle', descKey: 'letf.seo.scenarioDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.pca', href: '/pca' },
  ],
  params: LETFParamsPanel,
  results: LETFResultsWrapper,
};
export default function LETFSlippagePage() {
  const s = useLETFSlippageState();
  return <ComputeToolShell config={config} state={s} />;
}
