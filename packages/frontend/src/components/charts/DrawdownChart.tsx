/**
 * @file 回撤面积图
 * @description 展示各投资组合的历史回撤曲线，以面积图形式直观呈现下行风险
 */
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

  const chart = (
    <AreaChartContent
      data={chartData}
      seriesNames={portfolios.map((p) => p.name)}
      yTickFormatter={(v: number) => `${v.toFixed(0)}%`}
      yDomain={['auto', 0]}
      tooltipValueFormatter={(value: number) => [`${value.toFixed(2)}%`, '']}
      tooltipLabelFormatter={(label: string) => `${t('common.date')}: ${label}`}
      showBrush={chartData.length > 100}
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
