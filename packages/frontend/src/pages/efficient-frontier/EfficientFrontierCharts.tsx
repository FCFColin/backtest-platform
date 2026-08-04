import { useTranslation } from 'react-i18next';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { CHART_COLORS, type EfficientFrontierPoint } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, getCorrelationColor } from '@/lib/chart-theme.js';
import { getCorrelationTextColor } from '@/components/charts/chartUtils.js';
import { MatrixHeatmap } from '@/components/charts/tables.js';
import { sharpeToColor } from './EfficientFrontierUtils.js';
import { LoadInBacktesterButton, type FrontierResultsProps } from './EfficientFrontierResults.js';
const TICK_STYLE = { fill: 'hsl(var(--fg-tertiary))', fontSize: 12 } as const;
const LABEL_FILL = 'hsl(var(--fg-tertiary))';
function FrontierScatterChartInner({
  scatterData,
  sharpeRange,
  maxSharpe,
  frontier,
  onSelectPoint,
}: {
  scatterData: FrontierResultsProps['scatterData'];
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  frontier: EfficientFrontierPoint[];
  onSelectPoint: (p: EfficientFrontierPoint) => void;
}) {
  const { t } = useTranslation();
  return (
    <ScatterChart>
      <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
      <XAxis
        dataKey="expectedVolatility"
        tick={TICK_STYLE}
        label={{
          value: t('Volatility (%)'),
          position: 'insideBottom',
          offset: -5,
          fontSize: 12,
          fill: LABEL_FILL,
        }}
      />
      <YAxis
        dataKey="expectedReturn"
        tick={TICK_STYLE}
        label={{
          value: t('Return (%)'),
          angle: -90,
          position: 'insideLeft',
          fontSize: 12,
          fill: LABEL_FILL,
        }}
      />
      <ZAxis range={[60, 60]} />
      <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={CHART_TOOLTIP_STYLE} />
      <Scatter
        data={scatterData}
        onClick={(data: { idx?: number }) => {
          if (data?.idx != null && frontier[data.idx]) onSelectPoint(frontier[data.idx]);
        }}
      >
        {scatterData.map((entry, index) => (
          <Cell
            key={index}
            fill={sharpeToColor(entry.sharpeRatio, sharpeRange.min, sharpeRange.max)}
          />
        ))}
      </Scatter>
      {maxSharpe && (
        <Scatter
          data={[
            {
              expectedVolatility: maxSharpe.expectedVolatility,
              expectedReturn: maxSharpe.expectedReturn,
            },
          ]}
          fill={CHART_COLORS[0]}
          shape="star"
        />
      )}
    </ScatterChart>
  );
}
export function FrontierScatterChart({
  scatterData,
  sharpeRange,
  maxSharpe,
  frontier,
  onSelectPoint,
  onLoadInBacktester,
}: {
  scatterData: FrontierResultsProps['scatterData'];
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  frontier: EfficientFrontierPoint[];
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  onLoadInBacktester: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-fg">{t('Efficient Frontier')}</h3>
        <LoadInBacktesterButton onClick={onLoadInBacktester} label={t('Load in backtester')} />
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <FrontierScatterChartInner
          scatterData={scatterData}
          sharpeRange={sharpeRange}
          maxSharpe={maxSharpe}
          frontier={frontier}
          onSelectPoint={onSelectPoint}
        />
      </ResponsiveContainer>
    </div>
  );
}
export function FrontierAllocations({
  allocationData,
  allAssetTickers,
}: {
  allocationData: Record<string, number | string>[];
  allAssetTickers: string[];
}) {
  const { t } = useTranslation();
  if (allocationData.length === 0 || allAssetTickers.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Frontier Allocations')}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={allocationData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis
            dataKey="point"
            tick={TICK_STYLE}
            label={{
              value: t('Frontier Point'),
              position: 'insideBottom',
              offset: -5,
              fontSize: 11,
              fill: LABEL_FILL,
            }}
          />
          <YAxis tick={TICK_STYLE} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
          <Tooltip formatter={(v: number) => `${v}%`} contentStyle={CHART_TOOLTIP_STYLE} />
          {allAssetTickers.map((ticker, i) => (
            <Area
              key={ticker}
              type="monotone"
              dataKey={ticker}
              stackId="1"
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.8}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-4">
        {allAssetTickers.map((ticker, i) => (
          <div key={ticker} className="flex items-center gap-1 text-caption">
            <span
              className="inline-block size-3 rounded"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-fg-tertiary">{ticker}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
export function CorrelationMatrixView({
  correlations,
}: {
  correlations: { tickers: string[]; matrix: number[][] } | null;
}) {
  const { t } = useTranslation();
  if (!correlations || correlations.tickers.length < 2) return null;
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">{t('Correlation Matrix')}</h3>
      <MatrixHeatmap
        rowLabels={correlations.tickers}
        columnLabels={correlations.tickers}
        matrix={correlations.matrix}
        getBackgroundColor={getCorrelationColor}
        getTextColor={getCorrelationTextColor}
        formatValue={(v) => v.toFixed(2)}
      />
    </div>
  );
}
