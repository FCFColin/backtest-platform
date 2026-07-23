/**
 * @file 回撤面积图
 * @description 展示各投资组合的历史回撤曲线，以面积图形式直观呈现下行风险
 */
import { useMemo } from 'react';
import ChartCard from '../ChartCard.js';
import { ChartExporter } from '../ChartExporter.js';
import { downsample, SYNC_CHART_POINTS } from '../../hooks/useChartInteractions.js';
import { useTranslation } from 'react-i18next';
import { mergePortfolioSeries } from '../../utils/chartDataMerge.js';
import { AreaChartContent } from './sharedChartContent.js';

/** 回撤面积图所需的最小组合数据形状（兼容 PortfolioResult 与分析页部分组合） */
interface DrawdownChartPortfolio {
  name: string;
  drawdownCurve: Array<{ date: string; drawdown: number }>;
}

/** 回撤面积图 Props */
interface DrawdownChartProps {
  portfolios: DrawdownChartPortfolio[];
  /** 外层已提供 chart-card 标题时设为 true */
  embedded?: boolean;
}

/** 百分比刻度格式化，确保 0 显示为 "0%" 而非 "-0%" */
function percentTickFormatter(v: number): string {
  const rounded = Math.round(v);
  return `${rounded}%`;
}

function findMinDrawdownValue(
  chartData: Record<string, number | string>[],
  seriesNames: string[],
): number {
  let minVal = 0;
  for (const point of chartData) {
    for (const name of seriesNames) {
      const val = point[name] as number;
      if (typeof val === 'number' && !Number.isNaN(val) && val < minVal) {
        minVal = val;
      }
    }
  }
  return minVal;
}

function findMaxDrawdownPoints(
  chartData: Record<string, number | string>[],
  seriesNames: string[],
): Array<{ x: string; y: number; name: string; value: number }> {
  const points: Array<{ x: string; y: number; name: string; value: number }> = [];
  for (const name of seriesNames) {
    let maxDd = 0;
    let maxDdDate = '';
    for (const point of chartData) {
      const val = point[name] as number;
      if (typeof val === 'number' && !Number.isNaN(val) && val < maxDd) {
        maxDd = val;
        maxDdDate = point.date as string;
      }
    }
    if (maxDdDate) {
      points.push({ x: maxDdDate, y: maxDd, name, value: maxDd });
    }
  }
  return points;
}

export default function DrawdownChart({ portfolios, embedded = false }: DrawdownChartProps) {
  const { t } = useTranslation();
  const mergedData = mergePortfolioSeries(
    portfolios,
    (p) => p.drawdownCurve,
    (pt) => pt.date,
    (pt) => +(pt.drawdown * -100).toFixed(2),
  );
  const chartData =
    mergedData.length > SYNC_CHART_POINTS ? downsample(mergedData, SYNC_CHART_POINTS) : mergedData;

  const seriesNames = useMemo(() => portfolios.map((p) => p.name), [portfolios]);

  const { yDomain, maxDrawdownPoints } = useMemo(() => {
    const minVal = findMinDrawdownValue(chartData, seriesNames);
    const yMin = Math.floor(minVal / 5) * 5 - 2;
    const points = findMaxDrawdownPoints(chartData, seriesNames);
    return { yDomain: [yMin, 0] as [number, number], maxDrawdownPoints: points };
  }, [chartData, seriesNames]);

  const chart = (
    <AreaChartContent
      data={chartData}
      seriesNames={seriesNames}
      height={250}
      yTickFormatter={percentTickFormatter}
      yDomain={yDomain}
      tooltipValueFormatter={(value: number) => [`${value.toFixed(2)}%`, '']}
      tooltipLabelFormatter={(label: string) => `${t('common.date')}: ${label}`}
      showBrush={chartData.length > 100}
      referenceDots={maxDrawdownPoints}
      useGradient={true}
      customMargin={{ top: 15, right: 25, bottom: 25, left: 5 }}
      yAxisWidth={65}
      hideAxisLines={true}
    />
  );

  if (embedded) {
    return (
      <>
        <div className="flex justify-end mb-2">
          <ChartExporter data={mergedData} filename="drawdown" />
        </div>
        {chart}
      </>
    );
  }

  return (
    <ChartCard title={t('backtest.drawdown')} data={mergedData} csvFilename="drawdown">
      {chart}
    </ChartCard>
  );
}
