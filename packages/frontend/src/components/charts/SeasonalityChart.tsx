/**
 * @file 季节性收益柱状图
 * @description 展示投资组合按月份统计的平均收益季节性分布
 */
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import { BarChartContent } from './sharedChartContent.js';
import ChartCard from '../ChartCard.js';

/** 季节性收益柱状图 Props */
interface SeasonalityChartProps {
  portfolios: PortfolioResult[];
}

export default function SeasonalityChart({ portfolios }: SeasonalityChartProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) {
    return (
      <ChartCard title={t('charts.seasonality.title')}>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          {t('charts.seasonality.noData')}
        </div>
      </ChartCard>
    );
  }

  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    t('charts.seasonality.monthLabel', { n: i + 1 }),
  );
  const data = computeSeasonalityData(portfolios, monthLabels);

  return (
    <ChartCard title={t('charts.seasonality.title')} data={data} csvFilename="seasonality">
      <BarChartContent
        data={data}
        seriesNames={portfolios.map((p) => p.name)}
        xDataKey="month"
        height={400}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(2)}%`, '']}
        yLabel={t('charts.seasonality.avgReturnAxis')}
        barRadius={2}
        signColorSingleSeries
      />
    </ChartCard>
  );
}

function computeSeasonalityData(portfolios: PortfolioResult[], monthLabels: string[]) {
  const monthData: Record<number, Record<string, { sum: number; count: number }>> = {};
  for (let m = 1; m <= 12; m++) {
    monthData[m] = {};
  }

  for (const p of portfolios) {
    for (const point of p.monthlyReturns || []) {
      if (!monthData[point.month][p.name]) {
        monthData[point.month][p.name] = { sum: 0, count: 0 };
      }
      monthData[point.month][p.name].sum += point.return;
      monthData[point.month][p.name].count += 1;
    }
  }

  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const row: Record<string, number | string> = { month: monthLabels[i] };
    for (const p of portfolios) {
      const d = monthData[m][p.name];
      if (d && d.count > 0) {
        row[p.name] = +((d.sum / d.count) * 100).toFixed(2);
      }
    }
    return row;
  });
}
