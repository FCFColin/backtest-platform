/**
 * @file 组合优化器页面
 * @description 基于 Markowitz 或遗传算法求解最优投资组合权重，支持最大夏普、最小波动等目标
 * @route /optimizer
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Loader2, Plus, X, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { OptimizationResult, Statistics } from '../../shared/types';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';

type SolverType = 'markowitz' | 'ga';

export default function OptimizerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND']);
  const [objective, setObjective] = useState('maxSharpe');
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [minWeight, setMinWeight] = useState(0);
  const [maxWeight, setMaxWeight] = useState(100);
  const [tbillRate, setTbillRate] = useState(5.0);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculatingStats, setIsCalculatingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<(OptimizationResult & {
    frontier?: Array<{ expectedReturn: number; expectedVolatility: number; sharpeRatio: number }>;
  }) | null>(null);
  const [backtestStats, setBacktestStats] = useState<Statistics | null>(null);

  // 新增约束条件
  const [minCagr, setMinCagr] = useState('');
  const [minSharpe, setMinSharpe] = useState('');
  const [minSortino, setMinSortino] = useState('');
  const [maxVol, setMaxVol] = useState('');
  const [maxMaxDD, setMaxMaxDD] = useState('');
  const [maxAvgDD, setMaxAvgDD] = useState('');
  const [allowShort, setAllowShort] = useState(false);
  const [maxHoldings, setMaxHoldings] = useState('');
  const [minWeightToInclude, setMinWeightToInclude] = useState('');
  const [solver, setSolver] = useState<SolverType>('markowitz');

  // 历史约束优化：启用/禁用开关（针对最大回撤、最小收益、最大波动率三项）
  const [enableMaxDD, setEnableMaxDD] = useState(false);
  const [enableMinCagr, setEnableMinCagr] = useState(false);
  const [enableMaxVol, setEnableMaxVol] = useState(false);

  const addTicker = () => setTickers([...tickers, '']);
  const removeTicker = (i: number) => {
    const remaining = tickers.filter((_, idx) => idx !== i).filter(Boolean);
    if (remaining.length < 2) return; // Need at least 2 valid tickers
    setTickers(tickers.filter((_, idx) => idx !== i));
  };
  const updateTicker = (i: number, val: string) => { const n = [...tickers]; n[i] = val; setTickers(n); };

  const runOptimize = async () => {
    const validTickers = tickers.filter(Boolean);
    if (validTickers.length < 2) {
      setError(t('optimizer.errorMinTwoTickers'));
      return;
    }
    if (minWeight > maxWeight) {
      setError(t('optimizer.errorMinGtMax'));
      return;
    }
    setIsLoading(true);
    setError(null);
    setBacktestStats(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const constraints: Record<string, any> = {
        minWeight: minWeight / 100,
        maxWeight: maxWeight / 100,
        tbillRate,
      };
      // 历史约束优化：仅在启用且填写了数值时作为过滤条件
      if (enableMinCagr && minCagr !== '') constraints.minCagr = Number(minCagr) / 100;
      if (minSharpe !== '') constraints.minSharpe = Number(minSharpe);
      if (minSortino !== '') constraints.minSortino = Number(minSortino);
      if (enableMaxVol && maxVol !== '') constraints.maxVol = Number(maxVol) / 100;
      if (enableMaxDD && maxMaxDD !== '') constraints.maxMaxDD = Number(maxMaxDD) / 100;
      if (maxAvgDD !== '') constraints.maxAvgDD = Number(maxAvgDD) / 100;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {
        tickers: validTickers,
        objective,
        constraints,
        parameters: { startDate, endDate, startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '', baseCurrency: 'usd', extendedWithdrawalStats: false, cashflowLegs: [], oneTimeCashflows: [] },
        allowShort,
        solver,
      };
      if (maxHoldings !== '') body.maxHoldings = Number(maxHoldings);
      if (minWeightToInclude !== '') body.minWeightToInclude = Number(minWeightToInclude) / 100;

      const res = await fetch('/api/backtest/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || t('optimizer.optFailed'));
      const optResult = json.data ?? json;
      setResults(optResult);

      // 用最优权重跑一次回测以获取完整统计指标
      setIsCalculatingStats(true);
      try {
        const weightEntries = Object.entries(optResult.optimalWeights as Record<string, number>);
        const btBody = {
          portfolios: [{
            name: t('optimizer.optimalPortfolio'),
            assets: weightEntries.map(([ticker, weight]: [string, number]) => ({ ticker, weight: Math.round(weight * 10000) / 100 })),
            rebalanceFrequency: 'quarterly',
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
          if (btData.portfolios?.[0]?.statistics) {
            setBacktestStats(btData.portfolios[0].statistics);
          }
        }
      } finally {
        setIsCalculatingStats(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('optimizer.optFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadInBacktester = () => {
    if (!results) return;
    const weightEntries = Object.entries(results.optimalWeights);
    const portfolioData = {
      portfolios: [{
        id: `portfolio-${Date.now()}-1`,
        name: t('optimizer.optimalPortfolio'),
        assets: weightEntries.map(([ticker, weight]) => ({ ticker, weight: Math.round(weight * 10000) / 100 })),
        rebalanceFrequency: 'quarterly',
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

  const weightBarData = results
    ? Object.entries(results.optimalWeights).map(([ticker, weight], i) => ({
        ticker,
        weight: Number((weight * 100).toFixed(1)),
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }))
    : [];

  const frontierData = results?.frontier ?? [];

  // 指标行定义
  const metricsRows: { key: keyof Statistics; label: string; fmt: 'pct' | 'num' }[] = [
    { key: 'cagr', label: 'CAGR', fmt: 'pct' },
    { key: 'stdev', label: t('optimizer.volatilityLT').replace(' <', ''), fmt: 'pct' },
    { key: 'maxDrawdown', label: t('backtest.maxDrawdown'), fmt: 'pct' },
    { key: 'avgDrawdown', label: t('optimizer.maxDrawdownLT').replace(' <', ''), fmt: 'pct' },
    { key: 'sharpe', label: t('backtest.sharpeRatio'), fmt: 'num' },
    { key: 'sortino', label: 'Sortino', fmt: 'num' },
    { key: 'calmar', label: 'Calmar', fmt: 'num' },
    { key: 'ulcerIndex', label: 'Ulcer Index', fmt: 'num' },
    { key: 'ulcerPerformanceIndex', label: 'UPI', fmt: 'num' },
  ];

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toFixed(2);

  // ===== 左侧参数面板 =====
  const renderParams = () => (
    <ParamsPanel>
      <ParamsSection title={t('optimizer.assetSelection')} info={t('optimizer.assetSelectionInfo')}>
        <div className="portfolio-card" style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}>
          {tickers.map((tk, i) => (
            <div key={tk || i} className="ticker-row">
              <input
                type="text"
                value={tk}
                onChange={(e) => updateTicker(i, e.target.value)}
                placeholder={t('optimizer.tickerPlaceholder')}
                className="ticker-input"
              />
              {tickers.length > 2 && (
                <button onClick={() => removeTicker(i)} className="row-remove-btn" title={t('common.delete')}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="toolbar-btn" onClick={addTicker}>
            <Plus className="w-4 h-4" />
            {t('optimizer.addAsset')}
          </button>
        </div>
      </ParamsSection>

      <ParamsSection title={t('optimizer.basicParams')} info={t('optimizer.basicParamsInfo')}>
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
            <span>{t('optimizer.allHistory')}</span>
          </label>
          <div className="param-field">
            <span className="param-label">{t('optimizer.startDate')}</span>
            <input type="date" className="param-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="param-field">
            <span className="param-label">{t('optimizer.endDate')}</span>
            <input type="date" className="param-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="param-field">
            <span className="param-label">{t('optimizer.objective')}</span>
            <select className="param-input" value={objective} onChange={(e) => setObjective(e.target.value)}>
              <option value="maxSharpe">{t('optimizer.maxSharpe')}</option>
              <option value="minVolatility">{t('optimizer.minVolatility')}</option>
              <option value="maxReturn">{t('optimizer.maxReturn')}</option>
            </select>
          </div>
          <div className="param-field param-field-rolling">
            <span className="param-label">{t('optimizer.minWeight')}</span>
            <div className="param-input-suffix-wrap">
              <input type="number" className="param-input param-input-with-suffix" value={minWeight} onChange={(e) => setMinWeight(Number(e.target.value))} min={0} max={100} />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
          <div className="param-field param-field-rolling">
            <span className="param-label">{t('optimizer.maxWeight')}</span>
            <div className="param-input-suffix-wrap">
              <input type="number" className="param-input param-input-with-suffix" value={maxWeight} onChange={(e) => setMaxWeight(Number(e.target.value))} min={0} max={100} />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
          <div className="param-field param-field-rolling">
            <span className="param-label">{t('optimizer.tbillRate')}</span>
            <div className="param-input-suffix-wrap">
              <input type="number" step="0.1" className="param-input param-input-with-suffix" value={tbillRate} onChange={(e) => setTbillRate(Number(e.target.value))} />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
          <div className="param-field">
            <span className="param-label">{t('optimizer.solver')}</span>
            <select className="param-input" value={solver} onChange={(e) => setSolver(e.target.value as SolverType)}>
              <option value="markowitz">{t('optimizer.solverMarkowitz')}</option>
              <option value="ga">{t('optimizer.solverGA')}</option>
            </select>
          </div>
          <label className="param-check">
            <input type="checkbox" checked={allowShort} onChange={(e) => setAllowShort(e.target.checked)} />
            <span>{t('optimizer.allowShort')}</span>
          </label>
        </div>
      </ParamsSection>

      <ParamsSection title={t('optimizer.historicalConstraints')} info={t('optimizer.historicalConstraintsInfo')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 最大回撤约束 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="param-check" style={{ width: 130, marginBottom: 0 }}>
              <input type="checkbox" checked={enableMaxDD} onChange={(e) => setEnableMaxDD(e.target.checked)} />
              <span>{t('optimizer.maxDrawdownLT')}</span>
            </label>
            <div className="param-field param-field-rolling" style={{ flex: 1 }}>
              <div className="param-input-suffix-wrap">
                <input type="number" step="0.1" className="param-input param-input-with-suffix" value={maxMaxDD} onChange={(e) => setMaxMaxDD(e.target.value)} placeholder={t('optimizer.placeholderDD')} disabled={!enableMaxDD} />
                <span className="param-input-suffix">%</span>
              </div>
            </div>
          </div>
          {/* 最小收益约束 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="param-check" style={{ width: 130, marginBottom: 0 }}>
              <input type="checkbox" checked={enableMinCagr} onChange={(e) => setEnableMinCagr(e.target.checked)} />
              <span>{t('optimizer.cagrGT')}</span>
            </label>
            <div className="param-field param-field-rolling" style={{ flex: 1 }}>
              <div className="param-input-suffix-wrap">
                <input type="number" step="0.1" className="param-input param-input-with-suffix" value={minCagr} onChange={(e) => setMinCagr(e.target.value)} placeholder={t('optimizer.placeholderCagr')} disabled={!enableMinCagr} />
                <span className="param-input-suffix">%</span>
              </div>
            </div>
          </div>
          {/* 最大波动率约束 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="param-check" style={{ width: 130, marginBottom: 0 }}>
              <input type="checkbox" checked={enableMaxVol} onChange={(e) => setEnableMaxVol(e.target.checked)} />
              <span>{t('optimizer.volatilityLT')}</span>
            </label>
            <div className="param-field param-field-rolling" style={{ flex: 1 }}>
              <div className="param-input-suffix-wrap">
                <input type="number" step="0.1" className="param-input param-input-with-suffix" value={maxVol} onChange={(e) => setMaxVol(e.target.value)} placeholder={t('optimizer.placeholderVol')} disabled={!enableMaxVol} />
                <span className="param-input-suffix">%</span>
              </div>
            </div>
          </div>
        </div>
      </ParamsSection>

      <ParamsSection title={t('optimizer.advancedConstraints')} defaultOpen={false} info={t('optimizer.advancedConstraintsInfo')}>
        <div className="params-row">
          <div className="param-field param-field-rolling">
            <span className="param-label">{t('optimizer.minSharpeLabel')}</span>
            <input type="number" step="0.01" className="param-input" value={minSharpe} onChange={(e) => setMinSharpe(e.target.value)} placeholder="—" />
          </div>
          <div className="param-field param-field-rolling">
            <span className="param-label">{t('optimizer.minSortinoLabel')}</span>
            <input type="number" step="0.01" className="param-input" value={minSortino} onChange={(e) => setMinSortino(e.target.value)} placeholder="—" />
          </div>
          <div className="param-field param-field-rolling">
            <span className="param-label">{t('optimizer.maxAvgDDLabel')}</span>
            <div className="param-input-suffix-wrap">
              <input type="number" step="0.1" className="param-input param-input-with-suffix" value={maxAvgDD} onChange={(e) => setMaxAvgDD(e.target.value)} placeholder="—" />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
          <div className="param-field">
            <span className="param-label">{t('optimizer.maxHoldings')}</span>
            <input type="number" className="param-input" value={maxHoldings} onChange={(e) => setMaxHoldings(e.target.value)} placeholder="—" min={2} />
          </div>
          <div className="param-field param-field-rolling">
            <span className="param-label">{t('optimizer.minWeightToInclude')}</span>
            <div className="param-input-suffix-wrap">
              <input type="number" className="param-input param-input-with-suffix" value={minWeightToInclude} onChange={(e) => setMinWeightToInclude(e.target.value)} placeholder="—" min={0} max={100} />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
        </div>
      </ParamsSection>

      {/* 执行按钮 */}
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button onClick={runOptimize} disabled={isLoading || isCalculatingStats} className="main-action-btn" style={{ width: '100%' }}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isCalculatingStats ? t('optimizer.calculatingStats') : isLoading ? t('optimizer.optimizing') : t('optimizer.startCalc')}
        </button>
      </div>
    </ParamsPanel>
  );

  // ===== 右侧结果面板 =====
  const renderResultsPanel = () => {
    if (error) {
      return (
        <div className="bt-results-card card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          {t('optimizer.optFailed')}：{error}
        </div>
      );
    }
    if (!results) {
      return (
        <div className="bt-results-card card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>
          {t('optimizer.noResultsHint')}
        </div>
      );
    }
    return (
      <div className="bt-results-card card">
        {/* 最优权重 - 水平条形图 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>{t('optimizer.optimalWeights')}</div>
          <button
            onClick={handleLoadInBacktester}
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
            {t('optimizer.loadInBacktester')}
          </button>
        </div>
        <ResponsiveContainer width="100%" height={weightBarData.length * 48 + 20}>
          <BarChart data={weightBarData} layout="vertical" margin={{ left: 60, right: 40, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}%`} />
            <YAxis type="category" dataKey="ticker" tick={{ fontSize: 13, fill: 'var(--text-strong)', fontWeight: 500 }} width={56} />
            <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
            <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={24}>
              {weightBarData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Optimal Portfolio Metrics 完整指标表格 */}
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>{t('optimizer.optimalMetrics')}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                  {t('common.metric')}
                </th>
                <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                  {t('optimizer.optimalPortfolio')}
                </th>
              </tr>
            </thead>
            <tbody>
              {metricsRows.map((row, rowIdx) => {
                const val = backtestStats ? backtestStats[row.key] : undefined;
                // 对于没有回测数据的情况，用优化结果中的预期值做兜底显示
                let displayVal: string;
                if (val !== undefined && val !== null) {
                  displayVal = row.fmt === 'pct' ? fmtPct(val as number) : fmtNum(val as number);
                } else if (row.key === 'cagr' && !backtestStats) {
                  displayVal = fmtPct(results.expectedReturn);
                } else if (row.key === 'stdev' && !backtestStats) {
                  displayVal = fmtPct(results.expectedVolatility);
                } else if (row.key === 'sharpe' && !backtestStats) {
                  displayVal = fmtNum(results.sharpeRatio);
                } else {
                  displayVal = '\u2014';
                }
                return (
                  <tr key={row.key} style={{ backgroundColor: rowIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                    <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                      {row.label}
                    </td>
                    <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                      {displayVal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 有效前沿散点图 */}
        {frontierData.length > 0 && (
          <>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>{t('optimizer.efficientFrontier')}</div>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                <XAxis dataKey="expectedVolatility" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: t('optimizer.volatilityAxis'), position: 'insideBottom', offset: -5, fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis dataKey="expectedReturn" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: t('optimizer.returnAxis'), angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-muted)' }} />
                <ZAxis range={[36, 36]} />
                <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
                <Scatter data={frontierData.map((p) => ({ expectedVolatility: p.expectedVolatility, expectedReturn: p.expectedReturn }))} fill={CHART_COLORS[0]} fillOpacity={0.6} />
                <Scatter data={[{ expectedVolatility: results.expectedVolatility, expectedReturn: results.expectedReturn }]} fill={CHART_COLORS[3]} shape="star" />
              </ScatterChart>
            </ResponsiveContainer>
          </>
        )}

        {/* 约束条件汇总 */}
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>{t('optimizer.constraintsSummary')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.minWeight')}</div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{minWeight}%</div>
          </div>
          <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.maxWeight')}</div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{maxWeight}%</div>
          </div>
          <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.tbillRate')}</div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{tbillRate}%</div>
          </div>
          <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.allowShort')}</div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: allowShort ? 'var(--success)' : 'var(--text-muted)' }}>{allowShort ? t('common.yes') : t('common.no')}</div>
          </div>
          {enableMinCagr && minCagr !== '' && (
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.minCagrLabel')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{minCagr}%</div>
            </div>
          )}
          {minSharpe !== '' && (
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.minSharpeLabel')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{minSharpe}</div>
            </div>
          )}
          {minSortino !== '' && (
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.minSortinoLabel')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{minSortino}</div>
            </div>
          )}
          {enableMaxVol && maxVol !== '' && (
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.maxVolLabel')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{maxVol}%</div>
            </div>
          )}
          {enableMaxDD && maxMaxDD !== '' && (
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.maxMaxDDLabel')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{maxMaxDD}%</div>
            </div>
          )}
          {maxAvgDD !== '' && (
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.maxAvgDDLabel')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{maxAvgDD}%</div>
            </div>
          )}
          {maxHoldings !== '' && (
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.maxHoldings')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{maxHoldings}</div>
            </div>
          )}
          {minWeightToInclude !== '' && (
            <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.minWeightToInclude')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{minWeightToInclude}%</div>
            </div>
          )}
          <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{t('optimizer.solver')}</div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{solver === 'markowitz' ? 'Markowitz' : 'GA'}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('optimizer.title')}</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          {t('optimizer.seoDesc')}
        </p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">{t('optimizer.seoObjective')}</div>
            <div className="bt-seo-feature-desc">{t('optimizer.seoObjectiveDesc')}</div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">{t('optimizer.seoOutput')}</div>
            <div className="bt-seo-feature-desc">{t('optimizer.seoOutputDesc')}</div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">{t('optimizer.relatedTools')}</span>
          <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.portfolioBacktest')}</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.efficientFrontier')}</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.assetAnalysis')}</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.monteCarlo')}</Link>
        </div>
      </div>

      <ToolPageLayout
        title={t('params.title')}
        params={renderParams()}
        results={renderResultsPanel()}
      />
    </div>
  );
}
