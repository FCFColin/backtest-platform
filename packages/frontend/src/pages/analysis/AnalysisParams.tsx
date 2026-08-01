import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, X } from 'lucide-react';
import { LoadingButton } from '../../components/ui/uiComponents.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { Field, FieldLabel } from '@/components/form/Field';
import { Input } from '@/components/ui/uiComponents';
import { Switch } from '@/components/ui/uiComponents';
import { Badge } from '@/components/ui/uiComponents';
import { buttonVariants } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
function TickerInput({
  tickers,
  setTickers,
}: {
  tickers: string[];
  setTickers: (v: string[]) => void;
}) {
  const { t } = useTranslation();
  const [newTicker, setNewTicker] = useState('');
  const commitNewTicker = () => {
    const raw = newTicker.trim();
    if (!raw) return;
    const parts = raw
      .toUpperCase()
      .split(/[,\s]+/)
      .filter(Boolean);
    const existing = new Set(tickers.filter(Boolean));
    const uniqueNew = parts.filter((s) => !existing.has(s));
    if (uniqueNew.length === 0) {
      setNewTicker('');
      return;
    }
    setTickers([...tickers.filter(Boolean), ...uniqueNew]);
    setNewTicker('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tickers.filter(Boolean).map((ticker, idx) => (
        <Badge key={idx} variant="asset" className="py-1">
          {ticker.toUpperCase()}
          <button
            type="button"
            onClick={() => {
              const valid = tickers.filter(Boolean);
              const oi = tickers.indexOf(ticker);
              setTickers(valid.length <= 1 ? [''] : tickers.filter((_, i) => i !== oi));
            }}
            className="ml-0.5 inline-flex items-center justify-center rounded-sm p-0.5 text-current opacity-60 transition-colors duration-150 ease-out-quart hover:bg-brand/20 hover:opacity-100"
            aria-label={t('common.remove')}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        type="text"
        value={newTicker}
        onChange={(e) => setNewTicker(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitNewTicker();
          }
        }}
        onBlur={commitNewTicker}
        placeholder={t('analysis.tickerPlaceholder')}
        className={cn(
          'flex h-8 w-32 rounded-md bg-input-bg border border-border px-2 py-1 text-label text-fg',
          'placeholder:text-fg-tertiary hover:border-border-strong',
          'focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15',
          'transition-colors duration-150',
        )}
      />
    </div>
  );
}
interface AnalysisParamsPanelProps {
  tickers: string[];
  setTickers: (v: string[]) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  rollingWindow: number;
  setRollingWindow: (v: number) => void;
  correlationWindow: number;
  setCorrelationWindow: (v: number) => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  isLoading: boolean;
  runAnalysis: () => void;
}
type DateProps = Pick<
  AnalysisParamsPanelProps,
  'startDate' | 'endDate' | 'setStartDate' | 'setEndDate'
>;
function AnalysisDateFields({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  allHistory,
}: DateProps & { allHistory: boolean }) {
  const { t } = useTranslation();
  const dateFields = [
    {
      id: 'analysis-start-date',
      label: t('analysis.startDate'),
      value: startDate,
      onChange: setStartDate,
    },
    { id: 'analysis-end-date', label: t('analysis.endDate'), value: endDate, onChange: setEndDate },
  ];
  return (
    <>
      <Field>
        <div className="flex items-center gap-2">
          <Switch
            id="analysis-all-history"
            checked={allHistory}
            onCheckedChange={(checked) => {
              if (checked) {
                setStartDate('');
                setEndDate('');
              } else {
                setStartDate(DEFAULT_BACKTEST_START_DATE);
                setEndDate(DEFAULT_END_DATE);
              }
            }}
          />
          <FieldLabel htmlFor="analysis-all-history" className="text-label text-fg">
            {t('optimizer.allHistory')}
          </FieldLabel>
        </div>
      </Field>
      {dateFields.map((f) => (
        <Field key={f.id}>
          <FieldLabel htmlFor={f.id}>{f.label}</FieldLabel>
          <Input
            id={f.id}
            type="date"
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            disabled={allHistory}
          />
        </Field>
      ))}
    </>
  );
}
type NumProps = Pick<
  AnalysisParamsPanelProps,
  | 'startingValue'
  | 'setStartingValue'
  | 'rollingWindow'
  | 'setRollingWindow'
  | 'correlationWindow'
  | 'setCorrelationWindow'
>;
function AnalysisNumericFields({
  startingValue,
  setStartingValue,
  rollingWindow,
  setRollingWindow,
  correlationWindow,
  setCorrelationWindow,
}: NumProps) {
  const { t } = useTranslation();
  const monthFields = [
    {
      id: 'analysis-rolling-window',
      label: t('analysis.rollingWindow'),
      value: rollingWindow,
      onChange: setRollingWindow,
    },
    {
      id: 'analysis-correlation-window',
      label: t('analysis.correlationWindow'),
      value: correlationWindow,
      onChange: setCorrelationWindow,
    },
  ];
  return (
    <>
      <Field>
        <FieldLabel htmlFor="analysis-starting-value">{t('analysis.startingValue')}</FieldLabel>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary">
            $
          </span>
          <Input
            id="analysis-starting-value"
            type="number"
            className="pl-7"
            value={startingValue}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </div>
      </Field>
      {monthFields.map((f) => (
        <Field key={f.id}>
          <FieldLabel htmlFor={f.id}>{f.label}</FieldLabel>
          <div className="relative">
            <Input
              id={f.id}
              type="number"
              className="pr-14"
              value={f.value}
              onChange={(e) => f.onChange(Number(e.target.value))}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
              {t('common.months')}
            </span>
          </div>
        </Field>
      ))}
    </>
  );
}
type RunProps = Pick<
  AnalysisParamsPanelProps,
  'adjustForInflation' | 'setAdjustForInflation' | 'isLoading' | 'runAnalysis'
>;
function AnalysisInflationAndRun({
  adjustForInflation,
  setAdjustForInflation,
  isLoading,
  runAnalysis,
}: RunProps) {
  const { t } = useTranslation();
  return (
    <>
      <Field>
        <div className="flex items-center gap-2">
          <Switch
            id="analysis-adjust-inflation"
            checked={adjustForInflation}
            onCheckedChange={setAdjustForInflation}
          />
          <FieldLabel htmlFor="analysis-adjust-inflation" className="text-label text-fg">
            {t('analysis.adjustInflation')}
          </FieldLabel>
        </div>
      </Field>
      <div className="flex justify-end sm:col-span-1 lg:col-span-2">
        <LoadingButton
          isLoading={isLoading}
          onClick={runAnalysis}
          loadingText={t('analysis.analyzing')}
          className={buttonVariants({ variant: 'primary', size: 'default' })}
        >
          <Play className="size-4" /> {t('analysis.startAnalysis')}
        </LoadingButton>
      </div>
    </>
  );
}
export function AnalysisParamsPanel(props: AnalysisParamsPanelProps) {
  const allHistory = props.startDate === '' && props.endDate === '';
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end">
      <Field className="sm:col-span-2 lg:col-span-3">
        <TickerInput tickers={props.tickers} setTickers={props.setTickers} />
      </Field>
      <AnalysisDateFields
        startDate={props.startDate}
        endDate={props.endDate}
        setStartDate={props.setStartDate}
        setEndDate={props.setEndDate}
        allHistory={allHistory}
      />
      <AnalysisNumericFields
        startingValue={props.startingValue}
        setStartingValue={props.setStartingValue}
        rollingWindow={props.rollingWindow}
        setRollingWindow={props.setRollingWindow}
        correlationWindow={props.correlationWindow}
        setCorrelationWindow={props.setCorrelationWindow}
      />
      <AnalysisInflationAndRun
        adjustForInflation={props.adjustForInflation}
        setAdjustForInflation={props.setAdjustForInflation}
        isLoading={props.isLoading}
        runAnalysis={props.runAnalysis}
      />
    </div>
  );
}
