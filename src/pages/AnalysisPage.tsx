/**
 * @file 资产分析页面
 * @description 对单个资产进行多维度分析，包括 Telltale 走势对比、相关性/Beta、滚动指标、风险收益散点及收益分布等
 * @route /analysis
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Play, Plus, X } from 'lucide-react';
import { TRADING_DAYS_PER_YEAR } from '../../shared/constants';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, ZAxis, LabelList,
} from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { AssetAnalysisResult, Statistics } from '../../shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';

// ===== Tab 定义 =====
const TABS = [
  { key: 'summary', labelKey: 'tabs.summary' },
  { key: 'telltale', labelKey: 'tabs.telltale' },
  { key: 'correlations', labelKey: 'tabs.correlationsBeta' },
  { key: 'rolling', labelKey: 'tabs.rollingMetrics' },
  { key: 'risk-return', labelKey: 'tabs.riskVsReturn' },
  { key: 'returns', labelKey: 'tabs.returns' },
];

// ===== 工具函数 =====

/** 从日收益率计算滚动指标 */
function computeRollingMetric(
  dailyReturns: number[],
  dates: string[],
  windowDays: number,
  metric: 'cagr' | 'volatility' | 'skewness' | 'kurtosis' | 'kelly',
): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  if (dailyReturns.length < windowDays) return result;

  for (let i = windowDays; i <= dailyReturns.length; i++) {
    const window = dailyReturns.slice(i - windowDays, i);
    const dateIdx = i; // dailyReturns[i] 对应 growthCurve[i+1] 的日期
    if (dateIdx >= dates.length) continue;

    let value = 0;
    switch (metric) {
      case 'cagr': {
        let cumProd = 1;
        for (const r of window) cumProd *= (1 + r);
        const years = windowDays / TRADING_DAYS_PER_YEAR;
        value = Math.pow(cumProd, 1 / years) - 1;
        break;
      }
      case 'volatility': {
        const mean = window.reduce((s, r) => s + r, 0) / window.length;
        const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (window.length - 1);
        value = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
        break;
      }
      case 'skewness': {
        const n = window.length;
        const mean = window.reduce((s, r) => s + r, 0) / n;
        const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
        if (variance === 0) { value = 0; break; }
        const stdev = Math.sqrt(variance);
        const sumCubed = window.reduce((s, r) => s + ((r - mean) / stdev) ** 3, 0);
        value = (n / ((n - 1) * (n - 2))) * sumCubed;
        break;
      }
      case 'kurtosis': {
        const n = window.length;
        if (n < 4) { value = 0; break; }
        const mean = window.reduce((s, r) => s + r, 0) / n;
        const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
        if (variance === 0) { value = 0; break; }
        const stdev = Math.sqrt(variance);
        const sumFourth = window.reduce((s, r) => s + ((r - mean) / stdev) ** 4, 0);
        value = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sumFourth
          - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
        break;
      }
      case 'kelly': {
        const mean = window.reduce((s, r) => s + r, 0) / window.length;
        const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (window.length - 1);
        value = variance > 0 ? mean / variance : 0;
        break;
      }
    }
    result.push({ date: dates[dateIdx], value });
  }
  return result;
}

/** 计算滚动超额收益（相对第一个资产） */
function computeRollingExcessReturn(
  dailyReturns: number[],
  benchmarkDailyReturns: number[],
  dates: string[],
  windowDays: number,
): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  const n = Math.min(dailyReturns.length, benchmarkDailyReturns.length);
  if (n < windowDays) return result;

  for (let i = windowDays; i <= n; i++) {
    const wAsset = dailyReturns.slice(i - windowDays, i);
    const wBench = benchmarkDailyReturns.slice(i - windowDays, i);
    const dateIdx = i;
    if (dateIdx >= dates.length) continue;

    let cumAsset = 1, cumBench = 1;
    for (let j = 0; j < wAsset.length; j++) {
      cumAsset *= (1 + wAsset[j]);
      cumBench *= (1 + wBench[j]);
    }
    const years = windowDays / TRADING_DAYS_PER_YEAR;
    const cagrAsset = Math.pow(cumAsset, 1 / years) - 1;
    const cagrBench = Math.pow(cumBench, 1 / years) - 1;
    result.push({ date: dates[dateIdx], value: cagrAsset - cagrBench });
  }
  return result;
}

/** 计算Beta矩阵 */
function computeBetaMatrix(
  allReturns: number[][],
): number[][] {
  const n = allReturns.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else {
        const br = allReturns[j];
        const pr = allReturns[i];
        const len = Math.min(pr.length, br.length);
        if (len < 2) { matrix[i][j] = 0; continue; }
        const meanP = pr.slice(0, len).reduce((s, v) => s + v, 0) / len;
        const meanB = br.slice(0, len).reduce((s, v) => s + v, 0) / len;
        let cov = 0, varB = 0;
        for (let k = 0; k < len; k++) {
          cov += (pr[k] - meanP) * (br[k] - meanB);
          varB += (br[k] - meanB) ** 2;
        }
        matrix[i][j] = varB > 0 ? cov / varB : 0;
      }
    }
  }
  return matrix;
}

/** 计算滚动相关性 */
function computeRollingCorrelation(
  returns1: number[],
  returns2: number[],
  dates: string[],
  windowDays: number,
): Array<{ date: string; value: number }> {
  const result: Array<{ date: string; value: number }> = [];
  const n = Math.min(returns1.length, returns2.length);
  if (n < windowDays) return result;

  for (let i = windowDays; i <= n; i++) {
    const r1 = returns1.slice(i - windowDays, i);
    const r2 = returns2.slice(i - windowDays, i);
    const dateIdx = i;
    if (dateIdx >= dates.length) continue;

    const mean1 = r1.reduce((s, v) => s + v, 0) / r1.length;
    const mean2 = r2.reduce((s, v) => s + v, 0) / r2.length;
    let cov = 0, var1 = 0, var2 = 0;
    for (let j = 0; j < r1.length; j++) {
      const d1 = r1[j] - mean1;
      const d2 = r2[j] - mean2;
      cov += d1 * d2;
      var1 += d1 * d1;
      var2 += d2 * d2;
    }
    const corr = (var1 > 0 && var2 > 0) ? cov / Math.sqrt(var1 * var2) : 0;
    result.push({ date: dates[dateIdx], value: corr });
  }
  return result;
}

// ===== 热力图配色 =====
function getCorrelationColor(val: number): string {
  if (val >= 0) {
    if (val >= 0.8) return '#1a7a3a';
    if (val >= 0.6) return '#2e8b57';
    if (val >= 0.4) return '#6abf7e';
    if (val >= 0.2) return '#b8e0c4';
    return 'var(--bg-subtle)';
  } else {
    if (val <= -0.8) return '#8b2020';
    if (val <= -0.6) return '#b04040';
    if (val <= -0.4) return '#d47070';
    if (val <= -0.2) return '#f0c8c8';
    return 'var(--bg-subtle)';
  }
}

function getHeatColor(val: number | null): string {
  if (val === null) return 'var(--bg-subtle)';
  if (val > 5) return '#1a7a3a';
  if (val > 2) return '#2e8b57';
  if (val > 0) return '#8bc9a3';
  if (val > -1) return '#f5d5d5';
  if (val > -2) return '#e8a0a0';
  if (val > -5) return '#d47070';
  return '#c94a4a';
}

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

// ===== Summary Tab =====
function SummaryTab({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const portfolioResults = useMemo(() =>
    (results?.tickers ?? []).map((tk) => ({
      name: tk.ticker, growthCurve: tk.growthCurve, drawdownCurve: tk.drawdownCurve,
      rollingReturns: tk.rollingReturns, annualReturns: tk.annualReturns, monthlyReturns: tk.monthlyReturns,
      statistics: tk.statistics as Statistics,
    })), [results]);

  // 统计表列定义
  const summaryCols: { key: keyof Statistics; label: string; fmt: 'pct' | 'ratio' | 'duration' }[] = [
    { key: 'cagr', label: 'CAGR', fmt: 'pct' },
    { key: 'maxDrawdown', label: t('backtest.maxDrawdown'), fmt: 'pct' },
    { key: 'avgDrawdown', label: t('analysis.avgDrawdown'), fmt: 'pct' },
    { key: 'maxDrawdownDuration', label: t('analysis.maxDrawdownDuration'), fmt: 'duration' },
    { key: 'stdev', label: t('backtest.stdev'), fmt: 'pct' },
    { key: 'sharpe', label: t('backtest.sharpeRatio'), fmt: 'ratio' },
    { key: 'sortino', label: 'Sortino', fmt: 'ratio' },
    { key: 'calmar', label: 'Calmar', fmt: 'ratio' },
    { key: 'ulcerIndex', label: t('analysis.ulcerIndex'), fmt: 'ratio' },
    { key: 'ulcerPerformanceIndex', label: 'UPI', fmt: 'ratio' },
    { key: 'beta', label: 'Beta', fmt: 'ratio' },
  ];

  const formatVal = (v: number | undefined, fmt: 'pct' | 'ratio' | 'duration') => {
    if (v === undefined || v === null) return '—';
    if (fmt === 'pct') return `${(v * 100).toFixed(2)}%`;
    if (fmt === 'ratio') return v.toFixed(2);
    if (fmt === 'duration') return `${v} ${t('common.days')}`;
    return String(v);
  };

  // 增长曲线数据
  const growthData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (const p of portfolioResults) {
      for (const point of p.growthCurve) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![p.name] = point.value;
      }
    }
    return Array.from(dateMap.values()).sort((a, b) => (a.date as string).localeCompare(b.date as string));
  }, [portfolioResults]);

  // 回撤曲线数据
  const drawdownData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (const p of portfolioResults) {
      for (const point of p.drawdownCurve) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![p.name] = +(point.drawdown * -100).toFixed(2);
      }
    }
    return Array.from(dateMap.values()).sort((a, b) => (a.date as string).localeCompare(b.date as string));
  }, [portfolioResults]);

  return (
    <div className="space-y-6">
      {/* 统计表 */}
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.statsOverview')}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                <th className="text-[12px] font-semibold text-left py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                  {t('common.metric')}
                </th>
                {results.tickers.map((tk, idx) => (
                  <th key={tk.ticker} className="text-[12px] font-semibold text-right py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    {tk.ticker}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryCols.map((col, ri) => {
                const hasAnyValue = results.tickers.some(tk => tk.statistics[col.key] !== undefined && tk.statistics[col.key] !== null);
                if (!hasAnyValue) return null;
                return (
                  <tr key={col.key} style={{ backgroundColor: ri % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                    <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                      {col.label}
                    </td>
                    {results.tickers.map((tk) => (
                      <td key={tk.ticker} className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                        {formatVal(tk.statistics[col.key] as number | undefined, col.fmt)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 增长曲线 */}
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.growthCurve')}</div>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={growthData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 7)} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(label: string) => `${t('common.date')}: ${label}`} formatter={(value: number) => [`$${value.toLocaleString()}`, '']} />
            <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
            {portfolioResults.map((p, idx) => (
              <Line key={p.name} type="monotone" dataKey={p.name} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 回撤图 */}
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.drawdown')}</div>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={drawdownData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 7)} />
            <YAxis domain={['auto', 0]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(label: string) => `${t('common.date')}: ${label}`} formatter={(value: number) => [`${value.toFixed(2)}%`, '']} />
            <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
            {portfolioResults.map((p, idx) => (
              <Area key={p.name} type="monotone" dataKey={p.name} stroke={CHART_COLORS[idx % CHART_COLORS.length]} fill={CHART_COLORS[idx % CHART_COLORS.length]} fillOpacity={0.12} strokeWidth={1.5} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 相关性矩阵热力图 */}
      {results.correlations && results.correlations.length >= 2 && (
        <div className="chart-card">
          <div className="chart-card-title">{t('analysis.correlationMatrix')}</div>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }} />
                  {results.tickers.map((tk) => (
                    <th key={tk.ticker} className="px-3 py-2 text-[11px] font-medium text-center" style={{ color: 'var(--text-muted)' }}>{tk.ticker}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.tickers.map((rowTicker, i) => (
                  <tr key={rowTicker.ticker}>
                    <td className="px-3 py-2 text-[12px] font-medium" style={{ color: 'var(--text-body)' }}>{rowTicker.ticker}</td>
                    {results.tickers.map((colTicker, j) => {
                      const val = results.correlations[i]?.[j] ?? 0;
                      return (
                        <td key={colTicker.ticker} className="text-[12px] text-center cursor-default"
                          style={{
                            backgroundColor: getCorrelationColor(val),
                            color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
                            width: `${Math.max(48, 600 / results.tickers.length)}px`,
                            height: `${Math.max(36, 400 / results.tickers.length)}px`,
                          }}
                          title={`${rowTicker.ticker} vs ${colTicker.ticker}: ${val.toFixed(2)}`}
                        >
                          {val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Telltale Tab =====
function TelltaleTab({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const mergedData = useMemo(() => {
    if (results.tickers.length < 2) return [];
    const benchmark = results.tickers[0];
    const benchMap = new Map<string, number>();
    for (const point of benchmark.growthCurve) {
      benchMap.set(point.date, point.value);
    }
    const dateMap = new Map<string, Record<string, number | string>>();
    for (let i = 1; i < results.tickers.length; i++) {
      const t = results.tickers[i];
      for (const point of t.growthCurve) {
        const benchVal = benchMap.get(point.date);
        if (benchVal == null || benchVal === 0) continue;
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![t.ticker] = +(point.value / benchVal).toFixed(6);
      }
    }
    return Array.from(dateMap.values()).sort((a, b) => (a.date as string).localeCompare(b.date as string));
  }, [results]);

  if (results.tickers.length < 2) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.telltaleChart')}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
          {t('analysis.telltaleNeedTwo')}
        </div>
      </div>
    );
  }

  const benchmark = results.tickers[0];

  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.telltaleRelative')} {benchmark.ticker}</div>
      <ResponsiveContainer width="100%" height={450}>
        <LineChart data={mergedData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 7)} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => v.toFixed(2)} label={{ value: t('analysis.relativeRatio'), angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 12 } }} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(label: string) => `${t('common.date')}: ${label}`} formatter={(value: number) => [value.toFixed(3), '']} />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          <ReferenceLine y={1} stroke="var(--text-muted)" strokeDasharray="4 4" />
          {results.tickers.slice(1).map((tk, idx) => (
            <Line key={tk.ticker} type="monotone" dataKey={tk.ticker} stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===== Correlations & Beta Tab =====
function CorrelationsBetaTab({ results, correlationWindow }: { results: AssetAnalysisResult; correlationWindow: number }) {
  const { t } = useTranslation();
  const [rollingPair, setRollingPair] = useState<[number, number]>([0, Math.min(1, results.tickers.length - 1)]);
  const tickers = results.tickers.map(t => t.ticker);

  // Beta矩阵
  const betaMatrix = useMemo(() =>
    computeBetaMatrix(results.tickers.map(t => t.dailyReturns)),
    [results]);

  // 滚动相关性
  const rollingCorrData = useMemo(() => {
    if (results.tickers.length < 2) return [];
    const dates = results.tickers[0].growthCurve.map(g => g.date).slice(1); // dailyReturns从第2天开始
    const windowDays = Math.round(correlationWindow * TRADING_DAYS_PER_YEAR / 12);
    const r1 = results.tickers[rollingPair[0]]?.dailyReturns ?? [];
    const r2 = results.tickers[rollingPair[1]]?.dailyReturns ?? [];
    return computeRollingCorrelation(r1, r2, dates, windowDays);
  }, [results, rollingPair, correlationWindow]);

  return (
    <div className="space-y-6">
      {/* 相关性矩阵 */}
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.correlationMatrix')}</div>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="px-3 py-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }} />
                {tickers.map((tk) => (
                  <th key={tk} className="px-3 py-2 text-[11px] font-medium text-center" style={{ color: 'var(--text-muted)' }}>{tk}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickers.map((rowTicker, i) => (
                <tr key={rowTicker}>
                  <td className="px-3 py-2 text-[12px] font-medium" style={{ color: 'var(--text-body)' }}>{rowTicker}</td>
                  {tickers.map((colTicker, j) => {
                    const val = results.correlations[i]?.[j] ?? 0;
                    return (
                      <td key={colTicker} className="text-[12px] text-center cursor-default"
                        style={{
                          backgroundColor: getCorrelationColor(val),
                          color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
                          width: `${Math.max(48, 600 / tickers.length)}px`,
                          height: `${Math.max(36, 400 / tickers.length)}px`,
                        }}
                        title={`${rowTicker} vs ${colTicker}: ${val.toFixed(2)}`}
                      >
                        {val.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Beta矩阵 */}
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.betaMatrix')}</div>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="px-3 py-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }} />
                {tickers.map((tk) => (
                  <th key={tk} className="px-3 py-2 text-[11px] font-medium text-center" style={{ color: 'var(--text-muted)' }}>{tk}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickers.map((rowTicker, i) => (
                <tr key={rowTicker}>
                  <td className="px-3 py-2 text-[12px] font-medium" style={{ color: 'var(--text-body)' }}>{rowTicker}</td>
                  {tickers.map((colTicker, j) => {
                    const val = betaMatrix[i]?.[j] ?? 0;
                    const absVal = Math.abs(val);
                    return (
                      <td key={colTicker} className="text-[12px] text-center cursor-default"
                        style={{
                          backgroundColor: absVal > 1.5 ? '#f0c8c8' : absVal > 1 ? '#f5e0d0' : absVal > 0.5 ? '#d8e8f0' : 'var(--bg-subtle)',
                          color: 'var(--text-body)',
                          width: `${Math.max(48, 600 / tickers.length)}px`,
                          height: `${Math.max(36, 400 / tickers.length)}px`,
                        }}
                        title={`${rowTicker} vs ${colTicker}: Beta = ${val.toFixed(2)}`}
                      >
                        {val.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 滚动相关性 */}
      {results.tickers.length >= 2 && (
        <div className="chart-card">
          <div className="flex items-center gap-4 mb-3">
            <div className="chart-card-title mb-0">{t('analysis.rollingCorrelation')}</div>
            <div className="flex items-center gap-2">
              <select
                className="param-input"
                style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
                value={rollingPair[0]}
                onChange={(e) => setRollingPair([Number(e.target.value), rollingPair[1]])}
              >
                {tickers.map((tk, i) => <option key={tk} value={i}>{tk}</option>)}
              </select>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>vs</span>
              <select
                className="param-input"
                style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
                value={rollingPair[1]}
                onChange={(e) => setRollingPair([rollingPair[0], Number(e.target.value)])}
              >
                {tickers.map((tk, i) => <option key={tk} value={i}>{tk}</option>)}
              </select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rollingCorrData.map(d => ({ ...d, value: +d.value.toFixed(3) }))} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 7)} />
              <YAxis domain={[-1, 1]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(label: string) => `${t('common.date')}: ${label}`} formatter={(value: number) => [value.toFixed(3), t('analysis.correlation')]} />
              <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} name={`${tickers[rollingPair[0]]} vs ${tickers[rollingPair[1]]}`} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ===== Rolling Metrics Tab =====
type RollingMetricKey = 'cagr' | 'volatility' | 'excess' | 'skewness' | 'kurtosis' | 'kelly';

function RollingMetricsTab({ results, rollingWindow }: { results: AssetAnalysisResult; rollingWindow: number }) {
  const { t } = useTranslation();
  const rollingMetrics = [
    { key: 'cagr' as const, label: t('analysis.rollingCAGR') },
    { key: 'volatility' as const, label: t('analysis.rollingVolatility') },
    { key: 'excess' as const, label: t('analysis.rollingExcess') },
    { key: 'skewness' as const, label: t('analysis.rollingSkewness') },
    { key: 'kurtosis' as const, label: t('analysis.rollingKurtosis') },
    { key: 'kelly' as const, label: t('analysis.rollingKelly') },
  ];
  const [metric, setMetric] = useState<RollingMetricKey>('cagr');
  const windowDays = Math.round(rollingWindow * TRADING_DAYS_PER_YEAR / 12);

  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();

    for (let tIdx = 0; tIdx < results.tickers.length; tIdx++) {
      const tk = results.tickers[tIdx];
      const dates = tk.growthCurve.map(g => g.date).slice(1); // dailyReturns从第2天开始

      let rollingData: Array<{ date: string; value: number }>;

      if (metric === 'excess') {
        if (tIdx === 0) continue; // 第一个资产没有超额收益
        const benchReturns = results.tickers[0].dailyReturns;
        rollingData = computeRollingExcessReturn(tk.dailyReturns, benchReturns, dates, windowDays);
      } else {
        rollingData = computeRollingMetric(tk.dailyReturns, dates, windowDays, metric);
      }

      for (const point of rollingData) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![tk.ticker] = metric === 'cagr' || metric === 'volatility' || metric === 'excess'
          ? +(point.value * 100).toFixed(2)
          : +point.value.toFixed(3);
      }
    }

    return Array.from(dateMap.values()).sort((a, b) => (a.date as string).localeCompare(b.date as string));
  }, [results, metric, windowDays]);

  const isPct = metric === 'cagr' || metric === 'volatility' || metric === 'excess';

  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">
          {rollingMetrics.find(m => m.key === metric)?.label}
        </div>
        <select
          className="param-input"
          style={{ width: 150, fontSize: 12, padding: '4px 8px' }}
          value={metric}
          onChange={(e) => setMetric(e.target.value as RollingMetricKey)}
        >
          {rollingMetrics.map(m => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: string) => v.slice(0, 7)} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={isPct ? (v: number) => `${v.toFixed(0)}%` : (v: number) => v.toFixed(1)} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(label: string) => `${t('common.date')}: ${label}`} formatter={(value: number) => [isPct ? `${value.toFixed(2)}%` : value.toFixed(3), '']} />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {metric !== 'excess' && results.tickers.map((tk, idx) => (
            <Line key={tk.ticker} type="monotone" dataKey={tk.ticker} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
          ))}
          {metric === 'excess' && results.tickers.slice(1).map((tk, idx) => (
            <Line key={tk.ticker} type="monotone" dataKey={tk.ticker} stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
          ))}
          {(metric === 'excess' || metric === 'skewness' || metric === 'kurtosis') && (
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===== Risk vs Return Tab =====
type RiskMetricKey = 'stdev' | 'maxDrawdown' | 'avgDrawdown' | 'ulcerIndex';

function RiskReturnTab({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const riskMetrics = [
    { key: 'stdev' as const, label: t('backtest.stdev') },
    { key: 'maxDrawdown' as const, label: t('backtest.maxDrawdown') },
    { key: 'avgDrawdown' as const, label: t('analysis.avgDrawdown') },
    { key: 'ulcerIndex' as const, label: t('analysis.ulcerIndex') },
  ];
  const [riskMetric, setRiskMetric] = useState<RiskMetricKey>('stdev');

  const scatterData = useMemo(() =>
    results.tickers.map((tk) => ({
      name: tk.ticker,
      risk: +((tk.statistics[riskMetric] as number ?? 0) * 100).toFixed(2),
      cagr: +((tk.statistics.cagr ?? 0) * 100).toFixed(2),
    })),
    [results, riskMetric]);

  const riskLabel = riskMetrics.find(m => m.key === riskMetric)?.label ?? t('analysis.risk');

  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">{t('analysis.riskVsReturn')}</div>
        <select
          className="param-input"
          style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
          value={riskMetric}
          onChange={(e) => setRiskMetric(e.target.value as RiskMetricKey)}
        >
          {riskMetrics.map(m => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={450}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis type="number" dataKey="risk" name={riskLabel} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: `${riskLabel} (%)`, position: 'insideBottom', offset: -10, style: { fill: 'var(--text-muted)', fontSize: 12 } }} />
          <YAxis type="number" dataKey="cagr" name="CAGR" tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: 'CAGR (%)', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 12 } }} />
          <ZAxis range={[80, 80]} />
          <Tooltip contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => {
              if (name === 'risk') return [`${value.toFixed(2)}%`, riskLabel];
              if (name === 'cagr') return [`${value.toFixed(2)}%`, 'CAGR'];
              return [value, name];
            }}
            labelFormatter={() => ''} />
          {scatterData.map((point, idx) => (
            <Scatter key={point.name} data={[point]} fill={CHART_COLORS[idx % CHART_COLORS.length]}>
              <LabelList dataKey="name" position="right" style={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===== Returns Tab =====
function ReturnsTab({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const monthLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const [selectedTicker, setSelectedTicker] = useState(0);

  // 年度收益柱状图数据
  const annualData = useMemo(() => {
    const yearMap = new Map<number, Record<string, number | number>>();
    for (const tk of results.tickers) {
      for (const point of tk.annualReturns) {
        if (!yearMap.has(point.year)) yearMap.set(point.year, { year: point.year });
        yearMap.get(point.year)![tk.ticker] = +(point.return * 100).toFixed(2);
      }
    }
    return Array.from(yearMap.values()).sort((a, b) => (a.year as number) - (b.year as number));
  }, [results]);

  // 月度收益热力图数据
  const heatmapData = useMemo(() => {
    const tk = results.tickers[selectedTicker];
    if (!tk) return [];
    const yearMap = new Map<number, (number | null)[]>();
    for (const mr of tk.monthlyReturns) {
      if (!yearMap.has(mr.year)) yearMap.set(mr.year, Array(12).fill(null));
      yearMap.get(mr.year)![mr.month - 1] = +(mr.return * 100).toFixed(2);
    }
    return Array.from(yearMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, months]) => ({ year, months }));
  }, [results, selectedTicker]);

  return (
    <div className="space-y-6">
      {/* 年度收益柱状图 */}
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.annualReturns')}</div>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={annualData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
            <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value.toFixed(2)}%`, '']} />
            <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
            {results.tickers.map((tk, idx) => (
              <Bar key={tk.ticker} dataKey={tk.ticker} fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 月度收益热力图 */}
      <div className="chart-card">
        <div className="flex items-center gap-4 mb-3">
          <div className="chart-card-title mb-0">{t('analysis.monthlyReturnsHeatmap')}</div>
          <select
            className="param-input"
            style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(Number(e.target.value))}
          >
            {results.tickers.map((tk, i) => (
              <option key={tk.ticker} value={i}>{tk.ticker}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="px-2 py-1 text-[11px] font-medium text-left w-10" style={{ color: 'var(--text-muted)' }} />
                {monthLabels.map((m) => (
                  <th key={m} className="px-1 py-1 text-[11px] font-medium text-center min-w-[36px]" style={{ color: 'var(--text-muted)' }}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapData.map((row) => (
                <tr key={row.year}>
                  <td className="px-2 py-0.5 text-[11px] font-medium" style={{ color: 'var(--text-body)' }}>{row.year}</td>
                  {row.months.map((val, mIdx) => (
                    <td key={mIdx} className="px-0.5 py-0.5 text-center cursor-default"
                      style={{ backgroundColor: getHeatColor(val) }}
                      title={`${row.year} ${monthLabels[mIdx]}: ${val !== null ? val.toFixed(2) : '—'}%`}
                    >
                      <span className="text-[10px] inline-block w-[34px] leading-[24px]"
                        style={{ color: val !== null && Math.abs(val) > 5 ? '#fff' : 'var(--text-muted)' }}
                      >
                        {val !== null ? val.toFixed(1) : '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
    const validTickers = tickers.filter(Boolean).map(t => t.toUpperCase());
    if (validTickers.length === 0) {
      setError(t('analysis.errorMinOneTicker'));
      return;
    }
    run(async () => {
      const res = await fetch('/api/backtest/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: validTickers,
          parameters: { startDate, endDate, startingValue, adjustForInflation, rollingWindowMonths: rollingWindow, correlationWindowMonths: correlationWindow, benchmarkTicker: '', baseCurrency: 'usd', extendedWithdrawalStats: false, cashflowLegs: [], oneTimeCashflows: [] },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || t('analysis.analysisFailed'));
      setResults(json.data ?? json);
    });
  };

  // ===== 左侧参数面板 =====
  const paramsPanel = (
    <ParamsPanel>
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

      <ParamsSection title={t('analysis.timeRange')}>
        <div className="params-row">
          <div className="param-field">
            <span className="param-label">{t('analysis.startDate')}</span>
            <input type="date" className="param-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="param-field">
            <span className="param-label">{t('analysis.endDate')}</span>
            <input type="date" className="param-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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

      <ParamsSection title={t('analysis.analysisSettings')} defaultOpen={false}>
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
        <LoadingButton isLoading={isLoading} onClick={runAnalysis} loadingText={t('analysis.analyzing')}>
          <Play className="w-4 h-4" />
          {t('analysis.startAnalysis')}
        </LoadingButton>
      </div>
    </ParamsPanel>
  );

  // ===== 右侧结果面板 =====
  const resultsPanel = (
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
            {activeTab === 'correlations' && <CorrelationsBetaTab results={results} correlationWindow={correlationWindow} />}
            {activeTab === 'rolling' && <RollingMetricsTab results={results} rollingWindow={rollingWindow} />}
            {activeTab === 'risk-return' && <RiskReturnTab results={results} />}
            {activeTab === 'returns' && <ReturnsTab results={results} />}
          </div>
        </div>
      )}

      {!results && !error && !isLoading && (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}>
          {t('analysis.noResultsHint')}
        </div>
      )}
    </div>
  );

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('analysis.title')}</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          {t('analysis.seoDesc')}
        </p>
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
          <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.portfolioBacktest')}</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>{t('optimizer.title')}</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.efficientFrontier')}</Link>
        </div>
      </div>

      <ToolPageLayout title={t('analysis.analysisParams')} params={paramsPanel} results={resultsPanel} />
    </div>
  );
}
