import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { AssetAnalysisResult } from '@backtest/shared';
import { tooltipStyle } from './analysisChartUtils.js';

function TelltaleEmptyState({ t }: { t: (k: string) => string }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.telltaleChart')}</div>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: '13px',
          padding: '40px 0',
          textAlign: 'center',
        }}
      >
        {t('analysis.telltaleNeedTwo')}
      </div>
    </div>
  );
}

function TelltaleLineChart({
  data,
  tickers,
  t,
}: {
  data: Array<Record<string, number | string>>;
  tickers: AssetAnalysisResult['tickers'];
  t: (k: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={450}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(0, 7)}
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: number) => v.toFixed(2)}
          label={{
            value: t('analysis.relativeRatio'),
            angle: -90,
            position: 'insideLeft',
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
          formatter={(value: number) => [value.toFixed(3), '']}
        />
        <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
        <ReferenceLine y={1} stroke="var(--text-muted)" strokeDasharray="4 4" />
        {tickers.slice(1).map((tk, idx) => (
          <Line
            key={tk.ticker}
            type="monotone"
            dataKey={tk.ticker}
            stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export const TelltaleChart = memo(function TelltaleChart({
  results,
}: {
  results: AssetAnalysisResult;
}) {
  const { t } = useTranslation();
  const mergedData = useMemo(() => {
    if (results.tickers.length < 2) return [];
    const benchmark = results.tickers[0];
    const benchMap = new Map<string, number>();
    for (const point of benchmark.growthCurve) benchMap.set(point.date, point.value);
    const dateMap = new Map<string, Record<string, number | string>>();
    for (let i = 1; i < results.tickers.length; i++) {
      const tk = results.tickers[i];
      for (const point of tk.growthCurve) {
        const benchVal = benchMap.get(point.date);
        if (benchVal == null || benchVal === 0) continue;
        if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
        dateMap.get(point.date)![tk.ticker] = +(point.value / benchVal).toFixed(6);
      }
    }
    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [results]);

  if (results.tickers.length < 2) return <TelltaleEmptyState t={t} />;

  return (
    <div className="chart-card">
      <div className="chart-card-title">
        {t('analysis.telltaleRelative')} {results.tickers[0].ticker}
      </div>
      <TelltaleLineChart data={mergedData} tickers={results.tickers} t={t} />
    </div>
  );
});
