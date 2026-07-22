import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, X } from 'lucide-react';
import LoadingButton from '../../components/LoadingButton.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

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
        <span
          key={idx}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium"
          style={{
            background: 'var(--support-soft)',
            color: 'var(--support)',
            border: '1px solid var(--support)',
          }}
        >
          {ticker.toUpperCase()}
          <button
            onClick={() => {
              const validTickers = tickers.filter(Boolean);
              const originalIdx = tickers.indexOf(ticker);
              setTickers(
                validTickers.length <= 1 ? [''] : tickers.filter((_, i) => i !== originalIdx),
              );
            }}
            className="hover:opacity-70 inline-flex items-center"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
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
        className="param-input"
        style={{ width: 120, height: 28, padding: '0 8px', fontSize: 13 }}
      />
    </div>
  );
}

function AnalysisDateRange({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <label className="param-check">
        <input
          type="checkbox"
          checked={startDate === '' && endDate === ''}
          onChange={(e) => {
            if (e.target.checked) {
              setStartDate('');
              setEndDate('');
            } else {
              setStartDate(DEFAULT_BACKTEST_START_DATE);
              setEndDate(DEFAULT_END_DATE);
            }
          }}
        />
        <span>{t('optimizer.allHistory')}</span>
      </label>
      <div className="param-field" style={{ width: 150 }}>
        <label className="param-label">{t('analysis.startDate')}</label>
        <input
          type="date"
          className="param-input"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <div className="param-field" style={{ width: 150 }}>
        <label className="param-label">{t('analysis.endDate')}</label>
        <input
          type="date"
          className="param-input"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
    </>
  );
}

export function AnalysisParamsPanel({
  tickers,
  setTickers,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  startingValue,
  setStartingValue,
  rollingWindow,
  setRollingWindow,
  correlationWindow,
  setCorrelationWindow,
  adjustForInflation,
  setAdjustForInflation,
  isLoading,
  runAnalysis,
}: {
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
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 px-2 pb-3 pt-2">
      <TickerInput tickers={tickers} setTickers={setTickers} />
      <div className="params-row">
        <AnalysisDateRange
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
        />
        <div className="param-field param-field-start-val">
          <label className="param-label">{t('analysis.startingValue')}</label>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={startingValue}
              onChange={(e) => setStartingValue(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="param-field param-field-rolling">
          <label className="param-label">{t('analysis.rollingWindow')}</label>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={rollingWindow}
              onChange={(e) => setRollingWindow(Number(e.target.value))}
            />
            <span className="param-input-suffix">{t('common.months')}</span>
          </div>
        </div>
        <div className="param-field param-field-rolling">
          <label className="param-label">{t('analysis.correlationWindow')}</label>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={correlationWindow}
              onChange={(e) => setCorrelationWindow(Number(e.target.value))}
            />
            <span className="param-input-suffix">{t('common.months')}</span>
          </div>
        </div>
        <label className="param-toggle">
          <span>{t('analysis.adjustInflation')}</span>
          <div
            className={`toggle-switch ${adjustForInflation ? 'active' : ''}`}
            onClick={() => setAdjustForInflation(!adjustForInflation)}
          />
        </label>
      </div>
      <div
        className="flex items-center justify-between pt-3"
        style={{ borderTop: '1px solid var(--border-soft)' }}
      >
        <LoadingButton
          isLoading={isLoading}
          onClick={runAnalysis}
          loadingText={t('analysis.analyzing')}
          className="btn-primary px-5 h-9 font-semibold rounded inline-flex items-center gap-2 text-sm"
        >
          <Play className="w-4 h-4" /> {t('analysis.startAnalysis')}
        </LoadingButton>
      </div>
    </div>
  );
}
