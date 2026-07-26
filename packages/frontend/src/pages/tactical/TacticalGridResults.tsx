/**
 * @file 战术网格搜索结果面板子组件
 * @description 承载汇总卡片、Top 参数组合表、最佳增长曲线、热力图等结果展示。
 *   容器统一用 shadcn Card + token 类名；数字采用 font-mono tabular-nums 对齐。
 */
import { useTranslation } from 'react-i18next';
import { Grid3x3 } from 'lucide-react';
import { fmtPct, fmtNum } from '@/utils/format';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import ErrorBanner from '@/components/ErrorBanner';
import { SortableTable, type Column } from '@/components/SortableTable';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart';
import {
  computeHeatmapRange,
  getCellDisplayValue,
  getHeatmapColor,
  getHeatmapTextColor,
  getObjectiveLabelKey,
} from './tacticalGridUtils';
import type { HeatmapData, TacticalGridResponse, TopCombinationResult } from './tacticalGridUtils';
import type { TacticalGridState } from '@/hooks/useTacticalGridState';

// ===== 汇总卡片 =====

type StatTone = 'brand' | 'success' | 'default';

/** 汇总 StatCard：标签 + 数值（数值可着色） */
function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: StatTone;
}) {
  const toneClass =
    tone === 'brand' ? 'text-brand' : tone === 'success' ? 'text-success' : 'text-fg';
  return (
    <div className="rounded-lg border border-border-subtle bg-input-bg/30 px-3 py-2.5">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className={`mt-0.5 font-mono text-h2 tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

/** 汇总卡片网格 */
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label={t('tacticalGrid.results.combinations')} value={results.totalCombinations} />
      <StatCard
        label={t('tacticalGrid.results.bestParam', { label: paramLabels.p1 })}
        value={best.param1}
        tone="brand"
      />
      <StatCard
        label={t('tacticalGrid.results.bestParam', { label: paramLabels.p2 })}
        value={best.param2}
        tone="brand"
      />
      <StatCard
        label={t('tacticalGrid.results.bestCagr')}
        value={fmtPct(best.cagr)}
        tone="success"
      />
      <StatCard
        label={t('tacticalGrid.results.bestSharpe')}
        value={fmtNum(best.sharpe, 3)}
        tone="success"
      />
    </div>
  );
}

// ===== Top 参数组合表 =====

type RankedResult = TopCombinationResult & { rank: number };

/** Top 参数组合表的列定义 */
function buildTopColumns(
  t: (k: string) => string,
  paramLabels: { p1: string; p2: string },
): Column<RankedResult>[] {
  const num = (v: number | string) => <span className="font-mono tabular-nums">{v}</span>;
  return [
    { key: 'rank', label: '#', sortValue: (r) => r.rank, render: (r) => num(r.rank) },
    {
      key: 'param1',
      label: paramLabels.p1,
      sortValue: (r) => r.param1,
      render: (r) => num(r.param1),
    },
    {
      key: 'param2',
      label: paramLabels.p2,
      sortValue: (r) => r.param2,
      render: (r) => num(r.param2),
    },
    { key: 'cagr', label: 'CAGR', render: (r) => num(fmtPct(r.cagr)), sortValue: (r) => r.cagr },
    {
      key: 'maxDrawdown',
      label: t('tacticalGrid.results.maxDrawdown'),
      render: (r) => num(fmtPct(r.maxDrawdown)),
      sortValue: (r) => r.maxDrawdown,
    },
    {
      key: 'sharpe',
      label: 'Sharpe',
      render: (r) => num(fmtNum(r.sharpe, 3)),
      sortValue: (r) => r.sharpe,
    },
    {
      key: 'stdev',
      label: t('tacticalGrid.results.stdev'),
      render: (r) => num(fmtPct(r.stdev)),
      sortValue: (r) => r.stdev,
    },
    {
      key: 'calmar',
      label: 'Calmar',
      render: (r) => num(fmtNum(r.calmar, 3)),
      sortValue: (r) => r.calmar,
    },
    {
      key: 'totalReturn',
      label: t('tacticalGrid.results.totalReturn'),
      render: (r) => num(fmtPct(r.totalReturn)),
      sortValue: (r) => r.totalReturn,
    },
  ];
}

function TopCombinationsTable({
  results,
  paramLabels,
}: {
  results: TacticalGridResponse;
  paramLabels: { p1: string; p2: string };
}) {
  const { t } = useTranslation();
  const rows = (results.topResults ?? []).map((r, i) => ({ ...r, rank: i + 1 }));
  const columns = buildTopColumns(t, paramLabels);
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">
        {t('tacticalGrid.results.topCombinationsTitle', { count: results.topResults.length })}
      </h3>
      <SortableTable columns={columns} data={rows} initialSortKey="rank" initialSortDir="asc" />
    </Card>
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
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">
        {t('tacticalGrid.results.bestGrowthTitle', {
          p1Label: paramLabels.p1,
          p1: best.param1,
          p2Label: paramLabels.p2,
          p2: best.param2,
        })}
      </h3>
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
    </Card>
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
    return (
      <td className="cursor-default border-b border-r border-border-subtle px-2 py-1.5 text-center text-caption text-fg-tertiary">
        -
      </td>
    );
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
      className="cursor-default border-b border-r border-border-subtle px-2 py-1.5 text-center font-mono text-caption font-semibold tabular-nums"
      style={{ backgroundColor: bg, color: fg }}
    >
      {displayVal}
    </td>
  );
}

function HeatmapLegend({ objectiveLabel }: { objectiveLabel: string }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex items-center gap-2 text-caption text-fg-tertiary">
      <span>{t('tacticalGrid.results.legendLow', { label: objectiveLabel })}</span>
      <div
        className="h-3 w-28 rounded-sm"
        style={{
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
    <div className="overflow-x-auto">
      <table className="my-2 border-collapse text-caption">
        <thead>
          <tr>
            <th className="sticky top-0 z-10 min-w-[56px] border-b-2 border-r border-border-subtle bg-elevated px-2 py-1.5 text-caption font-semibold text-fg-tertiary">
              {t('tacticalGrid.results.heatmapAxisLabel', {
                p1Label: heatmap.param1Label,
                p2Label: heatmap.param2Label,
              })}
            </th>
            {param2Values.map((p2) => (
              <th
                key={p2}
                className="sticky top-0 z-10 min-w-[56px] border-b-2 border-r border-border-subtle bg-elevated px-2 py-1.5 text-caption font-semibold text-fg-tertiary"
              >
                {p2}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {param1Values.map((p1, i) => (
            <tr key={p1}>
              <td className="border-b border-r border-border-subtle bg-input-bg/40 px-2 py-1.5 text-caption font-semibold text-fg">
                {p1}
              </td>
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
    <div className="flex flex-col gap-3">
      {error && <ErrorBanner message={`${t('tacticalGrid.results.searchFailed')}：${error}`} />}
      {results && (
        <>
          <ResultsSummary results={results} paramLabels={paramLabels} />
          {results.heatmap.matrix.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-3 text-h3 text-fg">
                {t('tacticalGrid.results.heatmapTitle', {
                  p1Label: results.heatmap.param1Label,
                  p2Label: results.heatmap.param2Label,
                })}
              </h3>
              <HeatmapView heatmap={results.heatmap} />
            </Card>
          )}
          <TopCombinationsTable results={results} paramLabels={paramLabels} />
          <BestGrowthChart results={results} paramLabels={paramLabels} />
        </>
      )}
      {!results && !error && !isLoading && (
        <EmptyState
          icon={Grid3x3}
          title={t('tacticalGrid.results.noResultsHint')}
          className="py-16"
        />
      )}
    </div>
  );
}
