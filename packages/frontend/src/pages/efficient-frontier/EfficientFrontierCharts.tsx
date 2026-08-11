import { useTranslation } from 'react-i18next';
import { Scatter, Cell, Area } from 'recharts';
import { type EfficientFrontierPoint } from '@backtest/shared';
import { getCorrelationColor, getPortfolioColor } from '@/lib/chart-theme.js';
import { getCorrelationTextColor } from '@/components/charts/chartUtils.js';
import { MatrixHeatmap } from '@/components/charts/tables.js';
import { SimpleChart, XYScatterChart } from '@/components/charts/sharedChartContent.js';
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
  return (
    <XYScatterChart
      xKey="expectedVolatility"
      yKey="expectedReturn"
      xName={t('Volatility (%)')}
      yName={t('Return (%)')}
      zRange={[60, 60]}
      height={height}
      tooltipFormatter={(v: number, name: string) =>
        name === 'sharpeRatio' ? v.toFixed(2) : `${v.toFixed(2)}%`
      }
    >
      <Scatter
        data={scatterData}
        onClick={(_data, index: number) => {
          if (frontier[index]) onSelectPoint(frontier[index]);
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
          fill={getPortfolioColor(0)}
          shape="star"
        />
      )}
    </XYScatterChart>
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
      >
        {allAssetTickers.map((ticker, i) => (
          <Area
            key={ticker}
            type="monotone"
            dataKey={ticker}
            stackId="1"
            stroke={getPortfolioColor(i)}
            fill={getPortfolioColor(i)}
            fillOpacity={0.8}
          />
        ))}
      </SimpleChart>
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
