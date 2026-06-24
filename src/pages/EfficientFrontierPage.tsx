/**
 * @file 有效前沿页面
 * @description 基于 Markowitz 或 NSGA-II 求解器计算投资组合有效前沿，展示风险收益散点及夏普比率着色
 * @route /efficient-frontier
 */
import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Plus, X, ArrowRight } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell, AreaChart, Area } from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '../../shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';

type SolveSpeed = 'ultrafast' | 'fast' | 'medium' | 'slow';
type FrontierSolver = 'markowitz' | 'nsga2';
type ReturnObjective = 'maxCagr' | 'minVolatility';

// 根据夏普比率计算颜色：红(低) -> 黄(中) -> 绿(高)
function sharpeToColor(sharpe: number, minSharpe: number, maxSharpe: number): string {
  if (maxSharpe === minSharpe) return '#2e8b57';
  const t = Math.max(0, Math.min(1, (sharpe - minSharpe) / (maxSharpe - minSharpe)));
  const r = t < 0.5 ? 220 : Math.round(220 - (t - 0.5) * 2 * 220);
  const g = t < 0.5 ? Math.round(t * 2 * 180) : 180;
  const b = t < 0.5 ? 50 : Math.round(50 + (t - 0.5) * 2 * 37);
  return `rgb(${r},${g},${b})`;
}

// 相关性热力图颜色
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

export default function EfficientFrontierPage() {
  const navigate = useNavigate();
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND', 'TLT']);
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [numPoints, setNumPoints] = useState(20);
  const [solveSpeed, setSolveSpeed] = useState<SolveSpeed>('fast');
  const [minInclusionWeight, setMinInclusionWeight] = useState(0);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<EfficientFrontierResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<EfficientFrontierPoint | null>(null);
  const [correlations, setCorrelations] = useState<{ tickers: string[]; matrix: number[][] } | null>(null);
  const [correlationError, setCorrelationError] = useState<string | null>(null);

  // 新增参数
  const [rebalanceFrequency, setRebalanceFrequency] = useState<string>('yearly');
  const [allowCash, setAllowCash] = useState(false);
  const [returnObjective, setReturnObjective] = useState<ReturnObjective>('maxCagr');
  const [solver, setSolver] = useState<FrontierSolver>('markowitz');

  const addTicker = () => setTickers([...tickers, '']);
  const removeTicker = (i: number) => { if (tickers.length > 2) setTickers(tickers.filter((_, idx) => idx !== i)); };
  const updateTicker = (i: number, val: string) => { const n = [...tickers]; n[i] = val; setTickers(n); };

  const runFrontier = () => {
    const validTickers = tickers.filter(Boolean);
    if (validTickers.length < 2) {
      setError('请至少输入两个标的代码');
      return;
    }
    setSelectedPoint(null);
    setCorrelations(null);
    setCorrelationError(null);
    run(async () => {
      const res = await fetch('/api/backtest/efficient-frontier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: validTickers,
          numPoints,
          solveSpeed,
          minInclusionWeight: minInclusionWeight / 100,
          rebalanceFrequency,
          allowCash,
          returnObjective,
          solver,
          parameters: { startDate, endDate, startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '', baseCurrency: 'usd', extendedWithdrawalStats: false, cashflowLegs: [], oneTimeCashflows: [] },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '计算失败');
      setResults(json.data ?? json);

      // 获取相关性矩阵：用回测接口获取
      const btBody = {
        portfolios: [{
          name: 'temp',
          assets: validTickers.map((t) => ({ ticker: t, weight: Math.round(100 / validTickers.length * 100) / 100 })),
          rebalanceFrequency: 'yearly',
          rebalanceOffset: 0,
          drag: 0,
          totalReturn: true,
        }],
        parameters: { startDate, endDate, startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '', baseCurrency: 'usd', extendedWithdrawalStats: false, cashflowLegs: [], oneTimeCashflows: [] },
      };
      const btRes = await fetch('/api/backtest/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(btBody),
      });
      if (btRes.ok) {
        const btJson = await btRes.json();
        const btData = btJson.data ?? btJson;
        if (btData.assetTickers && btData.assetCorrelations) {
          setCorrelations({ tickers: btData.assetTickers, matrix: btData.assetCorrelations });
        }
      } else {
        setCorrelationError('相关性矩阵计算失败');
      }
    });
  };

  const maxSharpe = results?.frontier.length
    ? results.frontier.reduce((best, p) => p.sharpeRatio > best.sharpeRatio ? p : best, results.frontier[0])
    : undefined;

  const sharpeRange = results?.frontier.length
    ? {
        min: Math.min(...results.frontier.map((p) => p.sharpeRatio)),
        max: Math.max(...results.frontier.map((p) => p.sharpeRatio)),
      }
    : { min: 0, max: 1 };

  const scatterData = results
    ? results.frontier.map((p, idx) => ({
        expectedVolatility: p.expectedVolatility,
        expectedReturn: p.expectedReturn,
        sharpeRatio: p.sharpeRatio,
        idx,
      }))
    : [];

  const handleClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
    if (data && results) {
      const point = results.frontier[data.idx];
      if (point) setSelectedPoint(point);
    }
  }, [results]);

  // 堆叠面积图数据：每个前沿点一个数据行，每个资产一列
  const allocationData = results
    ? results.frontier.map((point, idx) => {
        const row: Record<string, number | string> = { point: idx + 1 };
        Object.entries(point.weights).forEach(([ticker, weight]) => {
          row[ticker] = Number((weight * 100).toFixed(1));
        });
        return row;
      })
    : [];

  // 获取所有资产名称（从第一个前沿点）
  const allAssetTickers = results?.frontier.length
    ? Object.keys(results.frontier[0].weights)
    : [];

  const handleLoadInBacktester = (point?: EfficientFrontierPoint) => {
    const p = point || maxSharpe;
    if (!p) return;
    const weightEntries = Object.entries(p.weights);
    const portfolioData = {
      portfolios: [{
        id: `portfolio-${Date.now()}-1`,
        name: '前沿组合',
        assets: weightEntries.map(([ticker, weight]) => ({ ticker, weight: Math.round(weight * 10000) / 100 })),
        rebalanceFrequency: rebalanceFrequency || 'quarterly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      }],
      parameters: {
        startDate,
        endDate,
        startingValue: 10000,
        baseCurrency: 'usd',
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
        extendedWithdrawalStats: false,
        cashflowLegs: [],
        oneTimeCashflows: [],
      },
    };
    localStorage.setItem('bt_load_from_optimizer', JSON.stringify(portfolioData));
    navigate('/');
  };

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">有效前沿</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          有效前沿工具帮助您从单一"最优"组合扩展到完整的历史测试组合图谱。它生成一系列在收益与风险之间权衡的组合。
        </p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">可视化</div>
            <div className="bt-seo-feature-desc">以散点图展示风险-收益权衡，按夏普比率从红到绿渐变着色，标注最大夏普比率组合，点击查看权重详情。</div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">约束条件</div>
            <div className="bt-seo-feature-desc">支持调仓频率、现金分配、收益/风险目标、求解器选择、最小包含权重等约束设置。</div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">相关工具：</span>
          <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>组合回测</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>组合优化</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>资产分析</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>蒙特卡洛模拟</Link>
        </div>
      </div>

      <div className="bt-main-card card">
        <div className="params-section">
          <div className="params-title">参数设置</div>
          <div className="params-row">
            <label className="param-check">
              <input type="checkbox" checked={startDate === '' && endDate === ''} onChange={(e) => {
                if (e.target.checked) {
                  setStartDate('');
                  setEndDate('');
                } else {
                  setStartDate('2010-01-01');
                  setEndDate('2024-12-31');
                }
              }} />
              <span>全部历史</span>
            </label>
            <div className="param-field">
              <span className="param-label">开始日期</span>
              <input type="date" className="param-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="param-field">
              <span className="param-label">结束日期</span>
              <input type="date" className="param-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="param-field">
              <span className="param-label">采样点数</span>
              <input type="number" className="param-input" value={numPoints} onChange={(e) => setNumPoints(Number(e.target.value))} min={5} max={100} />
            </div>
            <div className="param-field">
              <span className="param-label">求解速度</span>
              <select className="param-input" value={solveSpeed} onChange={(e) => setSolveSpeed(e.target.value as SolveSpeed)}>
                <option value="ultrafast">极速</option>
                <option value="fast">快速</option>
                <option value="medium">中等</option>
                <option value="slow">慢速</option>
              </select>
            </div>
            <div className="param-field param-field-rolling">
              <span className="param-label">最小包含权重</span>
              <div className="param-input-suffix-wrap">
                <input type="number" className="param-input param-input-with-suffix" value={minInclusionWeight} onChange={(e) => setMinInclusionWeight(Number(e.target.value))} min={0} max={100} />
                <span className="param-input-suffix">%</span>
              </div>
            </div>
            <div className="param-field">
              <span className="param-label">调仓频率</span>
              <select className="param-input" value={rebalanceFrequency} onChange={(e) => setRebalanceFrequency(e.target.value)}>
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
                <option value="quarterly">每季度</option>
                <option value="yearly">每年</option>
              </select>
            </div>
            <div className="param-field">
              <span className="param-label">收益目标</span>
              <select className="param-input" value={returnObjective} onChange={(e) => setReturnObjective(e.target.value as ReturnObjective)}>
                <option value="maxCagr">最大化 CAGR</option>
                <option value="minVolatility">最小化波动率</option>
              </select>
            </div>
            <div className="param-field">
              <span className="param-label">求解器</span>
              <select className="param-input" value={solver} onChange={(e) => setSolver(e.target.value as FrontierSolver)}>
                <option value="markowitz">Markowitz</option>
                <option value="nsga2">NSGA-II</option>
              </select>
            </div>
            <label className="param-check">
              <input type="checkbox" checked={allowCash} onChange={(e) => setAllowCash(e.target.checked)} />
              <span>允许现金分配</span>
            </label>
          </div>
        </div>

        <div className="bt-action-row">
          <LoadingButton isLoading={isLoading} onClick={runFrontier} loadingText="计算中...">
            <Play className="w-4 h-4" />
            计算有效前沿
          </LoadingButton>
        </div>

        <div className="portfolios-section">
          <div className="portfolios-header">
            <span className="portfolios-title">标的列表</span>
            <button className="portfolios-add-btn" onClick={addTicker}>
              <Plus className="w-4 h-4" />
              添加标的
            </button>
          </div>
          <div className="portfolios-cards">
            <div className="portfolio-card">
              {tickers.map((t, i) => (
                <div key={t || i} className="ticker-row">
                  <input
                    type="text"
                    value={t}
                    onChange={(e) => updateTicker(i, e.target.value)}
                    placeholder="输入代码，如 VTI"
                    className="ticker-input"
                  />
                  {tickers.length > 2 && (
                    <button onClick={() => removeTicker(i)} className="row-remove-btn" title="删除">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bt-results-card card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          计算失败：{error}
        </div>
      )}

      {correlationError && !error && (
        <div className="bt-results-card card" style={{ color: 'var(--warning, #f59e0b)', textAlign: 'center', padding: 16 }}>
          {correlationError}
        </div>
      )}

      {results && results.frontier.length > 0 && (
        <div className="bt-results-card card">
          {/* 有效前沿散点图 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>有效前沿</div>
            <button
              onClick={() => handleLoadInBacktester()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 'var(--radius-control)',
                border: '1px solid var(--brand)', backgroundColor: 'transparent',
                color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--brand)'; }}
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Load in backtester
            </button>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
              <XAxis dataKey="expectedVolatility" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: '波动率 (%)', position: 'insideBottom', offset: -5, fontSize: 12, fill: 'var(--text-muted)' }} />
              <YAxis dataKey="expectedReturn" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: '收益率 (%)', angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-muted)' }} />
              <ZAxis range={[60, 60]} />
              <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
              <Scatter data={scatterData} onClick={handleClick}>
                {scatterData.map((entry, index) => (
                  <Cell key={index} fill={sharpeToColor(entry.sharpeRatio, sharpeRange.min, sharpeRange.max)} />
                ))}
              </Scatter>
              {maxSharpe && (
                <Scatter data={[{ expectedVolatility: maxSharpe.expectedVolatility, expectedReturn: maxSharpe.expectedReturn }]} fill={CHART_COLORS[0]} shape="star" />
              )}
            </ScatterChart>
          </ResponsiveContainer>

          {/* Frontier Allocations 堆叠面积图 */}
          {allocationData.length > 0 && allAssetTickers.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>Frontier Allocations</div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={allocationData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis dataKey="point" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} label={{ value: '前沿点', position: 'insideBottom', offset: -5, fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
                  {allAssetTickers.map((ticker, i) => (
                    <Area key={ticker} type="monotone" dataKey={ticker} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.8} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              {/* 图例 */}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {allAssetTickers.map((ticker, i) => (
                  <div key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span style={{ color: 'var(--text-muted)' }}>{ticker}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Correlation Matrix 相关性矩阵 */}
          {correlations && correlations.tickers.length >= 2 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>Correlation Matrix</div>
              <div className="overflow-x-auto">
                <table className="border-collapse">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }} />
                      {correlations.tickers.map((t) => (
                        <th key={t} className="px-3 py-2 text-[11px] font-medium text-center" style={{ color: 'var(--text-muted)' }}>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {correlations.tickers.map((rowTicker, i) => (
                      <tr key={rowTicker}>
                        <td className="px-3 py-2 text-[12px] font-medium" style={{ color: 'var(--text-body)' }}>{rowTicker}</td>
                        {correlations.tickers.map((colTicker, j) => {
                          const val = correlations.matrix[i]?.[j] ?? 0;
                          return (
                            <td
                              key={colTicker}
                              className="text-[12px] text-center cursor-default"
                              style={{
                                backgroundColor: getCorrelationColor(val),
                                color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
                                width: `${Math.max(48, 600 / correlations.tickers.length)}px`,
                                height: `${Math.max(36, 400 / correlations.tickers.length)}px`,
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
            </>
          )}

          {/* 点击查看的权重详情 */}
          {selectedPoint && (
            <div style={{ marginTop: 16, padding: 16, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>选中组合详情</div>
                <button
                  onClick={() => handleLoadInBacktester(selectedPoint)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 'var(--radius-control)',
                    border: '1px solid var(--brand)', backgroundColor: 'transparent',
                    color: 'var(--brand)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--brand)'; }}
                >
                  <ArrowRight className="w-3 h-3" />
                  Load
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>权重分配</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(selectedPoint.weights).map(([ticker, weight], i) => (
                      <div key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 60, fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>{ticker}</span>
                        <div style={{ flex: 1, height: 16, borderRadius: 4, overflow: 'hidden', backgroundColor: 'var(--bg-elevated)' }}>
                          <div style={{ height: '100%', borderRadius: 4, width: `${weight * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)', width: 48, textAlign: 'right' }}>{(weight * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ padding: 10, backgroundColor: 'var(--bg-elevated)', borderRadius: 'var(--radius-control)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>预期收益</div>
                    <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--success)' }}>{selectedPoint.expectedReturn.toFixed(2)}%</div>
                  </div>
                  <div style={{ padding: 10, backgroundColor: 'var(--bg-elevated)', borderRadius: 'var(--radius-control)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>预期波动率</div>
                    <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--warning)' }}>{selectedPoint.expectedVolatility.toFixed(2)}%</div>
                  </div>
                  <div style={{ padding: 10, backgroundColor: 'var(--bg-elevated)', borderRadius: 'var(--radius-control)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>夏普比率</div>
                    <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--brand)' }}>{selectedPoint.sharpeRatio.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 最大夏普组合 */}
          {maxSharpe && (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>最大夏普组合</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>权重</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(maxSharpe.weights).map(([ticker, weight], i) => (
                      <div key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 60, fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>{ticker}</span>
                        <div style={{ flex: 1, height: 16, borderRadius: 4, overflow: 'hidden', backgroundColor: 'var(--bg-subtle)' }}>
                          <div style={{ height: '100%', borderRadius: 4, width: `${weight * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{(weight * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>预期收益</div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--success)' }}>{maxSharpe.expectedReturn.toFixed(2)}%</div>
                  </div>
                  <div style={{ padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>预期波动率</div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--warning)' }}>{maxSharpe.expectedVolatility.toFixed(2)}%</div>
                  </div>
                  <div style={{ padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>夏普比率</div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--brand)' }}>{maxSharpe.sharpeRatio.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 参数汇总 */}
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>参数汇总</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>调仓频率</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>
                {{ daily: '每日', weekly: '每周', monthly: '每月', quarterly: '每季度', yearly: '每年' }[rebalanceFrequency] || rebalanceFrequency}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>允许现金分配</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: allowCash ? 'var(--success)' : 'var(--text-muted)' }}>{allowCash ? '是' : '否'}</div>
            </div>
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>收益目标</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{returnObjective === 'maxCagr' ? 'Max CAGR' : 'Min Vol'}</div>
            </div>
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>求解器</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{solver === 'markowitz' ? 'Markowitz' : 'NSGA-II'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
