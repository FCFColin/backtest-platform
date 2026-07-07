import type { CSSProperties } from 'react';
import { fmtPct, fmtNum } from '@/utils/format';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult, PerPathMetrics } from '@backtest/shared';
import type { DistMetric, ResultTab, PortfolioState, PortfolioMode } from './monteCarloTypes.js';

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function fmtDollar(v: number): string {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const METRIC_LABELS: Record<DistMetric, string> = {
  finalValue: '终值',
  cagr: 'CAGR',
  maxDrawdown: '最大回撤',
  volatility: '波动率',
  sharpe: '夏普比率',
  sortino: 'Sortino比率',
};

const METRIC_FORMAT: Record<DistMetric, (v: number) => string> = {
  finalValue: fmtDollar,
  cagr: fmtPct,
  maxDrawdown: fmtPct,
  volatility: fmtPct,
  sharpe: fmtNum,
  sortino: fmtNum,
};

const SUMMARY_STATS = ['Min', 'P10', 'P25', 'P50', 'Mean', 'P75', 'P90', 'Max', 'Std'] as const;

const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'range', label: 'Portfolio Value Range' },
  { key: 'success', label: 'Portfolio Success' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'scenarios', label: 'Scenarios' },
];

const EMPTY_DATA_STYLE: CSSProperties = {
  color: 'var(--text-muted)',
  textAlign: 'center',
  padding: 24,
};
const TOOLTIP_STYLE: CSSProperties = {
  fontSize: 12,
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  boxShadow: 'var(--shadow-md)',
};
const statCardStyle: CSSProperties = {
  textAlign: 'center',
  padding: 14,
  backgroundColor: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
};

function buildSummaryData(r: MonteCarloResult, startingValue: number) {
  const metrics = r.perPathMetrics;
  if (!metrics || metrics.length === 0) return null;
  const keys: DistMetric[] = [
    'finalValue',
    'cagr',
    'maxDrawdown',
    'volatility',
    'sharpe',
    'sortino',
  ];
  return keys.map((key) => {
    const vals =
      key === 'finalValue'
        ? metrics.map((m) => m.finalValue * startingValue)
        : metrics.map((m) => m[key]);
    const p = (frac: number) => percentile(vals, frac);
    const m = mean(vals);
    const s = std(vals);
    return {
      metric: METRIC_LABELS[key],
      key,
      values: {
        Min: METRIC_FORMAT[key](Math.min(...vals)),
        P10: METRIC_FORMAT[key](p(0.1)),
        P25: METRIC_FORMAT[key](p(0.25)),
        P50: METRIC_FORMAT[key](p(0.5)),
        Mean: METRIC_FORMAT[key](m),
        P75: METRIC_FORMAT[key](p(0.75)),
        P90: METRIC_FORMAT[key](p(0.9)),
        Max: METRIC_FORMAT[key](Math.max(...vals)),
        Std: key === 'finalValue' ? fmtDollar(s) : fmtNum(s),
      } as Record<string, string>,
    };
  });
}

interface RangeDataPoint {
  month: number;
  label: string;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

function buildRangeData(r: MonteCarloResult, startingValue: number): RangeDataPoint[] {
  const { p5, p25, p50, p75, p95 } = r.percentiles;
  if (!p5 || p5.length === 0) return [];
  const data: RangeDataPoint[] = [];
  const push = (day: number, month: number) => {
    data.push({
      month,
      label: month % 12 === 0 ? `${month / 12}y` : '',
      p5: p5[day] * startingValue,
      p25: p25[day] * startingValue,
      p50: p50[day] * startingValue,
      p75: p75[day] * startingValue,
      p95: p95[day] * startingValue,
    });
  };
  push(0, 0);
  let day = 0,
    month = 0;
  while (day < p5.length - 1) {
    day += 21;
    month++;
    if (day >= p5.length) day = p5.length - 1;
    push(day, month);
    if (day >= p5.length - 1) break;
  }
  return data;
}

function buildSuccessData(r: MonteCarloResult) {
  const sp = r.successProbabilities;
  if (!sp || !sp.survival || sp.survival.length === 0) return [];
  return sp.survival.map((_, i) => ({
    year: i + 1,
    survival: Number((sp.survival[i] * 100).toFixed(1)),
    capitalPreservation: Number((sp.capitalPreservation[i] * 100).toFixed(1)),
    profit: Number((sp.profit[i] * 100).toFixed(1)),
  }));
}

function buildDistHistogram(metrics: PerPathMetrics[], metric: DistMetric, startingValue: number) {
  const vals =
    metric === 'finalValue'
      ? metrics.map((m) => m.finalValue * startingValue)
      : metrics.map((m) => m[metric]);
  if (vals.length === 0) return { data: [], medianLabel: '', meanLabel: '' };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const binCount = 40;
  const binWidth = (max - min) / binCount || 1;
  const formatBin = (v: number) => {
    if (metric === 'finalValue') return `$${(v / 1000).toFixed(0)}k`;
    if (metric === 'cagr' || metric === 'maxDrawdown' || metric === 'volatility')
      return `${(v * 100).toFixed(1)}%`;
    return v.toFixed(2);
  };
  const bins: { range: string; count: number; minVal: number }[] = [];
  for (let i = 0; i < binCount; i++)
    bins.push({ range: formatBin(min + i * binWidth), count: 0, minVal: min + i * binWidth });
  for (const v of vals) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count++;
  }
  const medianVal = percentile(vals, 0.5);
  const meanVal = mean(vals);
  return {
    data: bins,
    medianLabel: formatBin(Math.floor((medianVal - min) / binWidth) * binWidth + min),
    meanLabel: formatBin(Math.floor((meanVal - min) / binWidth) * binWidth + min),
    medianVal,
    meanVal,
  };
}

function buildScenarioData(r: MonteCarloResult, startingValue: number) {
  const rp = r.representativePaths;
  if (!rp || !rp.best || rp.best.length === 0) return { data: [] };
  return {
    data: rp.best.map((_, i) => ({
      month: i,
      best: rp.best[i] * startingValue,
      p75: rp.p75[i] * startingValue,
      median: rp.median[i] * startingValue,
      p25: rp.p25[i] * startingValue,
      worst: rp.worst[i] * startingValue,
    })),
  };
}

const monthFormatter = (v: number) => {
  const y = v / 12;
  return Number.isInteger(y) ? `${y}y` : '';
};
const dollarKFormatter = (v: number) => `$${(v / 1000).toFixed(0)}k`;
const dollarFormatter = (v: number) =>
  `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const yearLabelFormatter = (l: number) => `${(l / 12).toFixed(1)} 年`;

const RANGE_AREAS = [
  { dataKey: 'p95', stackId: 'outer', fill: CHART_COLORS[0], fillOpacity: 0.06, name: 'P95' },
  { dataKey: 'p5', stackId: 'outer-base', fill: '#fff', fillOpacity: 1, name: '' },
  { dataKey: 'p75', stackId: 'inner', fill: CHART_COLORS[0], fillOpacity: 0.12, name: 'P75' },
  { dataKey: 'p25', stackId: 'inner-base', fill: '#fff', fillOpacity: 1, name: '' },
];

const RANGE_LINES = [
  { dataKey: 'p50', stroke: CHART_COLORS[0], strokeWidth: 2, name: '中位数' },
  { dataKey: 'p5', stroke: CHART_COLORS[3], strokeWidth: 0.8, dash: '4 2', name: 'P5' },
  { dataKey: 'p95', stroke: CHART_COLORS[4], strokeWidth: 0.8, dash: '4 2', name: 'P95' },
  { dataKey: 'p25', stroke: CHART_COLORS[1], strokeWidth: 0.8, dash: '3 3', name: 'P25' },
  { dataKey: 'p75', stroke: CHART_COLORS[2], strokeWidth: 0.8, dash: '3 3', name: 'P75' },
];

function SummaryTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const rows = buildSummaryData(r, startingValue);
  if (!rows) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderBottom: '2px solid var(--border-soft)',
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}
            >
              指标
            </th>
            {SUMMARY_STATS.map((s) => (
              <th
                key={s}
                style={{
                  textAlign: 'right',
                  padding: '8px 12px',
                  borderBottom: '2px solid var(--border-soft)',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border-soft)',
                  fontWeight: 500,
                  color: 'var(--text-strong)',
                }}
              >
                {row.metric}
              </td>
              {SUMMARY_STATS.map((s) => (
                <td
                  key={s}
                  style={{
                    textAlign: 'right',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-soft)',
                    fontFamily: 'monospace',
                    color: 'var(--text-body)',
                  }}
                >
                  {row.values[s]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RangeChart({ data }: { data: RangeDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={450}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickFormatter={monthFormatter}
          interval={11}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickFormatter={dollarKFormatter}
        />
        <Tooltip
          formatter={dollarFormatter}
          labelFormatter={yearLabelFormatter}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
        {RANGE_AREAS.map((a) => (
          <Area
            key={a.dataKey + a.stackId}
            type="monotone"
            dataKey={a.dataKey}
            stackId={a.stackId}
            stroke="none"
            fill={a.fill}
            fillOpacity={a.fillOpacity}
            name={a.name}
          />
        ))}
        {RANGE_LINES.map((l) => (
          <Line
            key={l.dataKey}
            type="monotone"
            dataKey={l.dataKey}
            stroke={l.stroke}
            strokeWidth={l.strokeWidth}
            strokeDasharray={l.dash}
            dot={false}
            name={l.name}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function RangeTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const data = buildRangeData(r, startingValue);
  if (data.length === 0) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  return <RangeChart data={data} />;
}

function SuccessTab({ r }: { r: MonteCarloResult }) {
  const data = buildSuccessData(r);
  if (data.length === 0) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          label={{
            value: '年限',
            position: 'insideBottom',
            offset: -5,
            fontSize: 12,
            fill: 'var(--text-muted)',
          }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          tickFormatter={(v: number) => `${v}%`}
          domain={[0, 100]}
        />
        <Tooltip formatter={(v: number) => `${v}%`} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
        <Line
          type="monotone"
          dataKey="survival"
          stroke={CHART_COLORS[2]}
          strokeWidth={2}
          dot={false}
          name="存活概率 (终值>0)"
        />
        <Line
          type="monotone"
          dataKey="capitalPreservation"
          stroke={CHART_COLORS[0]}
          strokeWidth={2}
          dot={false}
          name="保本概率 (终值≥初始资金)"
        />
        <Line
          type="monotone"
          dataKey="profit"
          stroke={CHART_COLORS[1]}
          strokeWidth={2}
          dot={false}
          name="盈利概率 (终值>初始资金)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DistMetricSelector({
  distMetric,
  setDistMetric,
}: {
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {(Object.keys(METRIC_LABELS) as DistMetric[]).map((key) => (
        <button
          key={key}
          onClick={() => setDistMetric(key)}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 500,
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-control)',
            cursor: 'pointer',
            backgroundColor: distMetric === key ? 'var(--brand)' : 'var(--bg-elevated)',
            color: distMetric === key ? '#fff' : 'var(--text-body)',
            transition: 'all 0.15s',
          }}
        >
          {METRIC_LABELS[key]}
        </button>
      ))}
    </div>
  );
}

function DistHistogramChart({
  data,
  medianLabel,
  meanLabel,
  medianVal,
  meanVal,
  distMetric,
}: {
  data: { range: string; count: number }[];
  medianLabel: string;
  meanLabel: string;
  medianVal?: number;
  meanVal?: number;
  distMetric: DistMetric;
}) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={3} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar
          dataKey="count"
          fill={CHART_COLORS[0]}
          fillOpacity={0.7}
          name="频次"
          radius={[2, 2, 0, 0]}
        />
        <ReferenceLine
          x={medianLabel}
          stroke={CHART_COLORS[2]}
          strokeDasharray="4 2"
          label={{
            value: `中位数: ${medianVal !== undefined ? METRIC_FORMAT[distMetric](medianVal) : ''}`,
            position: 'top',
            fontSize: 11,
            fill: CHART_COLORS[2],
          }}
        />
        <ReferenceLine
          x={meanLabel}
          stroke={CHART_COLORS[1]}
          strokeDasharray="4 2"
          label={{
            value: `均值: ${meanVal !== undefined ? METRIC_FORMAT[distMetric](meanVal) : ''}`,
            position: 'top',
            fontSize: 11,
            fill: CHART_COLORS[1],
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DistributionsTab({
  r,
  distMetric,
  setDistMetric,
  startingValue,
}: {
  r: MonteCarloResult;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
  startingValue: number;
}) {
  if (!r.perPathMetrics || r.perPathMetrics.length === 0)
    return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  const { data, medianLabel, meanLabel, medianVal, meanVal } = buildDistHistogram(
    r.perPathMetrics,
    distMetric,
    startingValue,
  );
  return (
    <div>
      <DistMetricSelector distMetric={distMetric} setDistMetric={setDistMetric} />
      <DistHistogramChart
        data={data}
        medianLabel={medianLabel}
        meanLabel={meanLabel}
        medianVal={medianVal}
        meanVal={meanVal}
        distMetric={distMetric}
      />
    </div>
  );
}

function ScenariosTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const { data } = buildScenarioData(r, startingValue);
  if (data.length === 0) return <div style={EMPTY_DATA_STYLE}>暂无数据</div>;
  return (
    <ResponsiveContainer width="100%" height={450}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickFormatter={monthFormatter}
          interval={11}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickFormatter={dollarKFormatter}
        />
        <Tooltip
          formatter={dollarFormatter}
          labelFormatter={yearLabelFormatter}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
        <Line
          type="monotone"
          dataKey="best"
          stroke={CHART_COLORS[2]}
          strokeWidth={2}
          dot={false}
          name="Best"
        />
        <Line
          type="monotone"
          dataKey="p75"
          stroke={CHART_COLORS[0]}
          strokeWidth={1.5}
          dot={false}
          name="P75"
        />
        <Line
          type="monotone"
          dataKey="median"
          stroke={CHART_COLORS[4]}
          strokeWidth={2.5}
          dot={false}
          name="Median"
        />
        <Line
          type="monotone"
          dataKey="p25"
          stroke={CHART_COLORS[1]}
          strokeWidth={1.5}
          dot={false}
          name="P25"
        />
        <Line
          type="monotone"
          dataKey="worst"
          stroke={CHART_COLORS[3]}
          strokeWidth={2}
          dot={false}
          name="Worst"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TabContent({
  activeTab,
  r,
  startingValue,
  distMetric,
  setDistMetric,
}: {
  activeTab: ResultTab;
  r: MonteCarloResult;
  startingValue: number;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
}) {
  switch (activeTab) {
    case 'summary':
      return <SummaryTab r={r} startingValue={startingValue} />;
    case 'range':
      return <RangeTab r={r} startingValue={startingValue} />;
    case 'success':
      return <SuccessTab r={r} />;
    case 'distributions':
      return (
        <DistributionsTab
          r={r}
          distMetric={distMetric}
          setDistMetric={setDistMetric}
          startingValue={startingValue}
        />
      );
    case 'scenarios':
      return <ScenariosTab r={r} startingValue={startingValue} />;
  }
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={statCardStyle}>
      <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          fontFamily: 'monospace',
          color: color ?? 'var(--text-strong)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatsGrid({
  r,
  startingValue,
  numSimulations,
}: {
  r: MonteCarloResult;
  startingValue: number;
  numSimulations: number;
}) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}
    >
      <StatCard label="中位终值" value={fmtDollar(r.statistics.medianFinalValue * startingValue)} />
      <StatCard label="均值终值" value={fmtDollar(r.statistics.meanFinalValue * startingValue)} />
      <StatCard
        label="保本概率"
        value={`${(r.statistics.successRate * 100).toFixed(1)}%`}
        color="var(--success)"
      />
      <StatCard label="模拟次数" value={`${r.perPathMetrics?.length ?? numSimulations}`} />
    </div>
  );
}

function ResultTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ResultTab;
  onTabChange: (tab: ResultTab) => void;
}) {
  return (
    <div className="result-tabs" style={{ marginBottom: 16 }}>
      {RESULT_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ResultsDisplay({
  r,
  label,
  colorIdx,
  portfolioMode,
  activeTab,
  startingValue,
  numSimulations,
  distMetric,
  setDistMetric,
  onTabChange,
}: {
  r: MonteCarloResult;
  label: string;
  colorIdx: number;
  portfolioMode: PortfolioMode;
  activeTab: ResultTab;
  startingValue: number;
  numSimulations: number;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
  onTabChange: (tab: ResultTab) => void;
}) {
  return (
    <div key={label}>
      {portfolioMode === 2 && (
        <div
          style={{
            fontWeight: 600,
            fontSize: 15,
            color: CHART_COLORS[colorIdx],
            marginBottom: 12,
            marginTop: 8,
          }}
        >
          {label}
        </div>
      )}
      <StatsGrid r={r} startingValue={startingValue} numSimulations={numSimulations} />
      <ResultTabBar activeTab={activeTab} onTabChange={onTabChange} />
      <div style={{ minHeight: 300 }}>
        <TabContent
          activeTab={activeTab}
          r={r}
          startingValue={startingValue}
          distMetric={distMetric}
          setDistMetric={setDistMetric}
        />
      </div>
    </div>
  );
}

function McErrorState({ error }: { error: string }) {
  return (
    <div
      className="bt-results-card card"
      style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
    >
      模拟失败：{error}
    </div>
  );
}

function McEmptyState() {
  return (
    <div
      className="bt-results-card card"
      style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}
    >
      配置左侧参数并点击「开始模拟」查看结果
    </div>
  );
}

function MonteCarloResultsPanel({
  error,
  results1,
  results2,
  portfolios,
  portfolioMode,
  activeTab,
  setActiveTab,
  startingValue,
  numSimulations,
  distMetric,
  setDistMetric,
}: {
  error: string | null;
  results1: MonteCarloResult | null;
  results2: MonteCarloResult | null;
  portfolios: PortfolioState[];
  portfolioMode: PortfolioMode;
  activeTab: ResultTab;
  setActiveTab: (tab: ResultTab) => void;
  startingValue: number;
  numSimulations: number;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
}) {
  if (error) return <McErrorState error={error} />;
  if (!results1 && !results2) return <McEmptyState />;
  return (
    <div className="bt-results-card card">
      {results1 && (
        <ResultsDisplay
          r={results1}
          label={portfolios[0].name}
          colorIdx={0}
          portfolioMode={portfolioMode}
          activeTab={activeTab}
          startingValue={startingValue}
          numSimulations={numSimulations}
          distMetric={distMetric}
          setDistMetric={setDistMetric}
          onTabChange={setActiveTab}
        />
      )}
      {results2 && (
        <>
          <div
            style={{ borderTop: '1px solid var(--border-soft)', marginTop: 24, paddingTop: 8 }}
          />
          <ResultsDisplay
            r={results2}
            label={portfolios[1].name}
            colorIdx={1}
            portfolioMode={portfolioMode}
            activeTab={activeTab}
            startingValue={startingValue}
            numSimulations={numSimulations}
            distMetric={distMetric}
            setDistMetric={setDistMetric}
            onTabChange={setActiveTab}
          />
        </>
      )}
    </div>
  );
}

export { MonteCarloResultsPanel };
