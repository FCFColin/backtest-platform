/**
 * @file 组合优化器页面
 * @description 基于 Markowitz 或遗传算法求解最优投资组合权重，支持最大夏普、最小波动等目标
 * @route /optimizer
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Loader2, Plus, X, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { OptimizationResult, Statistics } from '../../shared/types';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';

type SolverType = 'markowitz' | 'ga';
type OptimizerResultExt = OptimizationResult & { frontier?: Array<{ expectedReturn: number; expectedVolatility: number; sharpeRatio: number }> };

const BASE_PARAMS = { startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '', baseCurrency: 'usd', extendedWithdrawalStats: false, cashflowLegs: [] as unknown[], oneTimeCashflows: [] as unknown[] };

function buildConstraints(s: OptimizerState): Record<string, number> {
  const c: Record<string, number> = { minWeight: s.minWeight / 100, maxWeight: s.maxWeight / 100, tbillRate: s.tbillRate };
  if (s.enableMinCagr && s.minCagr !== '') c.minCagr = Number(s.minCagr) / 100;
  if (s.minSharpe !== '') c.minSharpe = Number(s.minSharpe);
  if (s.minSortino !== '') c.minSortino = Number(s.minSortino);
  if (s.enableMaxVol && s.maxVol !== '') c.maxVol = Number(s.maxVol) / 100;
  if (s.enableMaxDD && s.maxMaxDD !== '') c.maxMaxDD = Number(s.maxMaxDD) / 100;
  if (s.maxAvgDD !== '') c.maxAvgDD = Number(s.maxAvgDD) / 100;
  return c;
}

async function runOptimizeApi(s: OptimizerState, t: (k: string) => string): Promise<OptimizerResultExt> {
  const validTickers = s.tickers.filter(Boolean);
  const body: Record<string, unknown> = { tickers: validTickers, objective: s.objective, constraints: buildConstraints(s), parameters: { ...BASE_PARAMS, startDate: s.startDate, endDate: s.endDate }, allowShort: s.allowShort, solver: s.solver };
  if (s.maxHoldings !== '') body.maxHoldings = Number(s.maxHoldings);
  if (s.minWeightToInclude !== '') body.minWeightToInclude = Number(s.minWeightToInclude) / 100;
  const res = await fetch('/api/backtest/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || t('optimizer.optFailed'));
  return json.data ?? json;
}

async function fetchStats(optResult: OptimizerResultExt, s: OptimizerState, t: (k: string) => string): Promise<Statistics | null> {
  const weights = Object.entries(optResult.optimalWeights as Record<string, number>);
  const btBody = { portfolios: [{ name: t('optimizer.optimalPortfolio'), assets: weights.map(([tk, w]) => ({ ticker: tk, weight: Math.round(w * 10000) / 100 })), rebalanceFrequency: 'quarterly', rebalanceOffset: 0, drag: 0, totalReturn: true }], parameters: { ...BASE_PARAMS, startDate: s.startDate, endDate: s.endDate } };
  const r = await fetch('/api/backtest/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(btBody) });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.data ?? j).portfolios?.[0]?.statistics ?? null;
}

interface OptimizerState {
  tickers: string[]; setTickers: React.Dispatch<React.SetStateAction<string[]>>;
  objective: string; setObjective: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void; endDate: string; setEndDate: (v: string) => void;
  minWeight: number; setMinWeight: (v: number) => void; maxWeight: number; setMaxWeight: (v: number) => void;
  tbillRate: number; setTbillRate: (v: number) => void; allowShort: boolean; setAllowShort: (v: boolean) => void;
  solver: SolverType; setSolver: (v: SolverType) => void;
  minCagr: string; setMinCagr: (v: string) => void; minSharpe: string; setMinSharpe: (v: string) => void;
  minSortino: string; setMinSortino: (v: string) => void; maxVol: string; setMaxVol: (v: string) => void;
  maxMaxDD: string; setMaxMaxDD: (v: string) => void; maxAvgDD: string; setMaxAvgDD: (v: string) => void;
  maxHoldings: string; setMaxHoldings: (v: string) => void; minWeightToInclude: string; setMinWeightToInclude: (v: string) => void;
  enableMaxDD: boolean; setEnableMaxDD: (v: boolean) => void; enableMinCagr: boolean; setEnableMinCagr: (v: boolean) => void;
  enableMaxVol: boolean; setEnableMaxVol: (v: boolean) => void;
  isLoading: boolean; isCalculatingStats: boolean; error: string | null;
  results: OptimizerResultExt | null; backtestStats: Statistics | null;
  runOptimize: () => Promise<void>; handleLoadInBacktester: () => void;
}

function useOptimizerState(t: (k: string) => string, navigate: (path: string) => void): OptimizerState {
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND']);
  const [objective, setObjective] = useState('maxSharpe');
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [minWeight, setMinWeight] = useState(0);
  const [maxWeight, setMaxWeight] = useState(100);
  const [tbillRate, setTbillRate] = useState(5.0);
  const [allowShort, setAllowShort] = useState(false);
  const [solver, setSolver] = useState<SolverType>('markowitz');
  const [minCagr, setMinCagr] = useState('');
  const [minSharpe, setMinSharpe] = useState('');
  const [minSortino, setMinSortino] = useState('');
  const [maxVol, setMaxVol] = useState('');
  const [maxMaxDD, setMaxMaxDD] = useState('');
  const [maxAvgDD, setMaxAvgDD] = useState('');
  const [maxHoldings, setMaxHoldings] = useState('');
  const [minWeightToInclude, setMinWeightToInclude] = useState('');
  const [enableMaxDD, setEnableMaxDD] = useState(false);
  const [enableMinCagr, setEnableMinCagr] = useState(false);
  const [enableMaxVol, setEnableMaxVol] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculatingStats, setIsCalculatingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OptimizerResultExt | null>(null);
  const [backtestStats, setBacktestStats] = useState<Statistics | null>(null);

  const state: OptimizerState = {
    tickers, setTickers, objective, setObjective, startDate, setStartDate, endDate, setEndDate,
    minWeight, setMinWeight, maxWeight, setMaxWeight, tbillRate, setTbillRate, allowShort, setAllowShort,
    solver, setSolver, minCagr, setMinCagr, minSharpe, setMinSharpe, minSortino, setMinSortino,
    maxVol, setMaxVol, maxMaxDD, setMaxMaxDD, maxAvgDD, setMaxAvgDD, maxHoldings, setMaxHoldings,
    minWeightToInclude, setMinWeightToInclude, enableMaxDD, setEnableMaxDD, enableMinCagr, setEnableMinCagr,
    enableMaxVol, setEnableMaxVol, isLoading, isCalculatingStats, error, results, backtestStats,
    runOptimize: async () => {
      if (tickers.filter(Boolean).length < 2) { setError(t('optimizer.errorMinTwoTickers')); return; }
      if (minWeight > maxWeight) { setError(t('optimizer.errorMinGtMax')); return; }
      setIsLoading(true); setError(null); setBacktestStats(null);
      try {
        const opt = await runOptimizeApi(state, t);
        setResults(opt); setIsCalculatingStats(true);
        try { setBacktestStats(await fetchStats(opt, state, t)); } finally { setIsCalculatingStats(false); }
      } catch (e) { setError(e instanceof Error ? e.message : t('optimizer.optFailed')); }
      finally { setIsLoading(false); }
    },
    handleLoadInBacktester: () => {
      if (!results) return;
      const weights = Object.entries(results.optimalWeights);
      const data = { portfolios: [{ id: `portfolio-${Date.now()}-1`, name: t('optimizer.optimalPortfolio'), assets: weights.map(([tk, w]) => ({ ticker: tk, weight: Math.round(w * 10000) / 100 })), rebalanceFrequency: 'quarterly', rebalanceOffset: 0, drag: 0, totalReturn: true }], parameters: { ...BASE_PARAMS, startDate, endDate, startingValue: 10000, baseCurrency: 'usd' } };
      localStorage.setItem('bt_load_from_optimizer', JSON.stringify(data));
      navigate('/');
    },
  };
  return state;
}

const METRICS_ROWS: { key: keyof Statistics; label: string; fmt: 'pct' | 'num' }[] = [
  { key: 'cagr', label: 'CAGR', fmt: 'pct' }, { key: 'stdev', label: 'Volatility', fmt: 'pct' },
  { key: 'maxDrawdown', label: 'Max Drawdown', fmt: 'pct' }, { key: 'avgDrawdown', label: 'Avg Drawdown', fmt: 'pct' },
  { key: 'sharpe', label: 'Sharpe', fmt: 'num' }, { key: 'sortino', label: 'Sortino', fmt: 'num' },
  { key: 'calmar', label: 'Calmar', fmt: 'num' }, { key: 'ulcerIndex', label: 'Ulcer Index', fmt: 'num' },
  { key: 'ulcerPerformanceIndex', label: 'UPI', fmt: 'num' },
];

function ConstraintCard({ label, value }: { label: string; value: string }) {
  return <div style={{ textAlign: 'center', padding: 12, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}><div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</div><div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-body)' }}>{value}</div></div>;
}

function ConstraintsSummary({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  const cards: Array<{ show: boolean; label: string; value: string }> = [
    { show: true, label: t('optimizer.minWeight'), value: `${s.minWeight}%` },
    { show: true, label: t('optimizer.maxWeight'), value: `${s.maxWeight}%` },
    { show: true, label: t('optimizer.tbillRate'), value: `${s.tbillRate}%` },
    { show: true, label: t('optimizer.allowShort'), value: s.allowShort ? t('common.yes') : t('common.no') },
    { show: s.enableMinCagr && s.minCagr !== '', label: t('optimizer.minCagrLabel'), value: `${s.minCagr}%` },
    { show: s.minSharpe !== '', label: t('optimizer.minSharpeLabel'), value: s.minSharpe },
    { show: s.minSortino !== '', label: t('optimizer.minSortinoLabel'), value: s.minSortino },
    { show: s.enableMaxVol && s.maxVol !== '', label: t('optimizer.maxVolLabel'), value: `${s.maxVol}%` },
    { show: s.enableMaxDD && s.maxMaxDD !== '', label: t('optimizer.maxMaxDDLabel'), value: `${s.maxMaxDD}%` },
    { show: s.maxAvgDD !== '', label: t('optimizer.maxAvgDDLabel'), value: `${s.maxAvgDD}%` },
    { show: s.maxHoldings !== '', label: t('optimizer.maxHoldings'), value: s.maxHoldings },
    { show: s.minWeightToInclude !== '', label: t('optimizer.minWeightToInclude'), value: `${s.minWeightToInclude}%` },
    { show: true, label: t('optimizer.solver'), value: s.solver === 'markowitz' ? 'Markowitz' : 'GA' },
  ];
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>{cards.filter(c => c.show).map((c, i) => <ConstraintCard key={i} label={c.label} value={c.value} />)}</div>;
}

function WeightBarChart({ data, onLoadBacktester }: { data: Array<{ ticker: string; weight: number; fill: string }>; onLoadBacktester: () => void }) {
  const { t } = useTranslation();
  return (<>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>{t('optimizer.optimalWeights')}</div>
      <button onClick={onLoadBacktester} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 'var(--radius-control)', border: '1px solid var(--brand)', backgroundColor: 'transparent', color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand)'; e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--brand)'; }}>
        <ArrowRight className="w-3.5 h-3.5" />{t('optimizer.loadInBacktester')}
      </button>
    </div>
    <ResponsiveContainer width="100%" height={data.length * 48 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 60, right: 40, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}%`} />
        <YAxis type="category" dataKey="ticker" tick={{ fontSize: 13, fill: 'var(--text-strong)', fontWeight: 500 }} width={56} />
        <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
        <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={24}>{data.map((entry, index) => <Cell key={index} fill={entry.fill} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  </>);
}

function MetricsTable({ backtestStats, results }: { backtestStats: Statistics | null; results: OptimizerResultExt }) {
  const { t } = useTranslation();
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toFixed(2);
  const getVal = (key: keyof Statistics, fmt: 'pct' | 'num'): string => {
    const val = backtestStats ? backtestStats[key] : undefined;
    if (val != null) return fmt === 'pct' ? fmtPct(val as number) : fmtNum(val as number);
    if (!backtestStats && key === 'cagr') return fmtPct(results.expectedReturn);
    if (!backtestStats && key === 'stdev') return fmtPct(results.expectedVolatility);
    if (!backtestStats && key === 'sharpe') return fmtNum(results.sharpeRatio);
    return '\u2014';
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
          <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>{t('common.metric')}</th>
          <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>{t('optimizer.optimalPortfolio')}</th>
        </tr></thead>
        <tbody>{METRICS_ROWS.map((row, i) => (
          <tr key={row.key} style={{ backgroundColor: i % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
            <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>{row.label}</td>
            <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>{getVal(row.key, row.fmt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function FrontierChart({ data, results }: { data: Array<{ expectedReturn: number; expectedVolatility: number }>; results: OptimizerResultExt }) {
  const { t } = useTranslation();
  if (data.length === 0) return null;
  return (<>
    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>{t('optimizer.efficientFrontier')}</div>
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis dataKey="expectedVolatility" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: t('optimizer.volatilityAxis'), position: 'insideBottom', offset: -5, fontSize: 12, fill: 'var(--text-muted)' }} />
        <YAxis dataKey="expectedReturn" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: t('optimizer.returnAxis'), angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-muted)' }} />
        <ZAxis range={[36, 36]} />
        <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
        <Scatter data={data.map(p => ({ expectedVolatility: p.expectedVolatility, expectedReturn: p.expectedReturn }))} fill={CHART_COLORS[0]} fillOpacity={0.6} />
        <Scatter data={[{ expectedVolatility: results.expectedVolatility, expectedReturn: results.expectedReturn }]} fill={CHART_COLORS[3]} shape="star" />
      </ScatterChart>
    </ResponsiveContainer>
  </>);
}

function TickerEditor({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  const add = () => s.setTickers([...s.tickers, '']);
  const remove = (i: number) => { if (s.tickers.filter(Boolean).length <= 2) return; s.setTickers(s.tickers.filter((_, idx) => idx !== i)); };
  const update = (i: number, v: string) => { const n = [...s.tickers]; n[i] = v; s.setTickers(n); };
  return (
    <ParamsSection title={t('optimizer.assetSelection')} info={t('optimizer.assetSelectionInfo')}>
      <div className="portfolio-card" style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}>
        {s.tickers.map((tk, i) => (
          <div key={tk || i} className="ticker-row">
            <input type="text" value={tk} onChange={(e) => update(i, e.target.value)} placeholder={t('optimizer.tickerPlaceholder')} className="ticker-input" />
            {s.tickers.length > 2 && <button onClick={() => remove(i)} className="row-remove-btn" title={t('common.delete')}><X className="w-4 h-4" /></button>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}><button className="toolbar-btn" onClick={add}><Plus className="w-4 h-4" />{t('optimizer.addAsset')}</button></div>
    </ParamsSection>
  );
}

function BasicParams({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('optimizer.basicParams')} info={t('optimizer.basicParamsInfo')}>
      <div className="params-row">
        <label className="param-check"><input type="checkbox" checked={s.startDate === '' && s.endDate === ''} onChange={(e) => { if (e.target.checked) { s.setStartDate(''); s.setEndDate(''); } else { s.setStartDate('2010-01-01'); s.setEndDate('2024-12-31'); } }} /><span>{t('optimizer.allHistory')}</span></label>
        <div className="param-field"><span className="param-label">{t('optimizer.startDate')}</span><input type="date" className="param-input" value={s.startDate} onChange={(e) => s.setStartDate(e.target.value)} /></div>
        <div className="param-field"><span className="param-label">{t('optimizer.endDate')}</span><input type="date" className="param-input" value={s.endDate} onChange={(e) => s.setEndDate(e.target.value)} /></div>
        <div className="param-field"><span className="param-label">{t('optimizer.objective')}</span><select className="param-input" value={s.objective} onChange={(e) => s.setObjective(e.target.value)}><option value="maxSharpe">{t('optimizer.maxSharpe')}</option><option value="minVolatility">{t('optimizer.minVolatility')}</option><option value="maxReturn">{t('optimizer.maxReturn')}</option></select></div>
        <div className="param-field param-field-rolling"><span className="param-label">{t('optimizer.minWeight')}</span><div className="param-input-suffix-wrap"><input type="number" className="param-input param-input-with-suffix" value={s.minWeight} onChange={(e) => s.setMinWeight(Number(e.target.value))} min={0} max={100} /><span className="param-input-suffix">%</span></div></div>
        <div className="param-field param-field-rolling"><span className="param-label">{t('optimizer.maxWeight')}</span><div className="param-input-suffix-wrap"><input type="number" className="param-input param-input-with-suffix" value={s.maxWeight} onChange={(e) => s.setMaxWeight(Number(e.target.value))} min={0} max={100} /><span className="param-input-suffix">%</span></div></div>
        <div className="param-field param-field-rolling"><span className="param-label">{t('optimizer.tbillRate')}</span><div className="param-input-suffix-wrap"><input type="number" step="0.1" className="param-input param-input-with-suffix" value={s.tbillRate} onChange={(e) => s.setTbillRate(Number(e.target.value))} /><span className="param-input-suffix">%</span></div></div>
        <div className="param-field"><span className="param-label">{t('optimizer.solver')}</span><select className="param-input" value={s.solver} onChange={(e) => s.setSolver(e.target.value as SolverType)}><option value="markowitz">{t('optimizer.solverMarkowitz')}</option><option value="ga">{t('optimizer.solverGA')}</option></select></div>
        <label className="param-check"><input type="checkbox" checked={s.allowShort} onChange={(e) => s.setAllowShort(e.target.checked)} /><span>{t('optimizer.allowShort')}</span></label>
      </div>
    </ParamsSection>
  );
}

function HistoricalConstraints({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  const items = [
    { checked: s.enableMaxDD, set: s.setEnableMaxDD, label: t('optimizer.maxDrawdownLT'), value: s.maxMaxDD, setVal: s.setMaxMaxDD, placeholder: t('optimizer.placeholderDD') },
    { checked: s.enableMinCagr, set: s.setEnableMinCagr, label: t('optimizer.cagrGT'), value: s.minCagr, setVal: s.setMinCagr, placeholder: t('optimizer.placeholderCagr') },
    { checked: s.enableMaxVol, set: s.setEnableMaxVol, label: t('optimizer.volatilityLT'), value: s.maxVol, setVal: s.setMaxVol, placeholder: t('optimizer.placeholderVol') },
  ];
  return (
    <ParamsSection title={t('optimizer.historicalConstraints')} info={t('optimizer.historicalConstraintsInfo')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="param-check" style={{ width: 130, marginBottom: 0 }}><input type="checkbox" checked={c.checked} onChange={(e) => c.set(e.target.checked)} /><span>{c.label}</span></label>
            <div className="param-field param-field-rolling" style={{ flex: 1 }}><div className="param-input-suffix-wrap"><input type="number" step="0.1" className="param-input param-input-with-suffix" value={c.value} onChange={(e) => c.setVal(e.target.value)} placeholder={c.placeholder} disabled={!c.checked} /><span className="param-input-suffix">%</span></div></div>
          </div>
        ))}
      </div>
    </ParamsSection>
  );
}

function AdvancedConstraints({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('optimizer.advancedConstraints')} defaultOpen={false} info={t('optimizer.advancedConstraintsInfo')}>
      <div className="params-row">
        <div className="param-field param-field-rolling"><span className="param-label">{t('optimizer.minSharpeLabel')}</span><input type="number" step="0.01" className="param-input" value={s.minSharpe} onChange={(e) => s.setMinSharpe(e.target.value)} placeholder="—" /></div>
        <div className="param-field param-field-rolling"><span className="param-label">{t('optimizer.minSortinoLabel')}</span><input type="number" step="0.01" className="param-input" value={s.minSortino} onChange={(e) => s.setMinSortino(e.target.value)} placeholder="—" /></div>
        <div className="param-field param-field-rolling"><span className="param-label">{t('optimizer.maxAvgDDLabel')}</span><div className="param-input-suffix-wrap"><input type="number" step="0.1" className="param-input param-input-with-suffix" value={s.maxAvgDD} onChange={(e) => s.setMaxAvgDD(e.target.value)} placeholder="—" /><span className="param-input-suffix">%</span></div></div>
        <div className="param-field"><span className="param-label">{t('optimizer.maxHoldings')}</span><input type="number" className="param-input" value={s.maxHoldings} onChange={(e) => s.setMaxHoldings(e.target.value)} placeholder="—" min={2} /></div>
        <div className="param-field param-field-rolling"><span className="param-label">{t('optimizer.minWeightToInclude')}</span><div className="param-input-suffix-wrap"><input type="number" className="param-input param-input-with-suffix" value={s.minWeightToInclude} onChange={(e) => s.setMinWeightToInclude(e.target.value)} placeholder="—" min={0} max={100} /><span className="param-input-suffix">%</span></div></div>
      </div>
    </ParamsSection>
  );
}

function OptimizerParams({ s }: { s: OptimizerState }): ReactNode {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <TickerEditor s={s} />
      <BasicParams s={s} />
      <HistoricalConstraints s={s} />
      <AdvancedConstraints s={s} />
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button onClick={() => void s.runOptimize()} disabled={s.isLoading || s.isCalculatingStats} className="main-action-btn" style={{ width: '100%' }}>
          {s.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {s.isCalculatingStats ? t('optimizer.calculatingStats') : s.isLoading ? t('optimizer.optimizing') : t('optimizer.startCalc')}
        </button>
      </div>
    </ParamsPanel>
  );
}

function OptimizerResults({ s }: { s: OptimizerState }) {
  const { t } = useTranslation();
  if (s.error) return <div className="bt-results-card card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>{t('optimizer.optFailed')}：{s.error}</div>;
  if (!s.results) return <div className="bt-results-card card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>{t('optimizer.noResultsHint')}</div>;
  const weightBarData = Object.entries(s.results.optimalWeights).map(([ticker, weight], i) => ({ ticker, weight: Number((weight * 100).toFixed(1)), fill: CHART_COLORS[i % CHART_COLORS.length] }));
  return (
    <div className="bt-results-card card">
      <WeightBarChart data={weightBarData} onLoadBacktester={s.handleLoadInBacktester} />
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>{t('optimizer.optimalMetrics')}</div>
      <MetricsTable backtestStats={s.backtestStats} results={s.results} />
      <FrontierChart data={s.results.frontier ?? []} results={s.results} />
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>{t('optimizer.constraintsSummary')}</div>
      <ConstraintsSummary s={s} />
    </div>
  );
}

export default function OptimizerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const s = useOptimizerState(t, navigate);
  return (
    <div className="bt-page">
      <div className="bt-page-header"><h1 className="bt-page-title">{t('optimizer.title')}</h1></div>
      <div className="bt-seo-card card">
        <p className="bt-seo-desc">{t('optimizer.seoDesc')}</p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature"><div className="bt-seo-feature-title">{t('optimizer.seoObjective')}</div><div className="bt-seo-feature-desc">{t('optimizer.seoObjectiveDesc')}</div></div>
          <div className="bt-seo-feature"><div className="bt-seo-feature-title">{t('optimizer.seoOutput')}</div><div className="bt-seo-feature-desc">{t('optimizer.seoOutputDesc')}</div></div>
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
      <ToolPageLayout title={t('params.title')} params={<OptimizerParams s={s} />} results={<OptimizerResults s={s} />} />
    </div>
  );
}
