import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import { SortableTable, type Column } from '../SortableTable';
import type { TacticalGridState } from '../../hooks/useTacticalGridState.js';
import type { TacticalGridResponse, HeatmapData } from './types.js';
import {
  tooltipStyle,
  heatmapCellStyle,
  heatmapHeaderStyle,
  heatmapRowHeaderStyle,
} from './types.js';
import {
  fmtPct,
  fmtRatio,
  getHeatmapColor,
  getHeatmapTextColor,
  computeHeatmapRange,
  getObjectiveLabel,
  getCellDisplayValue,
} from './utils.js';

function SummaryItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: color ?? 'var(--text-strong)',
          marginLeft: 6,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ResultsSummary({
  results,
  paramLabels,
}: {
  results: TacticalGridResponse;
  paramLabels: { p1: string; p2: string };
}) {
  const { bestCombination: best } = results;
  return (
    <div
      className="card"
      style={{
        padding: 12,
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <SummaryItem label="参数组合数" value={results.totalCombinations} />
      <SummaryItem label={`最优 ${paramLabels.p1}`} value={best.param1} color="var(--brand)" />
      <SummaryItem label={`最优 ${paramLabels.p2}`} value={best.param2} color="var(--brand)" />
      <SummaryItem label="最优 CAGR" value={fmtPct(best.cagr)} color="var(--success)" />
      <SummaryItem label="最优 Sharpe" value={fmtRatio(best.sharpe)} color="var(--success)" />
    </div>
  );
}

function TopCombinationsTable({
  results,
  paramLabels,
}: {
  results: TacticalGridResponse;
  paramLabels: { p1: string; p2: string };
}) {
  const topResultsWithRank = (results.topResults ?? []).map((r, i) => ({ ...r, rank: i + 1 }));
  const topColumns: Column<(typeof topResultsWithRank)[number]>[] = [
    { key: 'rank', label: '#', sortValue: (r) => r.rank },
    { key: 'param1', label: paramLabels.p1, sortValue: (r) => r.param1 },
    { key: 'param2', label: paramLabels.p2, sortValue: (r) => r.param2 },
    { key: 'cagr', label: 'CAGR', render: (r) => fmtPct(r.cagr), sortValue: (r) => r.cagr },
    {
      key: 'maxDrawdown',
      label: '最大回撤',
      render: (r) => fmtPct(r.maxDrawdown),
      sortValue: (r) => r.maxDrawdown,
    },
    {
      key: 'sharpe',
      label: 'Sharpe',
      render: (r) => fmtRatio(r.sharpe),
      sortValue: (r) => r.sharpe,
    },
    {
      key: 'stdev',
      label: '波动率',
      render: (r) => fmtPct(r.stdev),
      sortValue: (r) => r.stdev,
    },
    {
      key: 'calmar',
      label: 'Calmar',
      render: (r) => fmtRatio(r.calmar),
      sortValue: (r) => r.calmar,
    },
    {
      key: 'totalReturn',
      label: '累计收益',
      render: (r) => fmtPct(r.totalReturn),
      sortValue: (r) => r.totalReturn,
    },
  ];
  return (
    <div className="chart-card">
      <div className="chart-card-title">Top {results.topResults.length} 参数组合</div>
      <SortableTable
        columns={topColumns}
        data={topResultsWithRank}
        initialSortKey="rank"
        initialSortDir="asc"
      />
    </div>
  );
}

function BestGrowthChart({
  results,
  paramLabels,
}: {
  results: TacticalGridResponse;
  paramLabels: { p1: string; p2: string };
}) {
  const { bestCombination: best } = results;
  if (best.growthCurve.length === 0) return null;
  return (
    <div className="chart-card">
      <div className="chart-card-title">
        最优组合收益曲线（{paramLabels.p1}={best.param1}, {paramLabels.p2}={best.param2}）
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={best.growthCurve} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string) => `日期: ${label}`}
            formatter={(value: number) => [`$${value.toLocaleString()}`, '净值']}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="组合净值"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HeatmapCell({
  cell,
  p1,
  p2,
  heatmap,
  range,
  objectiveLabel,
}: {
  cell: number | null;
  p1: number;
  p2: number;
  heatmap: HeatmapData;
  range: { min: number; max: number };
  objectiveLabel: string;
}) {
  if (cell == null) {
    return <td style={{ ...heatmapCellStyle, color: 'var(--text-muted)' }}>—</td>;
  }
  const bg = getHeatmapColor(cell, range.min, range.max);
  const fg = getHeatmapTextColor(cell, range.min, range.max);
  const displayVal = getCellDisplayValue(cell, heatmap.objective);
  return (
    <td
      title={`${heatmap.param1Label}=${p1}, ${heatmap.param2Label}=${p2}\n${objectiveLabel}: ${displayVal}`}
      style={{
        ...heatmapCellStyle,
        backgroundColor: bg,
        color: fg,
        fontWeight: 600,
        fontFamily: 'monospace',
        cursor: 'default',
      }}
    >
      {displayVal}
    </td>
  );
}

function HeatmapLegend({ objectiveLabel }: { objectiveLabel: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        fontSize: 11,
        color: 'var(--text-muted)',
      }}
    >
      <span>{objectiveLabel} 低</span>
      <div
        style={{
          width: 120,
          height: 12,
          borderRadius: 2,
          background:
            'linear-gradient(to right, hsl(0,70%,45%), hsl(60,70%,45%), hsl(120,70%,45%))',
        }}
      />
      <span>{objectiveLabel} 高</span>
    </div>
  );
}

function HeatmapView({ heatmap }: { heatmap: HeatmapData }) {
  const { param1Values, param2Values, matrix } = heatmap;
  const range = computeHeatmapRange(matrix);
  const objectiveLabel = getObjectiveLabel(heatmap.objective);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, margin: '8px 0' }}>
        <thead>
          <tr>
            <th style={heatmapHeaderStyle}>
              {heatmap.param1Label} \ {heatmap.param2Label}
            </th>
            {param2Values.map((p2) => (
              <th key={p2} style={{ ...heatmapHeaderStyle, minWidth: 56 }}>
                {p2}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {param1Values.map((p1, i) => (
            <tr key={p1}>
              <td style={heatmapRowHeaderStyle}>{p1}</td>
              {param2Values.map((p2, j) => (
                <HeatmapCell
                  key={p2}
                  cell={matrix[i]?.[j] ?? null}
                  p1={p1}
                  p2={p2}
                  heatmap={heatmap}
                  range={range}
                  objectiveLabel={objectiveLabel}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <HeatmapLegend objectiveLabel={objectiveLabel} />
    </div>
  );
}

export default function GridResultsPanel({ state }: { state: TacticalGridState }) {
  const { error, results, isLoading, paramLabels } = state;
  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          搜索失败：{error}
        </div>
      )}
      {results && (
        <>
          <ResultsSummary results={results} paramLabels={paramLabels} />
          {results.heatmap.matrix.length > 0 && (
            <div className="chart-card">
              <div className="chart-card-title">
                参数热力图（{results.heatmap.param1Label} × {results.heatmap.param2Label}）
              </div>
              <HeatmapView heatmap={results.heatmap} />
            </div>
          )}
          <TopCombinationsTable results={results} paramLabels={paramLabels} />
          <BestGrowthChart results={results} paramLabels={paramLabels} />
        </>
      )}
      {!results && !error && !isLoading && (
        <div
          className="card"
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
        >
          设置左侧参数后点击「开始网格搜索」查看结果
        </div>
      )}
    </div>
  );
}
