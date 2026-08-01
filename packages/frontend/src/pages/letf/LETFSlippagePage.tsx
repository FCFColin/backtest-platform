import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { Field, FieldLabel } from '@/components/form/Field';
import { Input } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
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
        i18n.t('letf.errAnalyze'),
      ),
    () => (letfTicker.trim() && benchmarkTicker.trim() ? null : t('letf.errEmptyTickers')),
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
interface LETFState {
  letfTicker: string;
  benchmarkTicker: string;
  leverage: number;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  error: string | null;
  results: LETFResult | null;
  setLetfTicker: (t: string) => void;
  setBenchmarkTicker: (t: string) => void;
  setLeverage: (n: number) => void;
  setStartDate: (d: string) => void;
  setEndDate: (d: string) => void;
  runAnalysis: () => void;
}
interface LETFParamsProps {
  letfTicker: string;
  benchmarkTicker: string;
  leverage: number;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onLetfTickerChange: (v: string) => void;
  onBenchmarkTickerChange: (v: string) => void;
  onLeverageChange: (v: number) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}
const LEVERAGE_OPTIONS = [2, 3] as const;
interface LeverageSelectorProps {
  leverage: number;
  onChange: (v: number) => void;
}
function LeverageSelector({ leverage, onChange }: LeverageSelectorProps) {
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
              'h-full rounded-md border px-5 text-body font-medium',
              'transition-colors duration-150',
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
function LetfTickerGrid({
  letfTicker,
  benchmarkTicker,
  leverage,
  onLetfTickerChange,
  onBenchmarkTickerChange,
  onLeverageChange,
}: Pick<
  LETFParamsProps,
  | 'letfTicker'
  | 'benchmarkTicker'
  | 'leverage'
  | 'onLetfTickerChange'
  | 'onBenchmarkTickerChange'
  | 'onLeverageChange'
>) {
  const { t } = useTranslation();
  const letfId = useId();
  const benchId = useId();
  const levId = useId();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Field>
        <FieldLabel htmlFor={letfId}>{t('letf.etf.letfTicker')}</FieldLabel>
        <Input
          id={letfId}
          type="text"
          value={letfTicker}
          onChange={(e) => onLetfTickerChange(e.target.value)}
          placeholder={t('letf.etf.letfTickerPlaceholder')}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={benchId}>{t('letf.etf.benchmarkTicker')}</FieldLabel>
        <Input
          id={benchId}
          type="text"
          value={benchmarkTicker}
          onChange={(e) => onBenchmarkTickerChange(e.target.value)}
          placeholder={t('letf.etf.benchmarkTickerPlaceholder')}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={levId}>{t('letf.etf.leverage')}</FieldLabel>
        <LeverageSelector leverage={leverage} onChange={onLeverageChange} />
      </Field>
    </div>
  );
}
function LETFParamsPanel({
  startDate,
  endDate,
  isLoading,
  onStartDateChange,
  onEndDateChange,
  onRun,
  ...rest
}: LETFParamsProps) {
  const { t } = useTranslation();
  const startId = useId();
  const endId = useId();
  return (
    <div className="flex flex-col gap-4">
      <LetfTickerGrid {...rest} />
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor={startId}>{t('letf.dateRange.startDate')}</FieldLabel>
          <Input
            id={startId}
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={endId}>{t('letf.dateRange.endDate')}</FieldLabel>
          <Input
            id={endId}
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button variant="primary" onClick={onRun} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('letf.analyzing')}
            </>
          ) : (
            <>
              <Play className="size-4" />
              {t('letf.startAnalysis')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
function LETFParamsWrapper({ state }: { state: LETFState }) {
  return (
    <LETFParamsPanel
      letfTicker={state.letfTicker}
      benchmarkTicker={state.benchmarkTicker}
      leverage={state.leverage}
      startDate={state.startDate}
      endDate={state.endDate}
      isLoading={state.isLoading}
      onLetfTickerChange={state.setLetfTicker}
      onBenchmarkTickerChange={state.setBenchmarkTicker}
      onLeverageChange={state.setLeverage}
      onStartDateChange={state.setStartDate}
      onEndDateChange={state.setEndDate}
      onRun={state.runAnalysis}
    />
  );
}
function LETFResultsWrapper({ state }: { state: LETFState }) {
  return (
    <LETFResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
      leverage={state.leverage}
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
  params: LETFParamsWrapper,
  results: LETFResultsWrapper,
};
export default function LETFSlippagePage() {
  const s = useLETFSlippageState();
  return <ComputeToolShell config={config} state={s} />;
}
