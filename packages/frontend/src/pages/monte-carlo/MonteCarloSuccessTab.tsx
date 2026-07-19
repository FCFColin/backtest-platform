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
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS } from '@/components/charts/chartConstants.js';
import { buildSuccessData } from './monteCarloTransforms.js';
import { EMPTY_DATA_STYLE } from './monteCarloSharedConstants.js';

/** 成功概率 Tab：生存/保本/盈利三条概率曲线 */
export function MonteCarloSuccessTab({ r }: { r: MonteCarloResult }) {
  const { t } = useTranslation();
  const data = buildSuccessData(r);
  if (data.length === 0)
    return <div style={EMPTY_DATA_STYLE}>{t('monteCarlo.results.noData')}</div>;
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          label={{
            value: t('monteCarlo.results.years'),
            position: 'insideBottom',
            offset: -5,
            fontSize: 12,
            fill: 'var(--text-muted)',
          }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          tickFormatter={(v: number) => `${v}%`}
          domain={[0, 100]}
        />
        <Tooltip formatter={(v: number) => `${v}%`} contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
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
  );
}
