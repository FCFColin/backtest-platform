/**
 * @file 战术网格搜索结果面板子组件
 * @description 承载汇总卡片、Top 参数组合表、最佳增长曲线、热力图等结果展示
 */
import { useTranslation } from 'react-i18next';
import { fmtPct, fmtNum } from '@/utils/format';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import { AnalysisErrorAlert } from '@/components/resultsShell.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import {
  computeHeatmapRange,
  getCellDisplayValue,
  getHeatmapColor,
  getHeatmapTextColor,
  getObjectiveLabelKey,
  heatmapCellStyle,
  heatmapHeaderStyle,
  heatmapRowHeaderStyle,
} from './tacticalGridUtils.js';
import type { HeatmapData, TacticalGridResponse } from './tacticalGridUtils.js';
import type { TacticalGridState } from '@/hooks/useTacticalGridState';

// ===== 汇总卡片 =====

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
  const { t } = useTranslation();
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
      <SummaryItem
        label={t('tacticalGrid.results.combinations')}
        value={results.totalCombinations}
      />
      <SummaryItem
        label={t('tacticalGrid.results.bestParam', { label: paramLabels.p1 })}
        value={best.param1}
        color="var(--brand)"
      />
      <SummaryItem
        label={t('tacticalGrid.results.bestParam', { label: paramLabels.p2 })}
        value={best.param2}
        color="var(--brand)"
      />
      <SummaryItem
        label={t('tacticalGrid.results.bestCagr')}
        value={fmtPct(best.cagr)}
        color="var(--success)"
      />
      <SummaryItem
        label={t('tacticalGrid.results.bestSharpe')}
        value={fmtNum(best.sharpe, 3)}
        color="var(--success)"
      />
    </div>
  );
}

// ===== Top 参数组合表 =====

function TopCombinationsTable({
  results,
  paramLabels,
}: {
  results: TacticalGridResponse;
  paramLabels: { p1: string; p2: string };
}) {
  const { t } = useTranslation();
  const topResultsWithRank = (results.topResults ?? []).map((r, i) => ({ ...r, rank: i + 1 }));
  const topColumns: Column<(typeof topResultsWithRank)[number]>[] = [
    { key: 'rank', label: '#', sortValue: (r) => r.rank },
    { key: 'param1', label: paramLabels.p1, sortValue: (r) => r.param1 },
    { key: 'param2', label: paramLabels.p2, sortValue: (r) => r.param2 },
    { key: 'cagr', label: 'CAGR', render: (r) => fmtPct(r.cagr), sortValue: (r) => r.cagr },
    {
      key: 'maxDrawdown',
      label: t('tacticalGrid.results.maxDrawdown'),
      render: (r) => fmtPct(r.maxDrawdown),
      sortValue: (r) => r.maxDrawdown,
    },
    {
      key: 'sharpe',
      label: 'Sharpe',
      render: (r) => fmtNum(r.sharpe, 3),
      sortValue: (r) => r.sharpe,
    },
    {
      key: 'stdev',
      label: t('tacticalGrid.results.stdev'),
      render: (r) => fmtPct(r.stdev),
      sortValue: (r) => r.stdev,
    },
    {
      key: 'calmar',
      label: 'Calmar',
      render: (r) => fmtNum(r.calmar, 3),
      sortValue: (r) => r.calmar,
    },
    {
      key: 'totalReturn',
      label: t('tacticalGrid.results.totalReturn'),
      render: (r) => fmtPct(r.totalReturn),
      sortValue: (r) => r.totalReturn,
    },
  ];
  return (
    <ChartCard
      title={t('tacticalGrid.results.topCombinationsTitle', { count: results.topResults.length })}
    >
      <SortableTable
        columns={topColumns}
        data={topResultsWithRank}
        initialSortKey="rank"
        initialSortDir="asc"
      />
    </ChartCard>
  );
}

// ===== 最佳增长曲线 =====

function BestGrowthChart({
  results,
  paramLabels,
}: {
  results: TacticalGridResponse;
  paramLabels: { p1: string; p2: string };
}) {
  const { t } = useTranslation();
  const { bestCombination: best } = results;
  if (best.growthCurve.length === 0) return null;
  return (
    <ChartCard
      title={t('tacticalGrid.results.bestGrowthTitle', {
        p1Label: paramLabels.p1,
        p1: best.param1,
        p2Label: paramLabels.p2,
        p2: best.param2,
      })}
    >
      <TimeSeriesLineChart
        data={best.growthCurve}
        height={350}
        tooltipLabelFormatter={(label) => t('tacticalGrid.results.dateLabel', { label })}
        tooltipValueFormatter={(value) => [
          `$${value.toLocaleString()}`,
          t('tacticalGrid.results.netValue'),
        ]}
        series={[{ dataKey: 'value', legendName: t('tacticalGrid.results.portfolioNetValue') }]}
      />
    </ChartCard>
  );
}

// ===== 热力图 =====

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
  const { t } = useTranslation();
  if (cell == null) {
    return <td style={{ ...heatmapCellStyle, color: 'var(--text-muted)' }}>—</td>;
  }
  const bg = getHeatmapColor(cell, range.min, range.max);
  const fg = getHeatmapTextColor(cell, range.min, range.max);
  const displayVal = getCellDisplayValue(cell, heatmap.objective);
  return (
    <td
      title={t('tacticalGrid.results.heatmapCellTitle', {
        p1Label: heatmap.param1Label,
        p1,
        p2Label: heatmap.param2Label,
        p2,
        objectiveLabel,
        value: displayVal,
      })}
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
  const { t } = useTranslation();
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
      <span>{t('tacticalGrid.results.legendLow', { label: objectiveLabel })}</span>
      <div
        style={{
          width: 120,
          height: 12,
          borderRadius: 2,
          background:
            'linear-gradient(to right, hsl(0,70%,45%), hsl(60,70%,45%), hsl(120,70%,45%))',
        }}
      />
      <span>{t('tacticalGrid.results.legendHigh', { label: objectiveLabel })}</span>
    </div>
  );
}

function HeatmapView({ heatmap }: { heatmap: HeatmapData }) {
  const { t } = useTranslation();
  const { param1Values, param2Values, matrix } = heatmap;
  const range = computeHeatmapRange(matrix);
  const objectiveLabel = t(getObjectiveLabelKey(heatmap.objective));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, margin: '8px 0' }}>
        <thead>
          <tr>
            <th style={heatmapHeaderStyle}>
              {t('tacticalGrid.results.heatmapAxisLabel', {
                p1Label: heatmap.param1Label,
                p2Label: heatmap.param2Label,
              })}
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

// ===== 结果面板入口 =====

/** 战术网格搜索结果面板（错误态 + 汇总 + 热力图 + Top 表 + 最佳增长曲线 + 空态） */
export function GridResultsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { error, results, isLoading, paramLabels } = state;
  return (
    <div className="space-y-4">
      <AnalysisErrorAlert error={error} prefix={`${t('tacticalGrid.results.searchFailed')}：`} />
      {results && (
        <>
          <ResultsSummary results={results} paramLabels={paramLabels} />
          {results.heatmap.matrix.length > 0 && (
            <ChartCard
              title={t('tacticalGrid.results.heatmapTitle', {
                p1Label: results.heatmap.param1Label,
                p2Label: results.heatmap.param2Label,
              })}
            >
              <HeatmapView heatmap={results.heatmap} />
            </ChartCard>
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
          {t('tacticalGrid.results.noResultsHint')}
        </div>
      )}
    </div>
  );
}
