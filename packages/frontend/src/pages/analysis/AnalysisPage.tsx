/**
 * @file 资产分析页面
 * @description 对单个资产进行多维度分析，包括 Telltale 走势对比、相关性/Beta、滚动指标、风险收益散点及收益分布等
 * @route /analysis
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '@backtest/shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiFetch } from '../utils/apiClient';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { SeoCard, AnalysisResultsPanel } from '../components/analysis/AnalysisCharts.js';
import { AnalysisParamsPanel } from '../components/analysis/AnalysisParamsPanel.js';

// ===== Panel components in components/analysis/AnalysisParamsPanel.tsx =====

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
