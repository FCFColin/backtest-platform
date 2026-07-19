/**
 * @file PCA 结果面板
 * @description 特征值柱状图 + 累计方差解释率 + 载荷矩阵热力图 + 主成分得分散点图；
 *              从 PCAPage 拆分以便独立维护。
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ZAxis,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { PCAResult } from '@backtest/shared';
import ChartCard from '../../components/ChartCard.js';
import {
  CHART_TOOLTIP_STYLE,
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
} from '@/components/charts/chartConstants.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { MatrixHeatmap } from '@/components/charts/MatrixHeatmap.js';
import { AnalysisErrorAlert, EmptyResultsHint } from '@/components/resultsShell.js';
import { pickByThreshold, type ThresholdBand } from '@/utils/colorScale';

/**
 * 载荷矩阵热力图配色阈值表（发散色阶，0 为中性）
 * 取值范围约 [-1, 1]，正值偏绿、负值偏红
 * 非负阈值用闭区间（>=），负阈值用开区间（>），保持与原 if-else 完全一致
 */
const LOADING_COLOR_BANDS: ReadonlyArray<ThresholdBand> = [
  { threshold: 0.8, value: '#1a7a3a' },
  { threshold: 0.6, value: '#2e8b57' },
  { threshold: 0.4, value: '#6abf7e' },
  { threshold: 0.2, value: '#b8e0c4' },
  { threshold: -0.2, value: 'var(--bg-subtle)' },
  { threshold: -0.4, value: '#f0c8c8' },
  { threshold: -0.6, value: '#d47070' },
  { threshold: -0.8, value: '#b04040' },
];
const DEFAULT_LOADING_COLOR = '#8b2020';

function getLoadingColor(loading: number): string {
  return pickByThreshold(loading, LOADING_COLOR_BANDS, DEFAULT_LOADING_COLOR);
}

/** PCA 结果面板 Props */
export interface PCAResultsProps {
  results: PCAResult | null;
  error: string | null;
  isLoading: boolean;
}

/** 特征值柱状图 */
function EigenvalueBarChart({ data }: { data: { component: string; eigenvalue: number }[] }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('pca.results.eigenvalue')}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis dataKey="component" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [value.toFixed(4), t('pca.results.eigenvalue')]}
          />
          <Bar dataKey="eigenvalue" fill={CHART_COLORS[0]} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 累计方差解释率 */
function CumulativeVarianceChart({ data }: { data: { component: string; cumulative: number }[] }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('pca.results.cumulativeVariance')}>
      <TimeSeriesLineChart
        data={data}
        xDataKey="component"
        height={300}
        yDomain={[0, 100]}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [
          `${v.toFixed(2)}%`,
          t('pca.results.cumulativeVarianceLabel'),
        ]}
        referenceY={90}
        showLegend={false}
        colorOffset={1}
        series={[{ dataKey: 'cumulative', showDots: true, dotR: 4, activeDotR: 6 }]}
      />
    </ChartCard>
  );
}

/** 载荷矩阵热力图 */
function LoadingMatrix({ results }: { results: PCAResult }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('pca.results.loadingMatrix')}>
      <MatrixHeatmap
        rowLabels={results.tickers}
        columnLabels={results.eigenvalues.map((_, j) => `PC${j + 1}`)}
        matrix={results.loadings}
        getBackgroundColor={getLoadingColor}
        getTextColor={(loading) => (Math.abs(loading) > 0.6 ? '#fff' : '#000')}
        formatValue={(v) => v.toFixed(2)}
        formatTitle={(v, rowLabel, colLabel) => `${rowLabel} · ${colLabel}: ${v.toFixed(3)}`}
        minCellWidth={56}
      />
    </ChartCard>
  );
}

/** 主成分得分散点图 */
function PCAScatterChart({ data }: { data: { pc1: number; pc2: number }[] }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('pca.results.scatterTitle')}>
      <ResponsiveContainer width="100%" height={450}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis
            type="number"
            dataKey="pc1"
            name="PC1"
            tick={AXIS_TICK_STYLE}
            label={{
              value: 'PC1',
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <YAxis
            type="number"
            dataKey="pc2"
            name="PC2"
            tick={AXIS_TICK_STYLE}
            label={{
              value: 'PC2',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <ZAxis range={[20, 20]} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number, name: string) => [value.toFixed(4), name]}
            labelFormatter={() => ''}
          />
          <Scatter data={data} fill={CHART_COLORS[2]} fillOpacity={0.5} />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <ReferenceLine x={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** PCA 结果面板 */
export function PCAResultsPanel({ results, error, isLoading }: PCAResultsProps) {
  const { t } = useTranslation();
  const eigenvalueData = useMemo(() => {
    if (!results) return [];
    return results.eigenvalues.map((val, idx) => ({
      component: `PC${idx + 1}`,
      eigenvalue: +val.toFixed(4),
    }));
  }, [results]);

  const cumulativeData = useMemo(() => {
    if (!results) return [];
    return results.cumulativeVariance.map((val, idx) => ({
      component: `PC${idx + 1}`,
      cumulative: +(val * 100).toFixed(2),
    }));
  }, [results]);

  const scatterData = useMemo(() => {
    if (!results || results.scores.length === 0) return [];
    return results.scores.map((row) => ({
      pc1: +row[0].toFixed(4),
      pc2: row[1] !== undefined ? +row[1].toFixed(4) : 0,
    }));
  }, [results]);

  return (
    <div className="space-y-4">
      <AnalysisErrorAlert error={error} prefix={t('pca.analysisFailedPrefix')} />

      {results && (
        <div className="space-y-4">
          <EigenvalueBarChart data={eigenvalueData} />
          <CumulativeVarianceChart data={cumulativeData} />
          <LoadingMatrix results={results} />
          {results.scores.length > 0 && results.scores[0].length >= 2 && (
            <PCAScatterChart data={scatterData} />
          )}
        </div>
      )}

      {!results && !error && !isLoading && <EmptyResultsHint text={t('pca.emptyHint')} />}
    </div>
  );
}
