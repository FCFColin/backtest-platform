import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import { Card } from '@/components/ui/uiComponents';
import { TableEmpty } from '@/components/stateDisplay.js';
import {
  AXIS_TEXT,
  BORDER_SOFT,
  axisTooltipFormatter,
  tooltipOption,
} from '@/components/charts/chartUtils.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { useReducedMotion } from '@/hooks/miscHooks.js';
import EChart from '@/components/charts/EChart.js';

export function NoDataCard() {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <TableEmpty message={t('No data')} className="text-caption" />
    </Card>
  );
}

export function HistogramChart({
  data,
  height = 350,
  tooltipFormatter,
  disableTooltipAnimation = false,
  referenceLines,
}: {
  data: { range: string; count: number }[];
  height?: number;
  tooltipFormatter?: (value: number, name: string) => [string, string] | string;
  disableTooltipAnimation?: boolean;
  referenceLines?: { label: string; color: string; value: string }[];
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  if (data.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 需要动态添加 markLine 属性
  const seriesArr: any[] = [
    {
      type: 'bar',
      name: t('Frequency'),
      data: data.map((d) => ({
        value: d.count,
        itemStyle: { color: getPortfolioColor(0), opacity: 0.7, borderRadius: [2, 2, 0, 0] },
      })),
      barMaxWidth: 60,
    },
  ];
  if (referenceLines?.length) {
    seriesArr[0].markLine = {
      silent: true,
      data: referenceLines.map((rl) => ({
        xAxis: rl.label,
        lineStyle: { color: rl.color, type: 'dashed', width: 1.5 },
        label: { formatter: rl.value, position: 'top', color: rl.color, fontSize: 11 },
      })),
    };
  }
  const option: EChartsOption = {
    grid: { top: 20, right: 20, bottom: 20, left: 60 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.range),
      axisLabel: { ...AXIS_TEXT, interval: 3 },
      axisLine: { lineStyle: { color: BORDER_SOFT } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: AXIS_TEXT,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: BORDER_SOFT, opacity: 0.6 } },
    },
    tooltip: tooltipOption(axisTooltipFormatter(undefined, tooltipFormatter)),
    series: seriesArr as EChartsOption['series'],
    animation: !disableTooltipAnimation && !reducedMotion,
  };
  return <EChart option={option} height={height} ariaLabel={t('Frequency Distribution')} />;
}
