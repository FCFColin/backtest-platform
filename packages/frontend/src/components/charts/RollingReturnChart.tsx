/**
 * @file 滚动收益折线图
 * @description 展示投资组合在滚动窗口下的收益、波动率等指标随时间变化趋势
 */
import type { PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';
import { TimeSeriesLineChartContent } from './sharedChartContent.js';
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
    <ChartCard title="滚动收益" data={mergedData} csvFilename="rolling-return">
      <TimeSeriesLineChartContent
        data={chartData}
        seriesNames={portfolios.map((p) => p.name)}
        height={300}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(2)}%`, '']}
        tooltipLabelFormatter={(label) => `日期: ${label}`}
        showBrush
      />
    </ChartCard>
  );
}
