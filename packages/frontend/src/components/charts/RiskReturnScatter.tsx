/**
 * @file 风险收益散点图
 * @description 以波动率为横轴、年化收益为纵轴绘制散点图，直观对比各组合的风险收益比
 */
import {
  ScatterChart,
  Scatter,
  CartesianGrid,
  ResponsiveContainer,
  ZAxis,
  LabelList,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_MARGIN, CHART_GRID_PROPS } from './chartConstants.js';
import { ChartXAxis, ChartYAxis, ChartTooltip } from './ChartAxis.js';
import ChartCard from '../ChartCard.js';

/** 风险收益散点图 Props */
interface RiskReturnScatterProps {
  portfolios: PortfolioResult[];
}

interface ScatterPoint {
  name: string;
  stdev: number;
  cagr: number;
  sharpe: number;
}

/** 空数据占位 */
function EmptyScatter() {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('charts.riskReturn.title')}>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: '13px',
          padding: '40px 0',
          textAlign: 'center',
        }}
      >
        {t('charts.riskReturn.noData')}
      </div>
    </ChartCard>
  );
}

export default function RiskReturnScatter({ portfolios }: RiskReturnScatterProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) return <EmptyScatter />;

  const data: ScatterPoint[] = portfolios.map((p) => ({
    name: p.name,
    stdev: +(p.statistics.stdev * 100).toFixed(2),
    cagr: +(p.statistics.cagr * 100).toFixed(2),
    sharpe: +p.statistics.sharpe.toFixed(2),
  }));

  return (
    <ChartCard
      title={t('charts.riskReturn.title')}
      data={data.map((p): Record<string, string | number> => ({
        name: p.name,
        stdev: p.stdev,
        cagr: p.cagr,
        sharpe: p.sharpe,
      }))}
      csvFilename="risk-return"
    >
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <ChartXAxis
            type="number"
            dataKey="stdev"
            name={t('charts.riskReturn.volatility')}
            label={{
              value: t('charts.riskReturn.volatilityAxis'),
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
            tickFormatter={(v: number | string) => `${Number(v).toFixed(1)}%`}
          />
          <ChartYAxis
            type="number"
            dataKey="cagr"
            name={t('charts.riskReturn.returnRate')}
            label={{
              value: t('charts.riskReturn.returnAxis'),
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <ZAxis range={[80, 80]} />
          <ChartTooltip
            formatter={(value: number, name: string) => {
              if (name === 'stdev')
                return [`${value.toFixed(2)}%`, t('charts.riskReturn.volatility')];
              if (name === 'cagr')
                return [`${value.toFixed(2)}%`, t('charts.riskReturn.returnRate')];
              return [String(value), name];
            }}
            labelFormatter={() => ''}
          />
          {data.map((point, idx) => (
            <Scatter key={point.name} data={[point]} fill={CHART_COLORS[idx % CHART_COLORS.length]}>
              <LabelList
                dataKey="name"
                position="right"
                style={{ fill: 'var(--text-muted)', fontSize: 11 }}
              />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
