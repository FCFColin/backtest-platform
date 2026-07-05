/**
 * @file 回测优化器页面
 * @description 遍历再平衡参数空间（频率 × 阈值 × 初始资金）运行回测，
 *              按优化目标排序，输出最优参数组合、对比表与收益曲线对比图。
 * @route /backtest-optimizer
 */
import { useState } from 'react';
import { Play, Loader2, Plus, X } from 'lucide-react';
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
import { CHART_COLORS } from '../../shared/types';
import type { RebalanceFrequency } from '../../shared/types';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';
import { SortableTable, type Column } from '../components/SortableTable';

/** 优化目标 */
type Objective = 'maxCagr' | 'minMaxDrawdown' | 'maxSharpe' | 'maxSortino';

/** 单个参数组合的回测结果 */
interface OptimizeResultItem {
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number;
  initialCapital: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  stdev: number;
  calmar: number;
}

/** 带收益曲线的最优组合 */
interface BestResultItem extends OptimizeResultItem {
  growthCurve: Array<{ date: string; value: number }>;
}

/** 频率选项 */
const FREQ_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  { value: 'daily', label: '日度' },
  { value: 'weekly', label: '周度' },
  { value: 'monthly', label: '月度' },
  { value: 'quarterly', label: '季度' },
  { value: 'annual', label: '年度' },
];

/** 频率显示标签 */
const FREQ_LABELS: Record<string, string> = {
  daily: '日度',
  weekly: '周度',
  monthly: '月度',
  quarterly: '季度',
  annual: '年度',
  threshold: '阈值',
  none: '不调仓',
};

const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
const fmtNum = (v: number) => v.toFixed(2);
const fmtMoney = (v: number) => `$${v.toLocaleString('en-US')}`;

/** 目标到排序键的映射 */
const OBJECTIVE_SORT_KEY: Record<Objective, keyof OptimizeResultItem> = {
  maxCagr: 'cagr',
  minMaxDrawdown: 'maxDrawdown',
  maxSharpe: 'sharpe',
  maxSortino: 'sortino',
};

/** 对比表列定义 */
const TABLE_COLUMNS: Column<OptimizeResultItem>[] = [
  {
    key: 'rebalanceFrequency',
    label: '再平衡频率',
    sortValue: (r) => r.rebalanceFrequency,
    render: (r) =>
      r.rebalanceFrequency === 'threshold'
        ? `阈值(${r.rebalanceThreshold}%)`
        : (FREQ_LABELS[r.rebalanceFrequency] ?? r.rebalanceFrequency),
  },
  {
    key: 'rebalanceThreshold',
    label: '阈值',
    sortValue: (r) => r.rebalanceThreshold ?? 0,
    render: (r) => (r.rebalanceThreshold !== undefined ? `${r.rebalanceThreshold}%` : '—'),
  },
  {
    key: 'initialCapital',
    label: '初始资金',
    sortValue: (r) => r.initialCapital,
    render: (r) => fmtMoney(r.initialCapital),
  },
  { key: 'cagr', label: 'CAGR', sortValue: (r) => r.cagr, render: (r) => fmtPct(r.cagr) },
  {
    key: 'maxDrawdown',
    label: '最大回撤',
    sortValue: (r) => r.maxDrawdown,
    render: (r) => fmtPct(r.maxDrawdown),
  },
  { key: 'stdev', label: '波动率', sortValue: (r) => r.stdev, render: (r) => fmtPct(r.stdev) },
  { key: 'sharpe', label: 'Sharpe', sortValue: (r) => r.sharpe, render: (r) => fmtNum(r.sharpe) },
  {
    key: 'sortino',
    label: 'Sortino',
    sortValue: (r) => r.sortino,
    render: (r) => fmtNum(r.sortino),
  },
  { key: 'calmar', label: 'Calmar', sortValue: (r) => r.calmar, render: (r) => fmtNum(r.calmar) },
];

// ===== 纯函数 =====

/** 构建优化请求体 */
function buildOptimizeBody(
  validAssets: Array<{ ticker: string; weight: string }>,
  frequencies: RebalanceFrequency[],
  range: {
    thrMin: string;
    thrMax: string;
    thrStep: string;
    capMin: string;
    capMax: string;
    capStep: string;
  },
  dates: { startDate: string; endDate: string; benchmarkTicker: string },
  config: {
    objective: Objective;
    enableMaxDD: boolean;
    maxDD: string;
    enableMinCagr: boolean;
    minCagr: string;
  },
): Record<string, unknown> {
  const c: Record<string, number> = {};
  if (config.enableMaxDD && config.maxDD !== '') c.maxDrawdown = Number(config.maxDD);
  if (config.enableMinCagr && config.minCagr !== '') c.minCagr = Number(config.minCagr);
  return {
    portfolio: {
      assets: validAssets.map((a) => ({
        ticker: a.ticker.trim().toUpperCase(),
        weight: Number(a.weight) || 0,
      })),
    },
    parameterSpace: {
      rebalanceFrequencies: frequencies,
      rebalanceThreshold: {
        min: Number(range.thrMin),
        max: Number(range.thrMax),
        step: Number(range.thrStep),
      },
      initialCapital: {
        min: Number(range.capMin),
        max: Number(range.capMax),
        step: Number(range.capStep),
      },
    },
    parameters: {
      startDate: dates.startDate,
      endDate: dates.endDate,
      benchmarkTicker: dates.benchmarkTicker.trim().toUpperCase(),
      baseCurrency: 'usd',
      adjustForInflation: false,
    },
    objective: config.objective,
    constraints: c,
  };
}

/** 收益曲线对比图数据（最优组合 vs 基准，按日期合并） */
function buildChartData(
  best: BestResultItem | null,
  benchmarkGrowth: Array<{ date: string; value: number }> | null,
): Array<{ date: string; portfolio: number; benchmark?: number }> {
  if (!best?.growthCurve) return [];
  const map = new Map<string, { date: string; portfolio: number; benchmark?: number }>();
  for (const p of best.growthCurve) map.set(p.date, { date: p.date, portfolio: p.value });
  if (benchmarkGrowth) {
    for (const p of benchmarkGrowth) {
      const entry = map.get(p.date);
      if (entry) entry.benchmark = p.value;
      else map.set(p.date, { date: p.date, portfolio: 0, benchmark: p.value });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** 最优组合指标卡片数据 */
function buildBestMetrics(best: BestResultItem | null): Array<{ label: string; value: string }> {
  if (!best) return [];
  return [
    {
      label: '再平衡频率',
      value:
        best.rebalanceFrequency === 'threshold'
          ? `阈值(${best.rebalanceThreshold}%)`
          : (FREQ_LABELS[best.rebalanceFrequency] ?? best.rebalanceFrequency),
    },
    { label: '初始资金', value: fmtMoney(best.initialCapital) },
    { label: 'CAGR', value: fmtPct(best.cagr) },
    { label: '最大回撤', value: fmtPct(best.maxDrawdown) },
    { label: '波动率', value: fmtPct(best.stdev) },
    { label: 'Sharpe', value: fmtNum(best.sharpe) },
    { label: 'Sortino', value: fmtNum(best.sortino) },
    { label: 'Calmar', value: fmtNum(best.calmar) },
  ];
}

// ===== State Hook =====

interface OptimizerState {
  assets: Array<{ ticker: string; weight: string }>;
  frequencies: RebalanceFrequency[];
  thrMin: string;
  thrMax: string;
  thrStep: string;
  capMin: string;
  capMax: string;
  capStep: string;
  objective: Objective;
  enableMaxDD: boolean;
  maxDD: string;
  enableMinCagr: boolean;
  minCagr: string;
  startDate: string;
  endDate: string;
  benchmarkTicker: string;
  isLoading: boolean;
  error: string | null;
  results: OptimizeResultItem[] | null;
  best: BestResultItem | null;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
  totalCombos: number;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string) => void;
  toggleFreq: (freq: RebalanceFrequency) => void;
  setObjective: (v: Objective) => void;
  setEnableMaxDD: (v: boolean) => void;
  setMaxDD: (v: string) => void;
  setEnableMinCagr: (v: boolean) => void;
  setMinCagr: (v: string) => void;
  setThrMin: (v: string) => void;
  setThrMax: (v: string) => void;
  setThrStep: (v: string) => void;
  setCapMin: (v: string) => void;
  setCapMax: (v: string) => void;
  setCapStep: (v: string) => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setBenchmarkTicker: (v: string) => void;
  runOptimize: () => Promise<void>;
}

function useOptimizerState(): OptimizerState {
  const [assets, setAssets] = useState<Array<{ ticker: string; weight: string }>>([
    { ticker: 'VTI', weight: '60' },
    { ticker: 'BND', weight: '40' },
  ]);
  const [frequencies, setFrequencies] = useState<RebalanceFrequency[]>(['quarterly']);
  const [thrMin, setThrMin] = useState('5');
  const [thrMax, setThrMax] = useState('20');
  const [thrStep, setThrStep] = useState('5');
  const [capMin, setCapMin] = useState('10000');
  const [capMax, setCapMax] = useState('10000');
  const [capStep, setCapStep] = useState('1000');
  const [objective, setObjective] = useState<Objective>('maxSharpe');
  const [enableMaxDD, setEnableMaxDD] = useState(false);
  const [maxDD, setMaxDD] = useState('20');
  const [enableMinCagr, setEnableMinCagr] = useState(false);
  const [minCagr, setMinCagr] = useState('5');
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [benchmarkTicker, setBenchmarkTicker] = useState('VTI');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OptimizeResultItem[] | null>(null);
  const [best, setBest] = useState<BestResultItem | null>(null);
  const [benchmarkGrowth, setBenchmarkGrowth] = useState<Array<{
    date: string;
    value: number;
  }> | null>(null);
  const [totalCombos, setTotalCombos] = useState(0);

  const addAsset = () => setAssets([...assets, { ticker: '', weight: '' }]);
  const removeAsset = (i: number) => {
    if (assets.length > 1) setAssets(assets.filter((_, idx) => idx !== i));
  };
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string) => {
    const next = [...assets];
    next[i] = { ...next[i], [field]: val };
    setAssets(next);
  };
  const toggleFreq = (freq: RebalanceFrequency) => {
    setFrequencies((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq],
    );
  };

  const runOptimize = async () => {
    const validAssets = assets.filter((a) => a.ticker.trim());
    if (validAssets.length === 0) {
      setError('请至少输入一个标的代码');
      return;
    }
    if (frequencies.length === 0) {
      setError('请至少选择一个再平衡频率');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResults(null);
    setBest(null);
    setBenchmarkGrowth(null);
    try {
      const body = buildOptimizeBody(
        validAssets,
        frequencies,
        { thrMin, thrMax, thrStep, capMin, capMax, capStep },
        { startDate, endDate, benchmarkTicker },
        { objective, enableMaxDD, maxDD, enableMinCagr, minCagr },
      );
      const res = await fetch('/api/backtest-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '优化失败');
      const data = json.data;
      setResults(data.results ?? []);
      setBest(data.best ?? null);
      setBenchmarkGrowth(data.benchmarkGrowth ?? null);
      setTotalCombos(data.totalCombinations ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '优化失败');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    assets,
    frequencies,
    thrMin,
    thrMax,
    thrStep,
    capMin,
    capMax,
    capStep,
    objective,
    enableMaxDD,
    maxDD,
    enableMinCagr,
    minCagr,
    startDate,
    endDate,
    benchmarkTicker,
    isLoading,
    error,
    results,
    best,
    benchmarkGrowth,
    totalCombos,
    addAsset,
    removeAsset,
    updateAsset,
    toggleFreq,
    setObjective,
    setEnableMaxDD,
    setMaxDD,
    setEnableMinCagr,
    setMinCagr,
    setThrMin,
    setThrMax,
    setThrStep,
    setCapMin,
    setCapMax,
    setCapStep,
    setStartDate,
    setEndDate,
    setBenchmarkTicker,
    runOptimize,
  };
}

// ===== 参数面板子组件 =====

function PortfolioConfigSection({ s }: { s: OptimizerState }) {
  return (
    <ParamsSection title="组合配置" info="输入标的代码与权重（百分比），权重无需合计 100">
      <div
        className="portfolio-card"
        style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}
      >
        {s.assets.map((a, i) => (
          <div key={i} className="ticker-row" style={{ gap: 6 }}>
            <input
              type="text"
              value={a.ticker}
              onChange={(e) => s.updateAsset(i, 'ticker', e.target.value)}
              placeholder="代码，如 VTI"
              className="ticker-input"
              style={{ flex: '1 1 0' }}
            />
            <div className="param-input-suffix-wrap" style={{ width: 90 }}>
              <input
                type="number"
                className="param-input param-input-with-suffix"
                value={a.weight}
                onChange={(e) => s.updateAsset(i, 'weight', e.target.value)}
                placeholder="权重"
                min={0}
                max={100}
              />
              <span className="param-input-suffix">%</span>
            </div>
            {s.assets.length > 1 && (
              <button onClick={() => s.removeAsset(i)} className="row-remove-btn" title="删除">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <button className="toolbar-btn" onClick={s.addAsset}>
          <Plus className="w-4 h-4" />
          添加标的
        </button>
      </div>
    </ParamsSection>
  );
}

function FreqMultiSelect({ s }: { s: OptimizerState }) {
  return (
    <div>
      <div className="param-label" style={{ marginBottom: 6 }}>
        再平衡频率
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FREQ_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="param-check"
            style={{
              padding: '4px 10px',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-control)',
              cursor: 'pointer',
              marginBottom: 0,
              backgroundColor: s.frequencies.includes(opt.value) ? 'var(--brand)' : 'transparent',
              color: s.frequencies.includes(opt.value) ? '#fff' : 'var(--text-body)',
              transition: 'all .15s',
            }}
          >
            <input
              type="checkbox"
              checked={s.frequencies.includes(opt.value)}
              onChange={() => s.toggleFreq(opt.value)}
              style={{ display: 'none' }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ThresholdRangeInputs({ s }: { s: OptimizerState }) {
  return (
    <div>
      <div className="param-label" style={{ marginBottom: 6 }}>
        再平衡阈值范围（仅阈值频率生效）
      </div>
      <div className="params-row">
        {[
          ['最小', s.thrMin, s.setThrMin],
          ['最大', s.thrMax, s.setThrMax],
          ['步长', s.thrStep, s.setThrStep],
        ].map(([label, val, set]) => (
          <div key={label as string} className="param-field param-field-rolling">
            <span className="param-label">{label as string}</span>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                step="0.5"
                className="param-input param-input-with-suffix"
                value={val as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
              />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapitalRangeInputs({ s }: { s: OptimizerState }) {
  const fields: Array<[string, string, (v: string) => void]> = [
    ['最小', s.capMin, s.setCapMin],
    ['最大', s.capMax, s.setCapMax],
    ['步长', s.capStep, s.setCapStep],
  ];
  return (
    <div>
      <div className="param-label" style={{ marginBottom: 6 }}>
        初始资金范围
      </div>
      <div className="params-row">
        {fields.map(([label, val, set]) => (
          <div key={label} className="param-field param-field-rolling">
            <span className="param-label">{label}</span>
            <div className="param-input-suffix-wrap">
              <span className="param-input-suffix" style={{ position: 'static', paddingRight: 2 }}>
                $
              </span>
              <input
                type="number"
                step="1000"
                className="param-input"
                value={val}
                onChange={(e) => set(e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParameterSpaceSection({ s }: { s: OptimizerState }) {
  return (
    <ParamsSection
      title="参数空间"
      info="设置再平衡频率、阈值与初始资金的搜索范围，系统遍历所有组合"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FreqMultiSelect s={s} />
        <ThresholdRangeInputs s={s} />
        <CapitalRangeInputs s={s} />
      </div>
    </ParamsSection>
  );
}

function ConstraintRow({
  enabled,
  setEnabled,
  label,
  value,
  setValue,
  placeholder,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <label className="param-check" style={{ width: 130, marginBottom: 0 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>{label}</span>
      </label>
      <div className="param-field param-field-rolling" style={{ flex: 1 }}>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            step="0.1"
            className="param-input param-input-with-suffix"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={!enabled}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
    </div>
  );
}

function ObjectiveSection({ s }: { s: OptimizerState }) {
  return (
    <ParamsSection title="优化目标" info="选择排序目标与可选约束条件，约束用于过滤不满足条件的组合">
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">目标</span>
          <select
            className="param-input"
            value={s.objective}
            onChange={(e) => s.setObjective(e.target.value as Objective)}
          >
            <option value="maxCagr">最大化 CAGR</option>
            <option value="minMaxDrawdown">最小化最大回撤</option>
            <option value="maxSharpe">最大化 Sharpe</option>
            <option value="maxSortino">最大化 Sortino</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <ConstraintRow
          enabled={s.enableMaxDD}
          setEnabled={s.setEnableMaxDD}
          label="最大回撤 &lt;"
          value={s.maxDD}
          setValue={s.setMaxDD}
          placeholder="如 20"
        />
        <ConstraintRow
          enabled={s.enableMinCagr}
          setEnabled={s.setEnableMinCagr}
          label="CAGR &gt;"
          value={s.minCagr}
          setValue={s.setMinCagr}
          placeholder="如 5"
        />
      </div>
    </ParamsSection>
  );
}

function BacktestRangeSection({ s }: { s: OptimizerState }) {
  return (
    <ParamsSection title="回测区间" info="设置回测日期范围与基准标的">
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">开始日期</span>
          <input
            type="date"
            className="param-input"
            value={s.startDate}
            onChange={(e) => s.setStartDate(e.target.value)}
          />
        </div>
        <div className="param-field">
          <span className="param-label">结束日期</span>
          <input
            type="date"
            className="param-input"
            value={s.endDate}
            onChange={(e) => s.setEndDate(e.target.value)}
          />
        </div>
        <div className="param-field">
          <span className="param-label">基准标的</span>
          <input
            type="text"
            className="param-input"
            value={s.benchmarkTicker}
            onChange={(e) => s.setBenchmarkTicker(e.target.value)}
            placeholder="如 VTI"
          />
        </div>
      </div>
    </ParamsSection>
  );
}

function OptimizerParams({ s }: { s: OptimizerState }) {
  return (
    <ParamsPanel>
      <PortfolioConfigSection s={s} />
      <ParameterSpaceSection s={s} />
      <ObjectiveSection s={s} />
      <BacktestRangeSection s={s} />
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button
          onClick={() => void s.runOptimize()}
          disabled={s.isLoading}
          className="main-action-btn"
          style={{ width: '100%' }}
        >
          {s.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {s.isLoading ? '优化中...' : '开始优化'}
        </button>
      </div>
    </ParamsPanel>
  );
}

// ===== 结果面板子组件 =====

function BestMetricsCard({
  best,
  totalCombos,
}: {
  best: BestResultItem | null;
  totalCombos: number;
}) {
  if (!best) return null;
  const metrics = buildBestMetrics(best);
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>
          最优参数组合
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>共 {totalCombos} 个组合</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              textAlign: 'center',
              padding: 12,
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-control)',
            }}
          >
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>
              {m.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'monospace',
                color: 'var(--text-body)',
              }}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function GrowthComparisonChart({
  best,
  benchmarkGrowth,
}: {
  best: BestResultItem | null;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
}) {
  const chartData = buildChartData(best, benchmarkGrowth);
  if (chartData.length === 0) return null;
  return (
    <>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        收益曲线对比（最优组合 vs 基准）
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ left: 8, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickFormatter={(d: string) => d.substring(0, 7)}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => `$${v.toLocaleString('en-US')}`}
            width={70}
          />
          <Tooltip
            labelFormatter={(d: string) => d}
            formatter={(v: number, name: string) => [
              `$${v.toLocaleString('en-US')}`,
              name === 'portfolio' ? '最优组合' : '基准',
            ]}
            contentStyle={{
              fontSize: 12,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-control)',
              color: 'var(--text-body)',
              boxShadow: 'var(--shadow-md)',
            }}
          />
          <Legend formatter={(name: string) => (name === 'portfolio' ? '最优组合' : '基准')} />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke={CHART_COLORS[0]}
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke={CHART_COLORS[1]}
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function ComparisonTableSection({
  results,
  objective,
}: {
  results: OptimizeResultItem[];
  objective: Objective;
}) {
  return (
    <>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        参数组合对比
      </div>
      {results.length > 0 ? (
        <SortableTable
          columns={TABLE_COLUMNS}
          data={results}
          initialSortKey={OBJECTIVE_SORT_KEY[objective]}
          initialSortDir="desc"
        />
      ) : (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24, fontSize: 13 }}>
          没有满足约束条件的参数组合，请放宽约束后重试
        </div>
      )}
    </>
  );
}

function OptimizerResults({ s }: { s: OptimizerState }) {
  if (s.error) {
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
      >
        优化失败：{s.error}
      </div>
    );
  }
  if (!s.results) {
    return (
      <div
        className="bt-results-card card"
        style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}
      >
        配置左侧参数并点击「开始优化」查看结果
      </div>
    );
  }
  return (
    <div className="bt-results-card card">
      <BestMetricsCard best={s.best} totalCombos={s.totalCombos} />
      <GrowthComparisonChart best={s.best} benchmarkGrowth={s.benchmarkGrowth} />
      <ComparisonTableSection results={s.results} objective={s.objective} />
    </div>
  );
}

// ===== SEO 卡片 =====

function SeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        回测优化器遍历再平衡频率、阈值与初始资金的参数空间，对每个组合运行完整回测，
        按优化目标（CAGR、最大回撤、Sharpe、Sortino）排序，快速找到最优参数配置。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">参数空间搜索</div>
          <div className="bt-seo-feature-desc">
            支持日/周/月/季/年再平衡频率多选，阈值与初始资金范围遍历，自动生成参数组合。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">多目标优化</div>
          <div className="bt-seo-feature-desc">
            最大化 CAGR / 最小化最大回撤 / 最大化 Sharpe / 最大化 Sortino，支持回撤与收益约束过滤。
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== 主组件 =====

export default function BacktestOptimizerPage() {
  const s = useOptimizerState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">回测优化器</h1>
      </div>
      <SeoCard />
      <ToolPageLayout
        title="参数设置"
        params={<OptimizerParams s={s} />}
        results={<OptimizerResults s={s} />}
      />
    </div>
  );
}
