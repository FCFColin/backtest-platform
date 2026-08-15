import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import { Card } from '@/components/ui/uiComponents';
import type { MonteCarloResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { fmtAmount } from '@/utils/format';
import {
  categoryAxis,
  tooltipOption,
  tooltipRow,
  valueYAxis,
} from '@/components/charts/chartUtils.js';
import EChart from '@/components/charts/EChart.js';
import { SimpleChart } from '@/components/charts/sharedChartContent.js';
import { HistogramChart, NoDataCard } from './HistogramChart.js';
import {
  buildFanChartData,
  buildSuccessData,
  buildTerminalHistogram,
  dollarKFormatter,
  monthFormatter,
  type FanDataPoint,
} from './monteCarloUtils.js';
function FanChart({ data }: { data: FanDataPoint[] }) {
  const { t } = useTranslation();
  const months = data.map((d) => String(d.month));
  const series: Array<{ dataKey: 'band5_95' | 'band25_75'; opacity: number; name: string }> = [
    { dataKey: 'band5_95', opacity: 0.08, name: t('monteCarlo.fanChart.band5_95') },
    { dataKey: 'band25_75', opacity: 0.18, name: t('monteCarlo.fanChart.band25_75') },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态构造堆叠 band 系列
  const seriesArr: any[] = [];
  series.forEach((band) => {
    seriesArr.push(
      {
        type: 'line',
        stack: band.dataKey,
        data: data.map((d) => d[band.dataKey][0]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        itemStyle: { opacity: 0 },
      },
      {
        type: 'line',
        stack: band.dataKey,
        name: band.name,
        data: data.map((d) => d[band.dataKey][1] - d[band.dataKey][0]),
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color: getPortfolioColor(0), opacity: band.opacity },
      },
    );
  });
  seriesArr.push({
    type: 'line',
    name: t('Median'),
    data: data.map((d) => d.p50),
    symbol: 'none',
    lineStyle: { width: 2.5, color: getPortfolioColor(0) },
    itemStyle: { color: getPortfolioColor(0) },
    emphasis: { focus: 'series' },
  });
  const byMonth = new Map(data.map((d) => [d.month, d]));
  const option: EChartsOption = {
    grid: { top: 10, right: 30, left: 60, bottom: 40 },
    xAxis: categoryAxis(months, {
      formatter: (v: string) => monthFormatter(Number(v)),
      interval: (i: number) => data[i].month % 12 === 0,
    }),
    yAxis: valueYAxis({ formatter: dollarKFormatter }),
    tooltip: tooltipOption((p: { axisValue: string; marker: string }) => {
      const d = byMonth.get(Number(p.axisValue));
      if (!d) return '';
      const [lo95, hi95] = d.band5_95;
      const [lo75, hi75] = d.band25_75;
      const color = getPortfolioColor(0);
      return [
        tooltipRow(
          `<span style="background:${color};width:8px;height:8px;display:inline-block;border-radius:2px"></span>`,
          t('Median'),
          dollarKFormatter(d.p50),
        ),
        tooltipRow(
          p.marker,
          t('monteCarlo.fanChart.band25_75'),
          `${dollarKFormatter(lo75)} – ${dollarKFormatter(hi75)}`,
        ),
        tooltipRow(
          p.marker,
          t('monteCarlo.fanChart.band5_95'),
          `${dollarKFormatter(lo95)} – ${dollarKFormatter(hi95)}`,
        ),
      ].join('');
    }),
    series: seriesArr as EChartsOption['series'],
  };
  return <EChart option={option} height={450} ariaLabel={t('Monte Carlo Fan Chart')} />;
}
function MonteCarloTerminalHistogram({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const { data, p5Val, p50Val, p95Val, p5Label, p50Label, p95Label } = buildTerminalHistogram(
    r,
    startingValue,
  );
  if (data.length === 0) return null;
  return (
    <Card className="p-5">
      <h4 className="mb-3 text-sm font-semibold text-fg-secondary tabular-nums">
        {t('Terminal Value Distribution')}
      </h4>
      <HistogramChart
        data={data}
        height={300}
        disableTooltipAnimation
        tooltipFormatter={(value: number) => [String(value), t('Frequency')]}
        referenceLines={[
          {
            label: p5Label,
            color: getPortfolioColor(3),
            value: t('charts.annualReturn.p5', { value: fmtAmount(p5Val) }),
          },
          {
            label: p50Label,
            color: getPortfolioColor(2),
            value: t('charts.annualReturn.median', { value: fmtAmount(p50Val) }),
          },
          {
            label: p95Label,
            color: getPortfolioColor(4),
            value: t('charts.annualReturn.p95', { value: fmtAmount(p95Val) }),
          },
        ]}
      />
    </Card>
  );
}
export function MonteCarloSuccessTab({ r }: { r: MonteCarloResult }) {
  const { t } = useTranslation();
  const data = buildSuccessData(r);
  if (data.length === 0) return <NoDataCard />;
  const successLines: Array<{
    key: 'survival' | 'capitalPreservation' | 'profit';
    color: string;
    nameKey: string;
  }> = [
    { key: 'survival', color: getPortfolioColor(2), nameKey: 'monteCarlo.results.survivalProb' },
    {
      key: 'capitalPreservation',
      color: getPortfolioColor(0),
      nameKey: 'Capital Preservation',
    },
    { key: 'profit', color: getPortfolioColor(1), nameKey: 'monteCarlo.results.profitProb' },
  ];
  return (
    <Card className="p-5">
      <SimpleChart
        type="line"
        data={data}
        height={400}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        xType="category"
        xLabel={t('Years')}
        yTickFormatter={(v) => `${v}%`}
        yDomain={[0, 100]}
        legendPosition="top"
        tooltipFormatter={(v) => `${v}%`}
        ariaLabel={t('Success Probability')}
        series={successLines.map((l) => ({
          name: t(l.nameKey),
          dataKey: l.key,
          color: l.color,
          width: 2,
          smooth: true,
        }))}
      />
    </Card>
  );
}
export function MonteCarloRangeTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const data = buildFanChartData(r, startingValue);
  if (data.length === 0) return <NoDataCard />;
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold tabular-nums text-fg-secondary">
          {t('Monte Carlo Fan Chart')}
        </h4>
        <FanChart data={data} />
      </Card>
      <MonteCarloTerminalHistogram r={r} startingValue={startingValue} />
    </div>
  );
}
