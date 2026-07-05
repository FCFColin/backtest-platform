/** @file Asset analysis params panel */
import { useTranslation } from 'react-i18next';
import { Play, Plus, X } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../ParamsPanel';
import LoadingButton from '../LoadingButton';

function TickerListSection({
  tickers,
  addTicker,
  removeTicker,
  updateTicker,
}: {
  tickers: string[];
  addTicker: () => void;
  removeTicker: (idx: number) => void;
  updateTicker: (idx: number, val: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('analysis.tickers')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tickers.map((ticker, i) => (
          <div key={i} className="ticker-row">
            <input
              type="text"
              className="ticker-input"
              value={ticker}
              onChange={(e) => updateTicker(i, e.target.value)}
              placeholder="输入代码，如 SPY"
            />
            <button
              onClick={() => removeTicker(i)}
              className="row-remove-btn"
              title={t('common.remove')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button className="toolbar-btn" onClick={addTicker}>
          <Plus className="w-4 h-4" /> {t('analysis.addTicker')}
        </button>
      </div>
    </ParamsSection>
  );
}

export function AnalysisParamsPanel({
  tickers,
  addTicker,
  removeTicker,
  updateTicker,
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
  addTicker: () => void;
  removeTicker: (idx: number) => void;
  updateTicker: (idx: number, val: string) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  startingValue: number;
  setStartingValue: (n: number) => void;
  rollingWindow: number;
  setRollingWindow: (n: number) => void;
  correlationWindow: number;
  setCorrelationWindow: (n: number) => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (b: boolean) => void;
  isLoading: boolean;
  runAnalysis: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <TickerListSection
        tickers={tickers}
        addTicker={addTicker}
        removeTicker={removeTicker}
        updateTicker={updateTicker}
      />
      <ParamsSection title={t('analysis.dateRange')}>
        <div className="params-grid">
          <div className="param-field">
            <span className="param-label">{t('analysis.startDate')}</span>
            <input
              type="date"
              className="param-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="param-field">
            <span className="param-label">{t('analysis.endDate')}</span>
            <input
              type="date"
              className="param-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </ParamsSection>
      <ParamsSection title={t('analysis.investmentParams')}>
        <div className="params-grid">
          <div className="param-field">
            <span className="param-label">{t('analysis.startingValue')}</span>
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
          <label className="param-check">
            <input
              type="checkbox"
              checked={adjustForInflation}
              onChange={(e) => setAdjustForInflation(e.target.checked)}
            />
            <span>{t('analysis.adjustForInflation')}</span>
          </label>
        </div>
      </ParamsSection>
      <ParamsSection title={t('analysis.rollingWindow')}>
        <div className="params-grid">
          <div className="param-field">
            <span className="param-label">{t('analysis.rollingMonths')}</span>
            <input
              type="number"
              className="param-input"
              value={rollingWindow}
              onChange={(e) => setRollingWindow(Number(e.target.value))}
            />
          </div>
          <div className="param-field">
            <span className="param-label">{t('analysis.correlationMonths')}</span>
            <input
              type="number"
              className="param-input"
              value={correlationWindow}
              onChange={(e) => setCorrelationWindow(Number(e.target.value))}
            />
          </div>
        </div>
      </ParamsSection>
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <LoadingButton
          onClick={runAnalysis}
          isLoading={isLoading}
          className="main-action-btn"
          style={{ width: '100%' }}
        >
          {isLoading ? (
            <span>{t('analysis.analyzing')}</span>
          ) : (
            <>
              <Play className="w-4 h-4" /> {t('analysis.run')}
            </>
          )}
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}
