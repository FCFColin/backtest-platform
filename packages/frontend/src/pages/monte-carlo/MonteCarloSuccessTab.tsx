/**
 * @file 蒙特卡洛结果 - 成功概率 Tab
 * @description 展示逐年生存/保本/盈利概率曲线
 */
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS } from '@/lib/chart-theme.js';
import { buildSuccessData } from './monteCarloTransforms.js';

const TICK_STYLE = { fill: 'hsl(var(--fg-tertiary))', fontSize: 12 } as const;

/** 成功概率 Tab：生存/保本/盈利三条概率曲线 */
export function MonteCarloSuccessTab({ r }: { r: MonteCarloResult }) {
  const { t } = useTranslation();
  const data = buildSuccessData(r);
  if (data.length === 0) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">
          {t('monteCarlo.results.noData')}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis
            dataKey="year"
            tick={TICK_STYLE}
            label={{
              value: t('monteCarlo.results.years'),
              position: 'insideBottom',
              offset: -5,
              fontSize: 12,
              fill: 'hsl(var(--fg-tertiary))',
            }}
          />
          <YAxis
            tick={TICK_STYLE}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, 100]}
          />
          <Tooltip formatter={(v: number) => `${v}%`} contentStyle={CHART_TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'hsl(var(--fg-tertiary))' }} />
          <Line
            type="monotone"
            dataKey="survival"
            stroke={CHART_COLORS[2]}
            strokeWidth={2}
            dot={false}
            name={t('monteCarlo.results.survivalProb')}
          />
          <Line
            type="monotone"
            dataKey="capitalPreservation"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
            name={t('monteCarlo.results.preservationProb')}
          />
          <Line
            type="monotone"
            dataKey="profit"
            stroke={CHART_COLORS[1]}
            strokeWidth={2}
            dot={false}
            name={t('monteCarlo.results.profitProb')}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
