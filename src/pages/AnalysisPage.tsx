/**
 * @file 资产分析页面
 * @description 对单个资产进行多维度分析，包括 Telltale 走势对比、相关性/Beta、滚动指标、风险收益散点及收益分布等
 * @route /analysis
 */
import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Play, Plus, X } from 'lucide-react';
import type { AssetAnalysisResult } from '../../shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiFetch } from '../utils/apiClient';
import LoadingButton from '../components/LoadingButton';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';
import {
  OverviewCharts,
  TelltaleChart,
  CorrelationMatrixTable,
  BetaMatrixTable,
  RollingCorrelationChart,
  RollingMetricsChart,
  RiskReturnChart,
  AnnualReturnsChart,
  MonthlyHeatmap,
} from '../components/AnalysisCharts';
import { StatsTable } from '../components/AnalysisStats';
import { useAnalysisData } from '../hooks/useAnalysisData';

// ===== Tab 定义 =====
const TABS = [
  { key: 'summary', labelKey: 'tabs.summary' },
  { key: 'telltale', labelKey: 'tabs.telltale' },
  { key: 'correlations', labelKey: 'tabs.correlationsBeta' },
  { key: 'rolling', labelKey: 'tabs.rollingMetrics' },
  { key: 'risk-return', labelKey: 'tabs.riskVsReturn' },
  { key: 'returns', labelKey: 'tabs.returns' },
];

// ===== 参数/结果面板子组件 =====

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

function AnalysisParamsPanel({
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
      <ParamsSection title={t('analysis.timeRange')}>
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

const AnalysisResultsPanel = memo(function AnalysisResultsPanel({
  error,
  results,
  activeTab,
  setActiveTab,
  isLoading,
  correlationWindow,
  rollingWindow,
}: {
  error: string | null;
  results: AssetAnalysisResult | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isLoading: boolean;
  correlationWindow: number;
  rollingWindow: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          {t('analysis.analysisFailed')}：{error}
        </div>
      )}
      {results && (
        <div className="card">
          <div className="result-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
          <div className="result-content">
            {activeTab === 'summary' && <SummaryTab results={results} />}
            {activeTab === 'telltale' && <TelltaleTab results={results} />}
            {activeTab === 'correlations' && (
              <CorrelationsBetaTab results={results} correlationWindow={correlationWindow} />
            )}
            {activeTab === 'rolling' && (
              <RollingMetricsTab results={results} rollingWindow={rollingWindow} />
            )}
            {activeTab === 'risk-return' && <RiskReturnTab results={results} />}
            {activeTab === 'returns' && <ReturnsTab results={results} />}
          </div>
        </div>
      )}
      {!results && !error && !isLoading && (
        <div
          className="card"
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
        >
          {t('analysis.noResultsHint')}
        </div>
      )}
    </div>
  );
});

// ===== Tab wrapper components =====
const SummaryTab = memo(function SummaryTab({ results }: { results: AssetAnalysisResult }) {
  return <OverviewCharts results={results} StatsTable={StatsTable} />;
});

const TelltaleTab = memo(function TelltaleTab({ results }: { results: AssetAnalysisResult }) {
  return <TelltaleChart results={results} />;
});

const CorrelationsBetaTab = memo(function CorrelationsBetaTab({
  results,
  correlationWindow,
}: {
  results: AssetAnalysisResult;
  correlationWindow: number;
}) {
  const [rollingPair, setRollingPair] = useState<[number, number]>([
    0,
    Math.min(1, results.tickers.length - 1),
  ]);
  const tickers = results.tickers.map((t) => t.ticker);
  const { betaMatrix, rollingCorrData } = useAnalysisData(results, correlationWindow, 12);

  return (
    <div className="space-y-6">
      <CorrelationMatrixTable tickers={results.tickers} correlations={results.correlations} />
      <BetaMatrixTable tickers={tickers} betaMatrix={betaMatrix} />
      {results.tickers.length >= 2 && (
        <RollingCorrelationChart
          tickers={tickers}
          rollingPair={rollingPair}
          setRollingPair={setRollingPair}
          rollingCorrData={rollingCorrData}
        />
      )}
    </div>
  );
});

const RollingMetricsTab = memo(function RollingMetricsTab({
  results,
  rollingWindow,
}: {
  results: AssetAnalysisResult;
  rollingWindow: number;
}) {
  return <RollingMetricsChart results={results} rollingWindow={rollingWindow} />;
});

const RiskReturnTab = memo(function RiskReturnTab({ results }: { results: AssetAnalysisResult }) {
  return <RiskReturnChart results={results} />;
});

const ReturnsTab = memo(function ReturnsTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <div className="space-y-6">
      <AnnualReturnsChart results={results} />
      <MonthlyHeatmap results={results} />
    </div>
  );
});

const SeoCard = memo(function SeoCard() {
  const { t } = useTranslation();
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">{t('analysis.seoDesc')}</p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">{t('analysis.seoAnalyzable')}</div>
          <div className="bt-seo-feature-desc">{t('analysis.seoAnalyzableDesc')}</div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">{t('analysis.seoViewable')}</div>
          <div className="bt-seo-feature-desc">{t('analysis.seoViewableDesc')}</div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">{t('analysis.relatedTools')}</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.portfolioBacktest')}
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          {t('optimizer.title')}
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>
          {t('nav.efficientFrontier')}
        </Link>
      </div>
    </div>
  );
});

// ===== 主页面 =====
export default function AnalysisPage() {
  const { t } = useTranslation();
  const [tickers, setTickers] = useState<string[]>(['SPY', 'TLT', 'GLD']);
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [startingValue, setStartingValue] = useState(10000);
  const [rollingWindow, setRollingWindow] = useState(12);
  const [correlationWindow, setCorrelationWindow] = useState(12);
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<AssetAnalysisResult | null>(null);

  const addTicker = () => setTickers([...tickers, '']);
  const removeTicker = (idx: number) => {
    if (tickers.length > 1) setTickers(tickers.filter((_, i) => i !== idx));
  };
  const updateTicker = (idx: number, val: string) => {
    const next = [...tickers];
    next[idx] = val;
    setTickers(next);
  };

  const runAnalysis = () => {
    const validTickers = tickers.filter(Boolean).map((t) => t.toUpperCase());
    if (validTickers.length === 0) {
      setError(t('analysis.errorMinOneTicker'));
      return;
    }
    run(() => fetchAnalysis(validTickers));
  };

  async function fetchAnalysis(validTickers: string[]) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);
    try {
      const res = await apiFetch('/api/backtest/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          tickers: validTickers,
          parameters: {
            startDate,
            endDate,
            startingValue,
            adjustForInflation,
            rollingWindowMonths: rollingWindow,
            correlationWindowMonths: correlationWindow,
            benchmarkTicker: '',
            baseCurrency: 'usd',
            extendedWithdrawalStats: false,
            cashflowLegs: [],
            oneTimeCashflows: [],
          },
        }),
      });
      let json: Record<string, unknown>;
      try {
        json = await res.json();
      } catch {
        throw new Error(t('dataEngine.serverAbnormal'));
      }
      throwIfError(res, json);
      const raw = (json.data ?? json) as Record<string, unknown>;
      setResults({
        tickers: (raw.tickers ?? raw.assets ?? []) as AssetAnalysisResult['tickers'],
        correlations: (raw.correlations ?? []) as number[][],
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError')
        throw new Error(t('dataEngine.connectionTimeout'));
      if (e instanceof TypeError && e.message.includes('fetch'))
        throw new Error(t('dataEngine.networkError'));
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function throwIfError(res: Response, json: Record<string, unknown>) {
    if (!res.ok) throw new Error(extractErrorDetail(json, `HTTP ${res.status}`));
    if (json.success === false)
      throw new Error(extractErrorDetail(json, t('analysis.analysisFailed')));
  }

  function extractErrorDetail(json: Record<string, unknown>, fallback: string): string {
    const err = json.error;
    if (typeof err === 'object' && err && 'detail' in err)
      return String((err as { detail?: string }).detail);
    if (typeof err === 'string') return err;
    return fallback;
  }

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('analysis.title')}</h1>
      </div>
      <SeoCard />
      <ToolPageLayout
        title={t('analysis.analysisParams')}
        params={
          <AnalysisParamsPanel
            tickers={tickers}
            addTicker={addTicker}
            removeTicker={removeTicker}
            updateTicker={updateTicker}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            startingValue={startingValue}
            setStartingValue={setStartingValue}
            rollingWindow={rollingWindow}
            setRollingWindow={setRollingWindow}
            correlationWindow={correlationWindow}
            setCorrelationWindow={setCorrelationWindow}
            adjustForInflation={adjustForInflation}
            setAdjustForInflation={setAdjustForInflation}
            isLoading={isLoading}
            runAnalysis={runAnalysis}
          />
        }
        results={
          <AnalysisResultsPanel
            error={error}
            results={results}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isLoading={isLoading}
            correlationWindow={correlationWindow}
            rollingWindow={rollingWindow}
          />
        }
      />
    </div>
  );
}
