/**
 * @file 资产分析参数面板子组件
 * @description 承载 Ticker 列表、时间范围、分析设置与执行按钮
 */
import { useTranslation } from 'react-i18next';
import { Play, Plus, X } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import LoadingButton from '../../components/LoadingButton.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

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
    <ParamsSection title={t('analysis.tickerList')} info={t('analysis.tickerListInfo')}>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {tickers.map((ticker, idx) => (
            <div key={idx} className="ticker-row">
              <input
                type="text"
                value={ticker}
                onChange={(e) => updateTicker(idx, e.target.value)}
                placeholder={t('analysis.tickerPlaceholder')}
                className="ticker-input"
              />
              {tickers.length > 1 && (
                <button
                  onClick={() => removeTicker(idx)}
                  className="row-remove-btn"
                  title={t('common.delete')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={addTicker} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" />
        {t('analysis.addAsset')}
      </button>
    </ParamsSection>
  );
}

function TimeRangeSection({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  startingValue,
  setStartingValue,
  t,
}: {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  t: (k: string) => string;
}) {
  return (
    <ParamsSection title={t('analysis.timeRange')}>
      <div className="params-row">
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
      </div>
      <div className="params-row">
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
      <div className="param-field param-field-start-val" style={{ marginTop: 8 }}>
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
    </ParamsSection>
  );
}

function AnalysisSettingsSection({
  rollingWindow,
  setRollingWindow,
  correlationWindow,
  setCorrelationWindow,
  adjustForInflation,
  setAdjustForInflation,
  t,
}: {
  rollingWindow: number;
  setRollingWindow: (v: number) => void;
  correlationWindow: number;
  setCorrelationWindow: (v: number) => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  t: (k: string) => string;
}) {
  return (
    <ParamsSection title={t('analysis.analysisSettings')}>
      <div className="params-row">
        <div className="param-field param-field-rolling">
          <span className="param-label">{t('analysis.rollingWindow')}</span>
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
          <span className="param-label">{t('analysis.correlationWindow')}</span>
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
      </div>
      <label className="param-toggle" style={{ marginTop: 12 }}>
        <span>{t('analysis.adjustInflation')}</span>
        <div
          className={`toggle-switch ${adjustForInflation ? 'active' : ''}`}
          onClick={() => setAdjustForInflation(!adjustForInflation)}
        />
      </label>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
        {adjustForInflation ? t('analysis.inflationOnHint') : t('analysis.inflationOffHint')}
      </div>
    </ParamsSection>
  );
}

/** 资产分析参数面板（Ticker + 时间范围 + 分析设置 + 执行按钮） */
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
    <ParamsPanel>
      <TickerListSection
        tickers={tickers}
        addTicker={addTicker}
        removeTicker={removeTicker}
        updateTicker={updateTicker}
      />
      <TimeRangeSection
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        startingValue={startingValue}
        setStartingValue={setStartingValue}
        t={t}
      />
      <AnalysisSettingsSection
        rollingWindow={rollingWindow}
        setRollingWindow={setRollingWindow}
        correlationWindow={correlationWindow}
        setCorrelationWindow={setCorrelationWindow}
        adjustForInflation={adjustForInflation}
        setAdjustForInflation={setAdjustForInflation}
        t={t}
      />
      <div className="bt-action-row">
        <LoadingButton
          isLoading={isLoading}
          onClick={runAnalysis}
          loadingText={t('analysis.analyzing')}
        >
          <Play className="w-4 h-4" />
          {t('analysis.startAnalysis')}
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}
