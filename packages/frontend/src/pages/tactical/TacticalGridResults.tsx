import { useTranslation } from 'react-i18next';
import { Grid3x3 } from 'lucide-react';
import { fmtPct, fmtNum } from '@/utils/format';
import { Card } from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell';
import { SortableTable, type TableColumn } from '@/components/tables';
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
type StatTone = 'brand' | 'success' | 'default';
const HEATMAP_TH =
  'sticky top-0 z-10 min-w-[56px] border-b-2 border-r border-border-subtle bg-elevated px-2 py-1.5 text-caption font-semibold text-fg-tertiary';
const TONE_CLASS: Record<StatTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  default: 'text-fg',
};
function ResultsSummary({
  results,
  paramLabels,
}: {
  results: TacticalGridResponse;
  paramLabels: { p1: string; p2: string };
}) {
  const { t } = useTranslation();
  const { bestCombination: best } = results;
  const stats: Array<{ label: string; value: string | number; tone?: StatTone }> = [
    { label: t('Combinations'), value: results.totalCombinations },
    { label: t('Best {{label}}', { label: paramLabels.p1 }), value: best.param1, tone: 'brand' },
    { label: t('Best {{label}}', { label: paramLabels.p2 }), value: best.param2, tone: 'brand' },
    { label: t('Best CAGR'), value: fmtPct(best.cagr), tone: 'success' },
    { label: t('Best Sharpe'), value: fmtNum(best.sharpe, 3), tone: 'success' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-border-subtle bg-input-bg/30 px-3 py-2.5"
        >
          <div className="text-caption text-fg-tertiary">{s.label}</div>
          <div
            className={`mt-0.5 font-mono text-h2 tabular-nums ${TONE_CLASS[s.tone ?? 'default']}`}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
type RankedResult = TopCombinationResult & { rank: number };
function buildTopColumns(
  t: (k: string) => string,
  paramLabels: { p1: string; p2: string },
): TableColumn<RankedResult>[] {
  const num = (v: number | string) => <span className="font-mono tabular-nums">{v}</span>;
  const col = (
    key: keyof RankedResult,
    label: string,
    fmt?: (v: number) => string | number,
  ): TableColumn<RankedResult> => ({
    key,
    label,
    sortValue: (r) => r[key] as number,
    render: (r) => num(fmt ? fmt(r[key] as number) : (r[key] as number)),
  });
  return [
    col('rank', '#'),
    col('param1', paramLabels.p1),
    col('param2', paramLabels.p2),
    col('cagr', t('stats.cagr'), fmtPct),
    col('maxDrawdown', t('Max Drawdown'), fmtPct),
    col('sharpe', 'Sharpe', (v) => fmtNum(v, 3)),
    col('stdev', t('Volatility'), fmtPct),
    col('calmar', 'Calmar', (v) => fmtNum(v, 3)),
    col('totalReturn', t('stats.totalReturn'), fmtPct),
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
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">
        {t('Top {{count}} Combinations', { count: results.topResults.length })}
      </h3>
      <SortableTable
        columns={buildTopColumns(t, paramLabels)}
        data={rows}
        initialSortKey="rank"
        initialSortDir="asc"
      />
    </Card>
  );
}
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
        {t('Best Combination Growth Curve ({{p1Label}}={{p1}}, {{p2Label}}={{p2}})', {
          p1Label: paramLabels.p1,
          p1: best.param1,
          p2Label: paramLabels.p2,
          p2: best.param2,
        })}
      </h3>
      <TimeSeriesLineChart
        data={best.growthCurve}
        height={350}
        tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
        tooltipValueFormatter={(value) => [`$${value.toLocaleString()}`, t('Net Value')]}
        series={[{ dataKey: 'value', legendName: t('Portfolio Net Value') }]}
      />
    </Card>
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
  const { t } = useTranslation();
  if (cell == null) {
    return (
      <td className="cursor-default border-b border-r border-border-subtle px-2 py-1.5 text-center text-caption text-fg-tertiary">
        -
      </td>
    );
  }
  const displayVal = getCellDisplayValue(cell, heatmap.objective);
  return (
    <td
      title={t('{{p1Label}}={{p1}}, {{p2Label}}={{p2}}\n{{objectiveLabel}}: {{value}}', {
        p1Label: heatmap.param1Label,
        p1,
        p2Label: heatmap.param2Label,
        p2,
        objectiveLabel,
        value: displayVal,
      })}
      className="cursor-default border-b border-r border-border-subtle px-2 py-1.5 text-center font-mono text-caption font-semibold tabular-nums"
      style={{
        backgroundColor: getHeatmapColor(cell, range.min, range.max),
        color: getHeatmapTextColor(cell, range.min, range.max),
      }}
    >
      {displayVal}
    </td>
  );
}
function HeatmapLegend({ objectiveLabel }: { objectiveLabel: string }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex items-center gap-2 text-caption text-fg-tertiary">
      <span>{t('{{label}} Low', { label: objectiveLabel })}</span>
      <div
        className="h-3 w-28 rounded-sm"
        style={{
          background:
            'linear-gradient(to right, hsl(0,70%,45%), hsl(60,70%,45%), hsl(120,70%,45%))',
        }}
      />
      <span>{t('{{label}} High', { label: objectiveLabel })}</span>
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
            <th className={HEATMAP_TH}>
              {t('{{p1Label}}  {{p2Label}}', {
                p1Label: heatmap.param1Label,
                p2Label: heatmap.param2Label,
              })}
            </th>
            {param2Values.map((p2) => (
              <th key={p2} className={HEATMAP_TH}>
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
export function GridResultsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { error, results, isLoading, paramLabels } = state;
  return (
    <ResultsShell
      error={error}
      errorPrefix={`${t('Search failed')}：`}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters on the left and click "Start Grid Search" to see results')}
      emptyIcon={Grid3x3}
      onRetry={state.runSearch}
    >
      {results && (
        <div className="flex flex-col gap-3">
          <ResultsSummary results={results} paramLabels={paramLabels} />
          {results.heatmap.matrix.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-3 text-h3 text-fg">
                {t('Parameter Heatmap ({{p1Label}} × {{p2Label}})', {
                  p1Label: results.heatmap.param1Label,
                  p2Label: results.heatmap.param2Label,
                })}
              </h3>
              <HeatmapView heatmap={results.heatmap} />
            </Card>
          )}
          <TopCombinationsTable results={results} paramLabels={paramLabels} />
          <BestGrowthChart results={results} paramLabels={paramLabels} />
        </div>
      )}
    </ResultsShell>
  );
}
