/**
 * @file 有效前沿结果图表子组件
 * @description 承载散点图、配置堆叠面积图、相关性矩阵热力表。
 *   外层 Card 由 ToolPageLayout 提供，本组件只渲染图表标题、图表本身与图例。
 */
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
import { CHART_COLORS } from '@backtest/shared';
import type { EfficientFrontierPoint } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  getCorrelationColor,
} from '@/lib/chart-theme.js';
import { sharpeToColor } from './efficientFrontierSharedConstants.js';
import { LoadInBacktesterButton, type FrontierResultsProps } from './EfficientFrontierShared.js';

const TICK_STYLE = { fill: 'hsl(var(--fg-tertiary))', fontSize: 12 } as const;
const LABEL_FILL = 'hsl(var(--fg-tertiary))';

/** 散点图内核（不含容器与按钮） */
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
          value: t('efficientFrontier.results.volatilityAxis'),
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
          value: t('efficientFrontier.results.returnAxis'),
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

/** 有效前沿散点图（含标题与"加载到回测器"按钮） */
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
        <h3 className="text-h3 font-semibold text-fg">
          {t('efficientFrontier.results.title')}
        </h3>
        <LoadInBacktesterButton
          onClick={onLoadInBacktester}
          label={t('efficientFrontier.results.loadInBacktester')}
        />
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

/** 前沿各点资产配置堆叠面积图 */
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
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">
        {t('efficientFrontier.results.frontierAllocations')}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={allocationData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis
            dataKey="point"
            tick={TICK_STYLE}
            label={{
              value: t('efficientFrontier.results.frontierPoint'),
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

/** 相关性矩阵热力表 */
export function CorrelationMatrixView({
  correlations,
}: {
  correlations: { tickers: string[]; matrix: number[][] } | null;
}) {
  const { t } = useTranslation();
  if (!correlations || correlations.tickers.length < 2) return null;
  return (
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">
        {t('efficientFrontier.results.correlationMatrix')}
      </h3>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="px-3 py-2 text-caption font-medium text-fg-tertiary" />
              {correlations.tickers.map((tk) => (
                <th
                  key={tk}
                  className="px-3 py-2 text-center text-caption font-medium text-fg-tertiary"
                >
                  {tk}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {correlations.tickers.map((rowTicker, i) => (
              <tr key={rowTicker}>
                <td className="px-3 py-2 text-label font-medium text-fg-secondary">
                  {rowTicker}
                </td>
                {correlations.tickers.map((colTicker, j) => {
                  const val = correlations.matrix[i]?.[j] ?? 0;
                  return (
                    <td
                      key={colTicker}
                      className="cursor-default text-center font-mono text-label tabular-nums"
                      style={{
                        backgroundColor: getCorrelationColor(val),
                        color: Math.abs(val) > 0.6 ? '#fff' : '#000',
                        width: `${Math.max(48, 600 / correlations.tickers.length)}px`,
                        height: `${Math.max(36, 400 / correlations.tickers.length)}px`,
                      }}
                      title={`${rowTicker} vs ${colTicker}: ${val.toFixed(2)}`}
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
