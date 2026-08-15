import { useTranslation } from 'react-i18next';
import { type EfficientFrontierPoint } from '@backtest/shared';
import { getCorrelationColor, getPortfolioColor } from '@/lib/chart-theme.js';
import { getCorrelationTextColor } from '@/components/charts/chartUtils.js';
import { MatrixHeatmap } from '@/components/charts/tables.js';
import {
  SimpleChart,
  XYScatterChart,
  type XYScatterSeriesSpec,
} from '@/components/charts/sharedChartContent.js';
import { sharpeToColor } from './EfficientFrontierUtils.js';
import { LoadInBacktesterButton, type FrontierResultsProps } from './EfficientFrontierResults.js';
function FrontierScatterChartInner({
  scatterData,
  sharpeRange,
  maxSharpe,
  frontier,
  onSelectPoint,
  height,
}: {
  scatterData: FrontierResultsProps['scatterData'];
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  frontier: EfficientFrontierPoint[];
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  height: number;
}) {
  const { t } = useTranslation();
  const scatterSeries: XYScatterSeriesSpec[] = scatterData.map((entry) => ({
    data: [entry],
    color: sharpeToColor(entry.sharpeRatio, sharpeRange.min, sharpeRange.max),
    symbolSize: 6,
  }));
  if (maxSharpe) {
    scatterSeries.push({
      data: [
        {
          expectedVolatility: Number((maxSharpe.expectedVolatility * 100).toFixed(2)),
          expectedReturn: Number((maxSharpe.expectedReturn * 100).toFixed(2)),
          sharpeRatio: maxSharpe.sharpeRatio,
        },
      ],
      color: getPortfolioColor(0),
      symbol: 'star',
      symbolSize: 12,
    });
  }
  return (
    <XYScatterChart
      xKey="expectedVolatility"
      yKey="expectedReturn"
      xName={t('Volatility (%)')}
      yName={t('Return (%)')}
      zRange={[60, 60]}
      height={height}
      tooltipFormatter={(v: number) => `${v.toFixed(2)}%`}
      series={scatterSeries}
      onClick={({ seriesIndex }) => {
        // 每点独立 series（data 恒单元素），dataIndex 恒 0，须按 seriesIndex 定位 frontier；末位为 maxSharpe 星标
        const p = seriesIndex !== undefined ? (frontier[seriesIndex] ?? maxSharpe) : undefined;
        if (p) onSelectPoint(p);
      }}
    />
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
        <h3 className="text-h3 font-semibold text-fg">{t('nav.efficientFrontier')}</h3>
        <LoadInBacktesterButton onClick={onLoadInBacktester} label={t('Load in backtester')} />
      </div>
      <FrontierScatterChartInner
        scatterData={scatterData}
        sharpeRange={sharpeRange}
        maxSharpe={maxSharpe}
        frontier={frontier}
        onSelectPoint={onSelectPoint}
        height={400}
      />
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
      <SimpleChart
        type="area"
        data={allocationData}
        xDataKey="point"
        height={300}
        xLabel={t('Frontier Point')}
        yTickFormatter={(v: number) => `${v}%`}
        yDomain={[0, 100]}
        tooltipFormatter={(v: number) => `${v}%`}
        showLegend={false}
        series={allAssetTickers.map((ticker, i) => ({
          dataKey: ticker,
          color: getPortfolioColor(i),
          stackId: '1',
          areaOpacity: 0.8,
        }))}
      />
      <div className="mt-2 flex flex-wrap justify-center gap-4">
        {allAssetTickers.map((ticker, i) => (
          <div key={ticker} className="flex items-center gap-1 text-caption">
            <span
              className="inline-block size-3 rounded"
              style={{ backgroundColor: getPortfolioColor(i) }}
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
