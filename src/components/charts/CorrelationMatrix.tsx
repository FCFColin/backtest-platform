/**
 * @file 相关性矩阵热力图
 * @description 展示投资组合内各资产间的收益相关系数矩阵，以颜色深浅表示相关性强弱
 */
import { useMemo, useState } from 'react';
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
  Brush,
} from 'recharts';
import { CHART_COLORS } from '../../../shared/types';
import type { PortfolioResult } from '../../../shared/types';
import { ChartExporter } from '../ChartExporter';
import { downsample } from '../../hooks/useChartInteractions';

/** 相关性矩阵 Props */
interface CorrelationMatrixProps {
  tickers: string[];
  /** 标的间相关系数方阵，与 tickers 顺序对应 */
  correlations: number[][];
  title?: string;
}

/** 相关性及 Beta 分析 Props */
interface CorrelationWithBetaProps {
  portfolios: PortfolioResult[];
  /** 资产级别标的列表 */
  assetTickers?: string[];
  /** 资产间相关系数方阵 */
  assetCorrelations?: number[][];
  /** 组合间相关系数方阵 */
  portfolioCorrelations?: number[][];
}

function getCorrelationColor(val: number): string {
  if (val >= 0) {
    if (val >= 0.8) return '#1a4a7a';
    if (val >= 0.6) return '#2b63b8';
    if (val >= 0.4) return '#6a9fd8';
    if (val >= 0.2) return '#b8d4f0';
    return 'var(--bg-subtle)';
  } else {
    if (val <= -0.8) return '#8b2020';
    if (val <= -0.6) return '#b04040';
    if (val <= -0.4) return '#d47070';
    if (val <= -0.2) return '#f0c8c8';
    return 'var(--bg-subtle)';
  }
}

export function CorrelationMatrix({ tickers, correlations, title }: CorrelationMatrixProps) {
  if (tickers.length === 0 || correlations.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>暂无相关性数据</div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-title">{title || '相关性'}</div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="px-3 py-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }} />
              {tickers.map((t) => (
                <th key={t} className="px-3 py-2 text-[11px] font-medium text-center" style={{ color: 'var(--text-muted)' }}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((rowTicker, i) => (
              <tr key={rowTicker}>
                <td className="px-3 py-2 text-[12px] font-medium" style={{ color: 'var(--text-body)' }}>{rowTicker}</td>
                {tickers.map((colTicker, j) => {
                  const val = correlations[i]?.[j] ?? 0;
                  return (
                    <td
                      key={colTicker}
                      className="text-[12px] text-center cursor-default"
                      style={{
                        backgroundColor: getCorrelationColor(val),
                        color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
                        width: `${Math.max(48, 600 / tickers.length)}px`,
                        height: `${Math.max(36, 400 / tickers.length)}px`,
                      }}
                      title={`${rowTicker} vs ${colTicker}: ${val.toFixed(2)}`}
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

function computeDailyReturns(curve: Array<{ date: string; value: number }>): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].value > 0) {
      returns.push((curve[i].value - curve[i - 1].value) / curve[i - 1].value);
    }
  }
  return returns;
}

function computeBeta(baseReturns: number[], targetReturns: number[]): number {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < 2) return 0;
  const xMean = baseReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const yMean = targetReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let ssXY = 0;
  let ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (baseReturns[i] - xMean) * (targetReturns[i] - yMean);
    ssXX += (baseReturns[i] - xMean) ** 2;
  }
  return ssXX > 0 ? ssXY / ssXX : 0;
}

function computeRollingCorrelation(
  baseReturns: number[],
  targetReturns: number[],
  dates: string[],
  windowSize: number
): Array<{ date: string; correlation: number }> {
  const n = Math.min(baseReturns.length, targetReturns.length);
  if (n < windowSize) return [];

  const result: Array<{ date: string; correlation: number }> = [];
  const step = Math.max(1, Math.floor((n - windowSize) / 200));

  for (let start = 0; start + windowSize <= n; start += step) {
    const xSlice = baseReturns.slice(start, start + windowSize);
    const ySlice = targetReturns.slice(start, start + windowSize);
    const xMean = xSlice.reduce((s, v) => s + v, 0) / windowSize;
    const yMean = ySlice.reduce((s, v) => s + v, 0) / windowSize;
    let ssXY = 0;
    let ssXX = 0;
    let ssYY = 0;
    for (let i = 0; i < windowSize; i++) {
      const dx = xSlice[i] - xMean;
      const dy = ySlice[i] - yMean;
      ssXY += dx * dy;
      ssXX += dx * dx;
      ssYY += dy * dy;
    }
    const corr = ssXX > 0 && ssYY > 0 ? ssXY / Math.sqrt(ssXX * ssYY) : 0;
    result.push({
      date: dates[start + windowSize - 1] || '',
      correlation: +corr.toFixed(4),
    });
  }
  return result;
}

export default function CorrelationWithBeta({ portfolios, assetTickers, assetCorrelations, portfolioCorrelations }: CorrelationWithBetaProps) {
  const [selectedPair, setSelectedPair] = useState<[number, number] | null>(null);
  const [rollingWindow, setRollingWindow] = useState(60);

  const betaData = useMemo(() => {
    if (portfolios.length < 2) return [];
    const baseReturns = computeDailyReturns(portfolios[0].growthCurve);
    return portfolios.slice(1).map((p) => {
      const targetReturns = computeDailyReturns(p.growthCurve);
      return {
        name: p.name,
        beta: computeBeta(baseReturns, targetReturns),
      };
    });
  }, [portfolios]);

  const rollingCorrelationData = useMemo(() => {
    if (!selectedPair || portfolios.length < 2) return [];
    const i = selectedPair[0];
    const j = selectedPair[1];
    if (i === j) return [];
    const a = portfolios[i];
    const b = portfolios[j];
    const aReturns = computeDailyReturns(a.growthCurve);
    const bReturns = computeDailyReturns(b.growthCurve);
    const dates = a.growthCurve.slice(1).map(p => p.date);
    return computeRollingCorrelation(aReturns, bReturns, dates, rollingWindow);
  }, [portfolios, selectedPair, rollingWindow]);

  // 大数据集（>10000 点）降采样以保持渲染流畅，CSV 导出仍使用完整 rollingCorrelationData
  const rollingChartData = rollingCorrelationData.length > 10000
    ? downsample(rollingCorrelationData, 1000)
    : rollingCorrelationData;

  const hasAssetCorrelation = assetTickers && assetTickers.length >= 2 && assetCorrelations && assetCorrelations.length >= 2;
  const hasPortfolioCorrelation = portfolios.length >= 2;

  if (!hasAssetCorrelation && !hasPortfolioCorrelation) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>至少需要2个资产或2个组合才能显示相关性</div>
      </div>
    );
  }

  return (
    <div>
      {hasAssetCorrelation && (
        <CorrelationMatrix tickers={assetTickers!} correlations={assetCorrelations!} title="资产间相关性" />
      )}

      {hasPortfolioCorrelation && (
        <CorrelationMatrix tickers={portfolios.map(p => p.name)} correlations={portfolioCorrelations ?? []} title="组合间相关性" />
      )}

      {betaData.length > 0 && (
        <div className="chart-card">
          <div className="chart-card-title">Beta 值（相对 {portfolios[0].name}）</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ maxWidth: '400px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                  <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    组合
                  </th>
                  <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    Beta
                  </th>
                </tr>
              </thead>
              <tbody>
                {betaData.map((row, idx) => (
                  <tr key={row.name} style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                    <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                        style={{ backgroundColor: CHART_COLORS[(idx + 1) % CHART_COLORS.length] }}
                      />
                      {row.name}
                    </td>
                    <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                      {row.beta.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {portfolios.length >= 2 && (
        <div className="chart-card">
          <div className="flex items-center justify-between mb-3">
            <div className="chart-card-title mb-0">滚动相关性</div>
            <ChartExporter data={rollingCorrelationData} filename="rolling-correlation" />
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>组合A:</span>
              <select
                value={selectedPair ? selectedPair[0] : 0}
                onChange={(e) => {
                  const i = parseInt(e.target.value);
                  setSelectedPair(prev => prev ? [i, prev[1]] : [i, i === 0 ? 1 : 0]);
                }}
                style={{
                  height: 28,
                  padding: '2px 8px',
                  fontSize: 12,
                  border: '1px solid var(--border-soft)',
                  borderRadius: 4,
                  color: 'var(--text-body)',
                  background: 'var(--bg-elevated)',
                }}
              >
                {portfolios.map((p, idx) => (
                  <option key={p.name} value={idx}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>组合B:</span>
              <select
                value={selectedPair ? selectedPair[1] : 1}
                onChange={(e) => {
                  const j = parseInt(e.target.value);
                  setSelectedPair(prev => prev ? [prev[0], j] : [0, j]);
                }}
                style={{
                  height: 28,
                  padding: '2px 8px',
                  fontSize: 12,
                  border: '1px solid var(--border-soft)',
                  borderRadius: 4,
                  color: 'var(--text-body)',
                  background: 'var(--bg-elevated)',
                }}
              >
                {portfolios.map((p, idx) => (
                  <option key={p.name} value={idx}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>窗口(天):</span>
              <select
                value={rollingWindow}
                onChange={(e) => setRollingWindow(parseInt(e.target.value))}
                style={{
                  height: 28,
                  padding: '2px 8px',
                  fontSize: 12,
                  border: '1px solid var(--border-soft)',
                  borderRadius: 4,
                  color: 'var(--text-body)',
                  background: 'var(--bg-elevated)',
                }}
              >
                <option value={20}>20</option>
                <option value={60}>60</option>
                <option value={120}>120</option>
                <option value={252}>252</option>
              </select>
            </div>
          </div>

          {!selectedPair && (
            <div className="text-[12px]" style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
              请选择两个组合查看滚动相关性
            </div>
          )}

          {selectedPair && rollingCorrelationData.length === 0 && (
            <div className="text-[12px]" style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
              数据不足以计算滚动相关性（需要至少 {rollingWindow} 个交易日）
            </div>
          )}

          {selectedPair && rollingCorrelationData.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rollingChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(0, 7)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[-1, 1]}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-control)',
                    color: 'var(--text-body)',
                    fontSize: '12px',
                    boxShadow: 'var(--shadow-md)',
                  }}
                  formatter={(value: number) => [value.toFixed(4), '相关性']}
                  labelFormatter={(label: string) => `日期: ${label}`}
                />
                <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                <ReferenceLine y={1} stroke="var(--border-soft)" strokeDasharray="1 3" />
                <ReferenceLine y={-1} stroke="var(--border-soft)" strokeDasharray="1 3" />
                <Line
                  type="monotone"
                  dataKey="correlation"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  name={`${portfolios[selectedPair[0]].name} vs ${portfolios[selectedPair[1]].name}`}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {rollingChartData.length > 100 && (
                  <Brush
                    dataKey="date"
                    height={20}
                    stroke="var(--brand)"
                    travellerWidth={8}
                    tickFormatter={(v: string) => v.slice(0, 7)}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
