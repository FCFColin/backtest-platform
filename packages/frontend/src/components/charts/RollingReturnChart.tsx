/**
 * @file 滚动收益折线图
 * @description 展示投资组合在滚动窗口下的收益、波动率等指标随时间变化趋势
 */
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions.js';
import { mergePortfolioSeries } from '../../utils/chartDataMerge.js';

/** 滚动收益折线图 Props */
interface RollingReturnChartProps {
  portfolios: PortfolioResult[];
}

export default function RollingReturnChart({ portfolios }: RollingReturnChartProps) {
  const { t } = useTranslation();
  const mergedData = mergePortfolioSeries(
    portfolios,
    (p) => p.rollingReturns,
    (pt) => pt.date,
    (pt) => +(pt.return * 100).toFixed(2),
  );
  // 大数据集（>10000 点）降采样以保持渲染流畅，CSV 导出仍使用完整 mergedData
  const chartData =
    mergedData.length > DOWNSAMPLE_THRESHOLD
      ? downsample(mergedData, DOWNSAMPLE_TARGET)
      : mergedData;

  return (
    <ChartCard
      title={t('charts.rollingReturn.title')}
      data={mergedData}
      csvFilename="rolling-return"
    >
      <TimeSeriesLineChart
        data={chartData}
        series={portfolios.map((p) => p.name)}
        height={300}
        defaultStrokeWidth={1.5}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(2)}%`, '']}
        tooltipLabelFormatter={(label) => t('charts.rollingReturn.dateLabel', { label })}
        showBrush
      />
    </ChartCard>
  );
}
