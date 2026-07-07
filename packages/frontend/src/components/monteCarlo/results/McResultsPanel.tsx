/** @file MonteCarlo results panel components */
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
import type { MonteCarloResult } from '@backtest/shared';
import type {
  ResultTab,
  DistMetric,
  RangeDataPoint,
  PortfolioMode,
  PortfolioState,
} from '../types.js';
import { SUMMARY_STATS } from '../types.js';
import {
  fmtDollar,
  METRIC_LABELS,
  METRIC_FORMAT,
  EMPTY_DATA_STYLE,
  TOOLTIP_STYLE,
  statCardStyle,
  buildSummaryData,
  buildRangeData,
  buildSuccessData,
  buildDistHistogram,
  buildScenarioData,
  monthFormatter,
  dollarKFormatter,
  dollarFormatter,
  yearLabelFormatter,
  RANGE_AREAS,
  RANGE_LINES,
} from '../utils.js';

const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'range', label: 'Portfolio Value Range' },
  { key: 'success', label: 'Portfolio Success' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'scenarios', label: 'Scenarios' },
];

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

export function MonteCarloResultsPanel({
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
          {' '}
          <div
            style={{ borderTop: '1px solid var(--border-soft)', marginTop: 24, paddingTop: 8 }}
          />{' '}
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
          />{' '}
        </>
      )}
    </div>
  );
}
