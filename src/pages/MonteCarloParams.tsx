import { useState, type Dispatch, type SetStateAction } from 'react';
import { Play, Loader2, Plus, X } from 'lucide-react';
import type { MonteCarloResult } from '../../shared/types';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';

type PortfolioMode = 1 | 2;
type SimMode = 'standard' | 'frontier';

interface PortfolioState {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
}

function createDefaultPortfolio(suffix: number): PortfolioState {
  return {
    name: `组合 ${suffix}`,
    assets:
      suffix === 1
        ? [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ]
        : [
            { ticker: 'VXUS', weight: 50 },
            { ticker: 'BND', weight: 50 },
          ],
    rebalanceFrequency: 'yearly',
  };
}

const GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'maxCagrPercentile', label: '最大化 CAGR 百分位' },
  { value: 'minMaxDrawdown', label: '最小化最大回撤' },
  { value: 'maxSharpe', label: '最大化夏普比率' },
  { value: 'minVolatility', label: '最小化波动率' },
  { value: 'maxFinalValue', label: '最大化终值' },
  { value: 'maxSuccessRate', label: '最大化保本概率' },
];

function usePortfolioOperations(
  portfolios: PortfolioState[],
  setPortfolios: Dispatch<SetStateAction<PortfolioState[]>>,
) {
  const updatePortfolio = (idx: number, patch: Partial<PortfolioState>) =>
    setPortfolios((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  const addAsset = (pIdx: number) =>
    updatePortfolio(pIdx, { assets: [...portfolios[pIdx].assets, { ticker: '', weight: 0 }] });
  const removeAsset = (pIdx: number, aIdx: number) =>
    updatePortfolio(pIdx, { assets: portfolios[pIdx].assets.filter((_, i) => i !== aIdx) });
  const updateAsset = (
    pIdx: number,
    aIdx: number,
    field: 'ticker' | 'weight',
    val: string | number,
  ) => {
    const next = [...portfolios[pIdx].assets];
    next[aIdx] = { ...next[aIdx], [field]: val };
    updatePortfolio(pIdx, { assets: next });
  };
  const getTotalWeight = (pIdx: number) =>
    portfolios[pIdx].assets.reduce((s, a) => s + (a.weight || 0), 0);
  const isComplete = (pIdx: number) => getTotalWeight(pIdx) === 100;
  return { updatePortfolio, addAsset, removeAsset, updateAsset, getTotalWeight, isComplete };
}

function validatePortfolios(
  portfolios: PortfolioState[],
  portfolioMode: PortfolioMode,
  isComplete: (pIdx: number) => boolean,
): string | null {
  for (let i = 0; i < portfolioMode; i++) {
    const validAssets = portfolios[i].assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) return `组合 ${i + 1} 请至少添加一个标的`;
    if (!isComplete(i)) return `组合 ${i + 1} 权重合计必须为 100%`;
  }
  return null;
}

async function fetchMcResult(
  idx: number,
  portfolios: PortfolioState[],
  reqBody: { parameters: object; mcParams: object; objectives: object },
): Promise<MonteCarloResult> {
  const p = portfolios[idx];
  const res = await fetch('/api/backtest/monte-carlo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portfolio: {
        name: p.name,
        assets: p.assets.filter((a) => a.ticker.trim()),
        rebalanceFrequency: p.rebalanceFrequency,
      },
      ...reqBody,
    }),
  });
  if (!res.ok) throw new Error(`组合 ${idx + 1}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || `组合 ${idx + 1} 模拟失败`);
  return json.data ?? json;
}

interface SimExecParams {
  portfolios: PortfolioState[];
  portfolioMode: PortfolioMode;
  isComplete: (pIdx: number) => boolean;
  numYears: number;
  numSimulations: number;
  minBlock: number;
  maxBlock: number;
  withReplacement: boolean;
  randomSeed: string;
  startDate: string;
  endDate: string;
  startingValue: number;
  simMode: SimMode;
  goal1: string;
  goal2: string;
  goalWeight: number;
}

async function executeSimulation(
  params: SimExecParams,
  setters: {
    setError: (e: string | null) => void;
    setIsLoading: (b: boolean) => void;
    setResults1: (r: MonteCarloResult | null) => void;
    setResults2: (r: MonteCarloResult | null) => void;
  },
): Promise<void> {
  const validationError = validatePortfolios(
    params.portfolios,
    params.portfolioMode,
    params.isComplete,
  );
  if (validationError) {
    setters.setError(validationError);
    return;
  }
  setters.setIsLoading(true);
  setters.setError(null);
  setters.setResults1(null);
  setters.setResults2(null);
  const mcParams = {
    numYears: params.numYears,
    numSimulations: params.numSimulations,
    minBlockYears: params.minBlock,
    maxBlockYears: params.maxBlock,
    withReplacement: params.withReplacement,
    seed: params.randomSeed ? Number(params.randomSeed) : undefined,
  };
  const parameters = {
    startDate: params.startDate,
    endDate: params.endDate,
    startingValue: params.startingValue,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    baseCurrency: 'usd',
    extendedWithdrawalStats: false,
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
  const objectives = {
    mode: params.simMode,
    goal1: params.goal1,
    goal2: params.goal2,
    goal1Weight: params.goalWeight / 100,
    goal2Weight: (100 - params.goalWeight) / 100,
  };
  try {
    const reqBody = { parameters, mcParams, objectives };
    const promises = [fetchMcResult(0, params.portfolios, reqBody)];
    if (params.portfolioMode === 2) promises.push(fetchMcResult(1, params.portfolios, reqBody));
    const results = await Promise.all(promises);
    setters.setResults1(results[0]);
    if (results[1]) setters.setResults2(results[1]);
  } catch (e) {
    setters.setError(e instanceof Error ? e.message : '模拟失败');
  } finally {
    setters.setIsLoading(false);
  }
}

type DistMetric = 'finalValue' | 'cagr' | 'maxDrawdown' | 'volatility' | 'sharpe' | 'sortino';
type ResultTab = 'summary' | 'range' | 'success' | 'distributions' | 'scenarios';

function useMonteCarloState() {
  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>(1);
  const [numYears, setNumYears] = useState(20);
  const [numSimulations, setNumSimulations] = useState(500);
  const [startingValue, setStartingValue] = useState(100000);
  const [minBlock, setMinBlock] = useState(1);
  const [maxBlock, setMaxBlock] = useState(5);
  const [withReplacement, setWithReplacement] = useState(true);
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [randomSeed, setRandomSeed] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results1, setResults1] = useState<MonteCarloResult | null>(null);
  const [results2, setResults2] = useState<MonteCarloResult | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>('summary');
  const [distMetric, setDistMetric] = useState<DistMetric>('finalValue');
  const [portfolios, setPortfolios] = useState<PortfolioState[]>([
    createDefaultPortfolio(1),
    createDefaultPortfolio(2),
  ]);
  const [simMode, setSimMode] = useState<SimMode>('standard');
  const [goal1, setGoal1] = useState('maxCagrPercentile');
  const [goal2, setGoal2] = useState('minMaxDrawdown');
  const [goalWeight, setGoalWeight] = useState(50);

  const portfolioOps = usePortfolioOperations(portfolios, setPortfolios);
  const runSimulation = () =>
    executeSimulation(
      {
        portfolios,
        portfolioMode,
        ...portfolioOps,
        numYears,
        numSimulations,
        minBlock,
        maxBlock,
        withReplacement,
        randomSeed,
        startDate,
        endDate,
        startingValue,
        simMode,
        goal1,
        goal2,
        goalWeight,
      },
      { setError, setIsLoading, setResults1, setResults2 },
    );

  return {
    portfolioMode,
    setPortfolioMode,
    numYears,
    setNumYears,
    numSimulations,
    setNumSimulations,
    startingValue,
    setStartingValue,
    minBlock,
    setMinBlock,
    maxBlock,
    setMaxBlock,
    withReplacement,
    setWithReplacement,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    randomSeed,
    setRandomSeed,
    isLoading,
    error,
    results1,
    results2,
    activeTab,
    setActiveTab,
    distMetric,
    setDistMetric,
    portfolios,
    simMode,
    setSimMode,
    goal1,
    setGoal1,
    goal2,
    setGoal2,
    goalWeight,
    setGoalWeight,
    setPortfolios,
    ...portfolioOps,
    runSimulation,
  };
}

type McState = ReturnType<typeof useMonteCarloState>;

function PortfolioModeToggle({ s }: { s: McState }) {
  const { portfolioMode, setPortfolioMode } = s;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>组合数量</span>
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderRadius: 'var(--radius-control)',
          overflow: 'hidden',
          border: '1px solid var(--border-soft)',
        }}
      >
        {[1, 2].map((mode) => (
          <button
            key={mode}
            onClick={() => setPortfolioMode(mode as PortfolioMode)}
            style={{
              padding: '4px 14px',
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              borderLeft: mode === 2 ? '1px solid var(--border-soft)' : 'none',
              cursor: 'pointer',
              backgroundColor: portfolioMode === mode ? 'var(--brand)' : 'var(--bg-elevated)',
              color: portfolioMode === mode ? '#fff' : 'var(--text-body)',
              transition: 'all 0.15s',
            }}
          >
            {mode}组合
          </button>
        ))}
      </div>
    </div>
  );
}

function PortfolioEditor({
  portfolio: p,
  onUpdate,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
  totalWeight,
  isComplete,
}: {
  portfolio: PortfolioState;
  onUpdate: (patch: Partial<PortfolioState>) => void;
  onAddAsset: () => void;
  onRemoveAsset: (aIdx: number) => void;
  onUpdateAsset: (aIdx: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
  isComplete: boolean;
}) {
  return (
    <div
      className="portfolio-card"
      style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}
    >
      <div className="portfolio-card-header">
        <div className="portfolio-card-name-row">
          <input
            type="text"
            className="portfolio-name-input"
            style={{ flex: 1, width: 'auto' }}
            value={p.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
          <select
            className="portfolio-rebalance-select"
            value={p.rebalanceFrequency}
            onChange={(e) => onUpdate({ rebalanceFrequency: e.target.value })}
          >
            <option value="yearly">每年</option>
            <option value="quarterly">每季度</option>
            <option value="monthly">每月</option>
            <option value="none">不调仓</option>
          </select>
        </div>
      </div>
      {p.assets.map((a, i) => (
        <div key={i} className="ticker-row">
          <input
            type="text"
            value={a.ticker}
            onChange={(e) => onUpdateAsset(i, 'ticker', e.target.value)}
            placeholder="输入代码，如 VTI"
            className="ticker-input"
          />
          <div className="weight-cell">
            <input
              type="number"
              value={a.weight || ''}
              onChange={(e) => onUpdateAsset(i, 'weight', Number(e.target.value))}
              min={0}
              max={100}
              className="weight-input"
              placeholder="%"
            />
            <span className="weight-suffix">%</span>
          </div>
          <button onClick={() => onRemoveAsset(i)} className="row-remove-btn" title="删除">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="portfolio-card-toolbar">
        <button className="toolbar-btn" onClick={onAddAsset}>
          <Plus className="w-4 h-4" /> 添加标的
        </button>
      </div>
      <div className={`portfolio-total ${isComplete ? 'complete' : 'incomplete'}`}>
        <span>合计</span>
        <span className="total-value">{totalWeight}%</span>
      </div>
    </div>
  );
}

function PortfolioConfigSection({ s }: { s: McState }) {
  const { portfolios, portfolioMode, ...ops } = s;
  return (
    <ParamsSection title="组合配置" info="设置参与模拟的投资组合及其标的权重，权重合计需为 100%">
      <PortfolioModeToggle s={s} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PortfolioEditor
          portfolio={portfolios[0]}
          onUpdate={(patch) => ops.updatePortfolio(0, patch)}
          onAddAsset={() => ops.addAsset(0)}
          onRemoveAsset={(aIdx) => ops.removeAsset(0, aIdx)}
          onUpdateAsset={(aIdx, f, v) => ops.updateAsset(0, aIdx, f, v)}
          totalWeight={ops.getTotalWeight(0)}
          isComplete={ops.isComplete(0)}
        />
        {portfolioMode === 2 && (
          <PortfolioEditor
            portfolio={portfolios[1]}
            onUpdate={(patch) => ops.updatePortfolio(1, patch)}
            onAddAsset={() => ops.addAsset(1)}
            onRemoveAsset={(aIdx) => ops.removeAsset(1, aIdx)}
            onUpdateAsset={(aIdx, f, v) => ops.updateAsset(1, aIdx, f, v)}
            totalWeight={ops.getTotalWeight(1)}
            isComplete={ops.isComplete(1)}
          />
        )}
      </div>
    </ParamsSection>
  );
}

function SimParamsSection({ s }: { s: McState }) {
  return (
    <ParamsSection title="模拟参数" info="区块自举法参数：从历史数据中随机抽取区块拼接为模拟路径">
      <div className="params-row">
        <label className="param-check">
          <input type="checkbox" />
          <span>全部历史</span>
        </label>
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
          <span className="param-label">模拟年数</span>
          <input
            type="number"
            className="param-input"
            value={s.numYears}
            onChange={(e) => s.setNumYears(Number(e.target.value))}
          />
        </div>
        <div className="param-field">
          <span className="param-label">模拟次数</span>
          <input
            type="number"
            className="param-input"
            value={s.numSimulations}
            onChange={(e) => s.setNumSimulations(Number(e.target.value))}
          />
        </div>
        <div className="param-field param-field-start-val">
          <span className="param-label">初始资金</span>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={s.startingValue}
              onChange={(e) => s.setStartingValue(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="param-field param-field-rolling">
          <span className="param-label">最小区块</span>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={s.minBlock}
              onChange={(e) => s.setMinBlock(Number(e.target.value))}
            />
            <span className="param-input-suffix">年</span>
          </div>
        </div>
        <div className="param-field param-field-rolling">
          <span className="param-label">最大区块</span>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={s.maxBlock}
              onChange={(e) => s.setMaxBlock(Number(e.target.value))}
            />
            <span className="param-input-suffix">年</span>
          </div>
        </div>
        <div className="param-field">
          <span className="param-label">随机种子</span>
          <input
            type="number"
            className="param-input"
            value={s.randomSeed}
            onChange={(e) => s.setRandomSeed(e.target.value)}
            placeholder="留空则随机"
          />
        </div>
        <label className="param-check">
          <input
            type="checkbox"
            checked={s.withReplacement}
            onChange={(e) => s.setWithReplacement(e.target.checked)}
          />
          <span>有放回抽样</span>
        </label>
      </div>
    </ParamsSection>
  );
}

function BuildModeSection({ s }: { s: McState }) {
  const { simMode, setSimMode } = s;
  const modes = [
    { value: 'standard' as const, label: '标准模拟', desc: '— 对当前组合权重运行蒙特卡洛模拟' },
    {
      value: 'frontier' as const,
      label: '有效前沿构建',
      desc: '— 沿有效前沿采样权重组合并逐一模拟',
    },
  ];
  return (
    <ParamsSection
      title="构建模式"
      info="标准模拟：对当前组合运行区块自举；有效前沿构建：沿有效前沿采样权重组合，对每个组合运行模拟"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modes.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--text-body)',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="simMode"
              value={opt.value}
              checked={simMode === opt.value}
              onChange={() => setSimMode(opt.value)}
              style={{ cursor: 'pointer' }}
            />
            <span>{opt.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.desc}</span>
          </label>
        ))}
      </div>
    </ParamsSection>
  );
}

function GoalSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="param-field">
      <span className="param-label">{label}</span>
      <select className="param-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {GOAL_OPTIONS.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DualGoalSection({ s }: { s: McState }) {
  const { goal1, setGoal1, goal2, setGoal2, goalWeight, setGoalWeight } = s;
  return (
    <ParamsSection
      title="双目标设置"
      info="设定两个优化目标及权重分配，用于在模拟路径中权衡不同指标"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GoalSelector label="目标 1" value={goal1} onChange={setGoal1} />
        <GoalSelector label="目标 2" value={goal2} onChange={setGoal2} />
        <div className="param-field" style={{ gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="param-label">目标 1 权重</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-strong)' }}>
              {goalWeight}% : {100 - goalWeight}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={goalWeight}
            onChange={(e) => setGoalWeight(Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--brand)' }}
          />
        </div>
      </div>
    </ParamsSection>
  );
}

function McParamsPanel({ s }: { s: McState }) {
  return (
    <ParamsPanel>
      <PortfolioConfigSection s={s} />
      <SimParamsSection s={s} />
      <BuildModeSection s={s} />
      <DualGoalSection s={s} />
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button
          onClick={s.runSimulation}
          disabled={s.isLoading}
          className="main-action-btn"
          style={{ width: '100%' }}
        >
          {s.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {s.isLoading ? '模拟中...' : '开始模拟'}
        </button>
      </div>
    </ParamsPanel>
  );
}

export { useMonteCarloState, McParamsPanel, createDefaultPortfolio };
export type { McState, PortfolioState, PortfolioMode, DistMetric, ResultTab, SimMode };
