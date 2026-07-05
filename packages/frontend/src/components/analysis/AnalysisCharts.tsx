import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { RollingMetricKey, RiskMetricKey } from './types.js';
import {
  computeRollingMetric,
  computeRollingExcessReturn,
  computeBetaMatrix,
  computeRollingCorrelation,
  getCorrelationColor,
  getHeatColor,
  tooltipStyle,
} from './utils.js';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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
import { CHART_COLORS } from '@backtest/shared/types';
import type { AssetAnalysisResult, Statistics } from '@backtest/shared/types';

const TABS = [
  { key: 'summary', labelKey: 'tabs.summary' },
  { key: 'telltale', labelKey: 'tabs.telltale' },
  { key: 'correlations', labelKey: 'tabs.correlationsBeta' },
  { key: 'rolling', labelKey: 'tabs.rollingMetrics' },
  { key: 'risk-return', labelKey: 'tabs.riskVsReturn' },
  { key: 'returns', labelKey: 'tabs.returns' },
];

export function GrowthChart({
  growthData,
  portfolioResults,
}: {
  growthData: Array<Record<string, number | string>>;
  portfolioResults: Array<{ name: string }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.growthCurve')}</div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={growthData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {portfolioResults.map((p, idx) => (
            <Line
              key={p.name}
              type="monotone"
              dataKey={p.name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
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

export function DrawdownChart({
  drawdownData,
  portfolioResults,
}: {
  drawdownData: Array<Record<string, number | string>>;
  portfolioResults: Array<{ name: string }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.drawdown')}</div>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={drawdownData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            domain={['auto', 0]}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          {portfolioResults.map((p, idx) => (
            <Area
              key={p.name}
              type="monotone"
              dataKey={p.name}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CorrelationMatrixTable({
  tickers,
  correlations,
}: {
  tickers: Array<{ ticker: string }>;
  correlations: number[][];
}) {
  const { t } = useTranslation();
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.correlationMatrix')}</div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="px-3 py-2 text-[11px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              />
              {tickers.map((tk) => (
                <th
                  key={tk.ticker}
                  className="px-3 py-2 text-[11px] font-medium text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {tk.ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((rowTk, i) => (
              <tr key={rowTk.ticker}>
                <td
                  className="px-3 py-2 text-[12px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {rowTk.ticker}
                </td>
                {tickers.map((colTk, j) => {
                  const val = correlations[i]?.[j] ?? 0;
                  return (
                    <td
                      key={colTk.ticker}
                      className="text-[12px] text-center cursor-default"
                      style={{
                        backgroundColor: getCorrelationColor(val),
                        color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
                        width: `${Math.max(48, 600 / tickers.length)}px`,
                        height: `${Math.max(36, 400 / tickers.length)}px`,
                      }}
                      title={`${rowTk.ticker} vs ${colTk.ticker}: ${val.toFixed(2)}`}
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
  );
}

export function StatsTable({ tickers }: { tickers: AssetAnalysisResult['tickers'] }) {
  const { t } = useTranslation();
  const cols: { key: keyof Statistics; label: string; fmt: 'pct' | 'ratio' | 'duration' }[] = [
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
  const fmt = (v: number | undefined, f: 'pct' | 'ratio' | 'duration') => {
    if (v === undefined || v === null) return '—';
    if (f === 'pct') return `${(v * 100).toFixed(2)}%`;
    if (f === 'ratio') return v.toFixed(2);
    return `${v} ${t('common.days')}`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th
              className="text-[12px] font-semibold text-left py-2 px-3"
              style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
            >
              {t('common.metric')}
            </th>
            {tickers.map((tk, idx) => (
              <th
                key={tk.ticker}
                className="text-[12px] font-semibold text-right py-2 px-3"
                style={{
                  color: 'var(--text-muted)',
                  borderBottom: '2px solid var(--border-soft)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                  style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                />
                {tk.ticker}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map((col, ri) => {
            if (
              !tickers.some(
                (tk) => tk.statistics[col.key] !== undefined && tk.statistics[col.key] !== null,
              )
            )
              return null;
            return (
              <tr
                key={col.key}
                style={{ backgroundColor: ri % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td
                  className="text-[13px] py-2 px-3"
                  style={{
                    color: 'var(--text-body)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {col.label}
                </td>
                {tickers.map((tk) => (
                  <td
                    key={tk.ticker}
                    className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                    style={{
                      color: 'var(--text-strong)',
                      borderBottom: '1px solid var(--border-soft)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmt(tk.statistics[col.key] as number | undefined, col.fmt)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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

export function BetaMatrixTable({
  tickers,
  betaMatrix,
}: {
  tickers: string[];
  betaMatrix: number[][];
}) {
  const { t } = useTranslation();
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.betaMatrix')}</div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="px-3 py-2 text-[11px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              />
              {tickers.map((tk) => (
                <th
                  key={tk}
                  className="px-3 py-2 text-[11px] font-medium text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {tk}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((rowTk, i) => (
              <tr key={rowTk}>
                <td
                  className="px-3 py-2 text-[12px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {rowTk}
                </td>
                {tickers.map((colTk, j) => {
                  const val = betaMatrix[i]?.[j] ?? 0;
                  const absVal = Math.abs(val);
                  return (
                    <td
                      key={colTk}
                      className="text-[12px] text-center cursor-default"
                      style={{
                        backgroundColor:
                          absVal > 1.5
                            ? '#f0c8c8'
                            : absVal > 1
                              ? '#f5e0d0'
                              : absVal > 0.5
                                ? '#d8e8f0'
                                : 'var(--bg-subtle)',
                        color: 'var(--text-body)',
                        width: `${Math.max(48, 600 / tickers.length)}px`,
                        height: `${Math.max(36, 400 / tickers.length)}px`,
                      }}
                      title={`${rowTk} vs ${colTk}: Beta = ${val.toFixed(2)}`}
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
  );
}

export function RollingCorrelationChart({
  tickers,
  rollingPair,
  setRollingPair,
  rollingCorrData,
}: {
  tickers: string[];
  rollingPair: [number, number];
  setRollingPair: (pair: [number, number]) => void;
  rollingCorrData: Array<{ date: string; value: number }>;
}) {
  const { t } = useTranslation();
  return (
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
            {tickers.map((tk, i) => (
              <option key={tk} value={i}>
                {tk}
              </option>
            ))}
          </select>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>vs</span>
          <select
            className="param-input"
            style={{ width: 100, fontSize: 12, padding: '4px 8px' }}
            value={rollingPair[1]}
            onChange={(e) => setRollingPair([rollingPair[0], Number(e.target.value)])}
          >
            {tickers.map((tk, i) => (
              <option key={tk} value={i}>
                {tk}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={rollingCorrData.map((d) => ({ ...d, value: +d.value.toFixed(3) }))}
          margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis domain={[-1, 1]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
            formatter={(value: number) => [value.toFixed(3), t('analysis.correlation')]}
          />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
            name={`${tickers[rollingPair[0]]} vs ${tickers[rollingPair[1]]}`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RollingMetricsChart({
  results,
  rollingWindow,
}: {
  results: AssetAnalysisResult;
  rollingWindow: number;
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

export function SeoCard() {
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
}

export function SummaryTab({ results }: { results: AssetAnalysisResult }) {
  return <OverviewCharts results={results} />;
}

export function TelltaleTab({ results }: { results: AssetAnalysisResult }) {
  return <TelltaleChart results={results} />;
}

export function CorrelationsBetaTab({
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
  const betaMatrix = useMemo(
    () => computeBetaMatrix(results.tickers.map((t) => t.dailyReturns)),
    [results],
  );
  const rollingCorrData = useMemo(() => {
    if (results.tickers.length < 2) return [];
    const dates = results.tickers[0].growthCurve.map((g) => g.date).slice(1);
    const windowDays = Math.round((correlationWindow * TRADING_DAYS_PER_YEAR) / 12);
    return computeRollingCorrelation(
      results.tickers[rollingPair[0]]?.dailyReturns ?? [],
      results.tickers[rollingPair[1]]?.dailyReturns ?? [],
      dates,
      windowDays,
    );
  }, [results, rollingPair, correlationWindow]);

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
}

export function RollingMetricsTab({
  results,
  rollingWindow,
}: {
  results: AssetAnalysisResult;
  rollingWindow: number;
}) {
  return <RollingMetricsChart results={results} rollingWindow={rollingWindow} />;
}

export function RiskReturnTab({ results }: { results: AssetAnalysisResult }) {
  return <RiskReturnChart results={results} />;
}

export function ReturnsTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <div className="space-y-6">
      <AnnualReturnsChart results={results} />
      <MonthlyHeatmap results={results} />
    </div>
  );
}

export function AnalysisResultsPanel({
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
}
