import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/uiComponents';
import type { MonteCarloResult } from '@backtest/shared';
import { buildFanChartData, fanAreas, fanMedianLine, type FanDataPoint } from './monteCarloUtils.js';
import { MonteCarloTerminalHistogram } from './MonteCarloTerminalHistogram.js';
import SvgFanChart from './SvgFanChart.js';
function FanChart({ data }: { data: FanDataPoint[] }) {
  const { t } = useTranslation();
  const areas = fanAreas(t);
  const median = fanMedianLine(t);
  return <SvgFanChart data={data} band5_95Name={areas[0]?.name ?? ''} band25_75Name={areas[1]?.name ?? ''} medianName={median.name} />;
}
export function MonteCarloRangeTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const { t } = useTranslation();
  const data = buildFanChartData(r, startingValue);
  if (data.length === 0) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">{t('monteCarlo.results.noData')}</div>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold tabular-nums text-fg-secondary">{t('monteCarlo.fanChart.title')}</h4>
        <FanChart data={data} />
      </Card>
      <MonteCarloTerminalHistogram r={r} startingValue={startingValue} />
    </div>
  );
}
