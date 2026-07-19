/**
 * @file 有效前沿结果图表子组件
 * @description 承载散点图、配置堆叠面积图、相关性矩阵热力表
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
  AXIS_TICK_STYLE,
} from '@/components/charts/chartConstants.js';
import { getCorrelationColor } from '@/components/charts/chartColors.js';
import { SECTION_TITLE_STYLE, sharpeToColor } from './efficientFrontierSharedConstants.js';
import { LoadInBacktesterButton, type FrontierResultsProps } from './EfficientFrontierShared.js';

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
      <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
      <XAxis
        dataKey="expectedVolatility"
        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
        label={{
          value: t('efficientFrontier.results.volatilityAxis'),
          position: 'insideBottom',
          offset: -5,
          fontSize: 12,
          fill: 'var(--text-muted)',
        }}
      />
      <YAxis
        dataKey="expectedReturn"
        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
        label={{
          value: t('efficientFrontier.results.returnAxis'),
          angle: -90,
          position: 'insideLeft',
          fontSize: 12,
          fill: 'var(--text-muted)',
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
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>
          {t('efficientFrontier.results.title')}
        </div>
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
    </>
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
    <>
      <div style={SECTION_TITLE_STYLE}>{t('efficientFrontier.results.frontierAllocations')}</div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={allocationData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="point"
            tick={AXIS_TICK_STYLE}
            label={{
              value: t('efficientFrontier.results.frontierPoint'),
              position: 'insideBottom',
              offset: -5,
              fontSize: 11,
              fill: 'var(--text-muted)',
            }}
          />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
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
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 8,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {allAssetTickers.map((ticker, i) => (
          <div key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span style={{ color: 'var(--text-muted)' }}>{ticker}</span>
          </div>
        ))}
      </div>
    </>
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
    <>
      <div style={SECTION_TITLE_STYLE}>{t('efficientFrontier.results.correlationMatrix')}</div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="px-3 py-2 text-[11px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              />
              {correlations.tickers.map((tk) => (
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
            {correlations.tickers.map((rowTicker, i) => (
              <tr key={rowTicker}>
                <td
                  className="px-3 py-2 text-[12px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {rowTicker}
                </td>
                {correlations.tickers.map((colTicker, j) => {
                  const val = correlations.matrix[i]?.[j] ?? 0;
                  return (
                    <td
                      key={colTicker}
                      className="text-[12px] text-center cursor-default"
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
    </>
  );
}
