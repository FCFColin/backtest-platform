import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ZAxis,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared/types';
import type { PCAResult } from '@backtest/shared/types';
import type { PCAResultsProps } from './types.js';
import { getLoadingColor, tooltipStyle } from './utils.js';

function EigenvalueBarChart({ data }: { data: { component: string; eigenvalue: number }[] }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">特征值</div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="component" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [value.toFixed(4), '特征值']}
          />
          <Bar dataKey="eigenvalue" fill={CHART_COLORS[0]} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CumulativeVarianceChart({ data }: { data: { component: string; cumulative: number }[] }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">累计方差解释率</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis dataKey="component" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [`${value.toFixed(2)}%`, '累计方差']}
          />
          <ReferenceLine y={90} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="cumulative"
            stroke={CHART_COLORS[1]}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LoadingMatrix({ results }: { results: PCAResult }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">载荷矩阵</div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="px-3 py-2 text-[11px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              />
              {results.eigenvalues.map((_, j) => (
                <th
                  key={j}
                  className="px-3 py-2 text-[11px] font-medium text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  PC{j + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.tickers.map((ticker, i) => (
              <tr key={ticker}>
                <td
                  className="px-3 py-2 text-[12px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {ticker}
                </td>
                {results.eigenvalues.map((_, j) => {
                  const val = results.loadings[i]?.[j] ?? 0;
                  return (
                    <td
                      key={j}
                      className="text-[12px] text-center cursor-default"
                      style={{
                        backgroundColor: getLoadingColor(val),
                        color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
                        width: `${Math.max(56, 600 / results.eigenvalues.length)}px`,
                        height: `${Math.max(36, 400 / results.tickers.length)}px`,
                      }}
                      title={`${ticker} · PC${j + 1}: ${val.toFixed(3)}`}
                    >
                      {val.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PCAScatterChart({ data }: { data: { pc1: number; pc2: number }[] }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">主成分得分散点图（PC1 vs PC2）</div>
      <ResponsiveContainer width="100%" height={450}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            type="number"
            dataKey="pc1"
            name="PC1"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{
              value: 'PC1',
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <YAxis
            type="number"
            dataKey="pc2"
            name="PC2"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{
              value: 'PC2',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <ZAxis range={[20, 20]} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => [value.toFixed(4), name]}
            labelFormatter={() => ''}
          />
          <Scatter data={data} fill={CHART_COLORS[2]} fillOpacity={0.5} />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
          <ReferenceLine x={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PCAResultsPanel({ results, error, isLoading }: PCAResultsProps) {
  const eigenvalueData = useMemo(() => {
    if (!results) return [];
    return results.eigenvalues.map((val, idx) => ({
      component: `PC${idx + 1}`,
      eigenvalue: +val.toFixed(4),
    }));
  }, [results]);

  const cumulativeData = useMemo(() => {
    if (!results) return [];
    return results.cumulativeVariance.map((val, idx) => ({
      component: `PC${idx + 1}`,
      cumulative: +(val * 100).toFixed(2),
    }));
  }, [results]);

  const scatterData = useMemo(() => {
    if (!results || results.scores.length === 0) return [];
    return results.scores.map((row) => ({
      pc1: +row[0].toFixed(4),
      pc2: row[1] !== undefined ? +row[1].toFixed(4) : 0,
    }));
  }, [results]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <EigenvalueBarChart data={eigenvalueData} />
          <CumulativeVarianceChart data={cumulativeData} />
          <LoadingMatrix results={results} />
          {results.scores.length > 0 && results.scores[0].length >= 2 && (
            <PCAScatterChart data={scatterData} />
          )}
        </div>
      )}

      {!results && !error && !isLoading && (
        <div
          className="card"
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
        >
          设置参数后点击「开始分析」查看结果
        </div>
      )}
    </div>
  );
}
