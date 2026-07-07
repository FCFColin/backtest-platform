import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { RollingMetricKey, RiskMetricKey } from '../types.js';
import { computeRollingMetric, computeRollingExcessReturn, tooltipStyle } from '../utils.js';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ZAxis,
  LabelList,
} from 'recharts';
import { getHeatColor } from '../utils.js';
import { CHART_COLORS } from '@backtest/shared';
import type { AssetAnalysisResult, Statistics } from '@backtest/shared';
import {
  GrowthChart,
  DrawdownChart,
  CorrelationMatrixTable,
  StatsTable,
} from './ChartComponents.js';

export function OverviewCharts({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const tickers = useMemo(() => results.tickers ?? [], [results.tickers]);
  const portfolioResults = useMemo(
    () =>
      tickers.map((tk) => ({
        name: tk.ticker,
        growthCurve: tk.growthCurve ?? [],
        drawdownCurve: tk.drawdownCurve ?? [],
        statistics: (tk.statistics ?? {}) as Statistics,
      })),
    [tickers],
  );
  const growthData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (const p of portfolioResults)
      for (const point of p.growthCurve) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![p.name] = point.value;
      }
    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [portfolioResults]);
  const drawdownData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (const p of portfolioResults)
      for (const point of p.drawdownCurve) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![p.name] = +(point.drawdown * -100).toFixed(2);
      }
    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [portfolioResults]);

  return (
    <div className="space-y-6">
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.statsOverview')}</div>
        <StatsTable tickers={tickers} />
      </div>
      <GrowthChart growthData={growthData} portfolioResults={portfolioResults} />
      <DrawdownChart drawdownData={drawdownData} portfolioResults={portfolioResults} />
      {results.correlations && results.correlations.length >= 2 && (
        <CorrelationMatrixTable tickers={tickers} correlations={results.correlations} />
      )}
    </div>
  );
}

export function TelltaleChart({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const mergedData = useMemo(() => {
    if (results.tickers.length < 2) return [];
    const benchmark = results.tickers[0];
    const benchMap = new Map<string, number>();
    for (const point of benchmark.growthCurve) benchMap.set(point.date, point.value);
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
    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [results]);

  if (results.tickers.length < 2) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.telltaleChart')}</div>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          {t('analysis.telltaleNeedTwo')}
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-title">
        {t('analysis.telltaleRelative')} {results.tickers[0].ticker}
      </div>
      <ResponsiveContainer width="100%" height={450}>
        <LineChart data={mergedData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => v.toFixed(2)}
            label={{
              value: t('analysis.relativeRatio'),
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number) => [value.toFixed(3), '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          <ReferenceLine y={1} stroke="var(--text-muted)" strokeDasharray="4 4" />
          {results.tickers.slice(1).map((tk, idx) => (
            <Line
              key={tk.ticker}
              type="monotone"
              dataKey={tk.ticker}
              stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RollingMetricsChart({
  results,
  rollingWindow = 12,
}: {
  results: AssetAnalysisResult;
  rollingWindow?: number;
}) {
  const { t } = useTranslation();
  const metrics = [
    { key: 'cagr' as const, label: t('analysis.rollingCAGR') },
    { key: 'volatility' as const, label: t('analysis.rollingVolatility') },
    { key: 'excess' as const, label: t('analysis.rollingExcess') },
    { key: 'skewness' as const, label: t('analysis.rollingSkewness') },
    { key: 'kurtosis' as const, label: t('analysis.rollingKurtosis') },
    { key: 'kelly' as const, label: t('analysis.rollingKelly') },
  ];
  const [metric, setMetric] = useState<RollingMetricKey>('cagr');
  const windowDays = Math.round((rollingWindow * TRADING_DAYS_PER_YEAR) / 12);
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    for (let i = 0; i < results.tickers.length; i++) {
      const tk = results.tickers[i];
      const dates = tk.growthCurve.map((g) => g.date).slice(1);
      const rollingData =
        metric === 'excess'
          ? i === 0
            ? []
            : computeRollingExcessReturn(
                tk.dailyReturns,
                results.tickers[0].dailyReturns,
                dates,
                windowDays,
              )
          : computeRollingMetric(tk.dailyReturns, dates, windowDays, metric);
      for (const point of rollingData) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![tk.ticker] =
          metric === 'cagr' || metric === 'volatility' || metric === 'excess'
            ? +(point.value * 100).toFixed(2)
            : +point.value.toFixed(3);
      }
    }
    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [results, metric, windowDays]);
  const isPct = metric === 'cagr' || metric === 'volatility' || metric === 'excess';

  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">{metrics.find((m) => m.key === metric)?.label}</div>
        <select
          className="param-input"
          style={{ width: 150, fontSize: 12, padding: '4px 8px' }}
          value={metric}
          onChange={(e) => setMetric(e.target.value as RollingMetricKey)}
        >
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={isPct ? (v: number) => `${v.toFixed(0)}%` : (v: number) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number) => [isPct ? `${value.toFixed(2)}%` : value.toFixed(3), '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {(metric !== 'excess' ? results.tickers : results.tickers.slice(1)).map((tk, idx) => (
            <Line
              key={tk.ticker}
              type="monotone"
              dataKey={tk.ticker}
              stroke={CHART_COLORS[(metric === 'excess' ? idx + 1 : idx) % CHART_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
          {(metric === 'excess' || metric === 'skewness' || metric === 'kurtosis') && (
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskReturnChart({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const riskMetrics = [
    { key: 'stdev' as const, label: t('backtest.stdev') },
    { key: 'maxDrawdown' as const, label: t('backtest.maxDrawdown') },
    { key: 'avgDrawdown' as const, label: t('analysis.avgDrawdown') },
    { key: 'ulcerIndex' as const, label: t('analysis.ulcerIndex') },
  ];
  const [riskMetric, setRiskMetric] = useState<RiskMetricKey>('stdev');
  const scatterData = useMemo(
    () =>
      results.tickers.map((tk) => ({
        name: tk.ticker,
        risk: +(((tk.statistics[riskMetric] as number) ?? 0) * 100).toFixed(2),
        cagr: +((tk.statistics.cagr ?? 0) * 100).toFixed(2),
      })),
    [results, riskMetric],
  );
  const riskLabel = riskMetrics.find((m) => m.key === riskMetric)?.label ?? t('analysis.risk');

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
          {riskMetrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={450}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            type="number"
            dataKey="risk"
            name={riskLabel}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{
              value: `${riskLabel} (%)`,
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <YAxis
            type="number"
            dataKey="cagr"
            name="CAGR"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{
              value: 'CAGR (%)',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <ZAxis range={[80, 80]} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) =>
              name === 'risk'
                ? [`${value.toFixed(2)}%`, riskLabel]
                : name === 'cagr'
                  ? [`${value.toFixed(2)}%`, 'CAGR']
                  : [value, name]
            }
            labelFormatter={() => ''}
          />
          {scatterData.map((point, idx) => (
            <Scatter key={point.name} data={[point]} fill={CHART_COLORS[idx % CHART_COLORS.length]}>
              <LabelList
                dataKey="name"
                position="right"
                style={{ fill: 'var(--text-muted)', fontSize: 11 }}
              />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnnualReturnsChart({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const annualData = useMemo(() => {
    const yearMap = new Map<number, Record<string, number | number>>();
    for (const tk of results.tickers)
      for (const point of tk.annualReturns) {
        if (!yearMap.has(point.year)) yearMap.set(point.year, { year: point.year });
        yearMap.get(point.year)![tk.ticker] = +(point.return * 100).toFixed(2);
      }
    return Array.from(yearMap.values()).sort((a, b) => (a.year as number) - (b.year as number));
  }, [results]);

  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.annualReturns')}</div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={annualData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {results.tickers.map((tk, idx) => (
            <Bar
              key={tk.ticker}
              dataKey={tk.ticker}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyHeatmap({ results }: { results: AssetAnalysisResult }) {
  const { t } = useTranslation();
  const monthLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const [selectedTicker, setSelectedTicker] = useState(0);
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
            <option key={tk.ticker} value={i}>
              {tk.ticker}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="px-2 py-1 text-[11px] font-medium text-left w-10"
                style={{ color: 'var(--text-muted)' }}
              />
              {monthLabels.map((m) => (
                <th
                  key={m}
                  className="px-1 py-1 text-[11px] font-medium text-center min-w-[36px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmapData.map((row) => (
              <tr key={row.year}>
                <td
                  className="px-2 py-0.5 text-[11px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {row.year}
                </td>
                {row.months.map((val, mIdx) => (
                  <td
                    key={mIdx}
                    className="px-0.5 py-0.5 text-center cursor-default"
                    style={{ backgroundColor: getHeatColor(val) }}
                    title={`${row.year} ${monthLabels[mIdx]}: ${val !== null ? val.toFixed(2) : '—'}%`}
                  >
                    <span
                      className="text-[10px] inline-block w-[34px] leading-[24px]"
                      style={{
                        color: val !== null && Math.abs(val) > 5 ? '#fff' : 'var(--text-muted)',
                      }}
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
  );
}
