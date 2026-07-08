import { Play, Plus, X } from 'lucide-react';
import LoadingButton from '../components/LoadingButton.js';

type SolveSpeed = 'ultrafast' | 'fast' | 'medium' | 'slow';
type FrontierSolver = 'markowitz' | 'nsga2';
type ReturnObjective = 'maxCagr' | 'minVolatility';

const SOLVE_SPEED_OPTIONS = [
  { value: 'ultrafast', label: '极速' },
  { value: 'fast', label: '快速' },
  { value: 'medium', label: '中等' },
  { value: 'slow', label: '慢速' },
];
const REBALANCE_FREQ_OPTIONS = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季度' },
  { value: 'yearly', label: '每年' },
];
const RETURN_OBJ_OPTIONS = [
  { value: 'maxCagr', label: '最大化 CAGR' },
  { value: 'minVolatility', label: '最小化波动率' },
];
const SOLVER_OPTIONS = [
  { value: 'markowitz', label: 'Markowitz' },
  { value: 'nsga2', label: 'NSGA-II' },
];

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="param-field">
      <span className="param-label">{label}</span>
      <select className="param-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface FrontierParamsProps {
  tickers: string[];
  startDate: string;
  endDate: string;
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  onAddTicker: () => void;
  onRemoveTicker: (i: number) => void;
  onUpdateTicker: (i: number, val: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onNumPointsChange: (v: number) => void;
  onSolveSpeedChange: (v: SolveSpeed) => void;
  onMinInclusionWeightChange: (v: number) => void;
  onRebalanceFrequencyChange: (v: string) => void;
  onAllowCashChange: (v: boolean) => void;
  onReturnObjectiveChange: (v: ReturnObjective) => void;
  onSolverChange: (v: FrontierSolver) => void;
  isLoading: boolean;
  onRun: () => void;
}

function FrontierDateRange({ p }: { p: FrontierParamsProps }) {
  return (
    <>
      <label className="param-check">
        <input
          type="checkbox"
          checked={p.startDate === '' && p.endDate === ''}
          onChange={(e) => {
            if (e.target.checked) {
              p.onStartDateChange('');
              p.onEndDateChange('');
            } else {
              p.onStartDateChange('2010-01-01');
              p.onEndDateChange('2024-12-31');
            }
          }}
        />
        <span>全部历史</span>
      </label>
      <div className="param-field">
        <span className="param-label">开始日期</span>
        <input
          type="date"
          className="param-input"
          value={p.startDate}
          onChange={(e) => p.onStartDateChange(e.target.value)}
        />
      </div>
      <div className="param-field">
        <span className="param-label">结束日期</span>
        <input
          type="date"
          className="param-input"
          value={p.endDate}
          onChange={(e) => p.onEndDateChange(e.target.value)}
        />
      </div>
      <div className="param-field">
        <span className="param-label">采样点数</span>
        <input
          type="number"
          className="param-input"
          value={p.numPoints}
          onChange={(e) => p.onNumPointsChange(Number(e.target.value))}
          min={5}
          max={100}
        />
      </div>
    </>
  );
}

function FrontierAdvancedFields({ p }: { p: FrontierParamsProps }) {
  return (
    <>
      <SelectField
        label="求解速度"
        value={p.solveSpeed}
        onChange={(v) => p.onSolveSpeedChange(v as SolveSpeed)}
        options={SOLVE_SPEED_OPTIONS}
      />
      <div className="param-field param-field-rolling">
        <span className="param-label">最小包含权重</span>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={p.minInclusionWeight}
            onChange={(e) => p.onMinInclusionWeightChange(Number(e.target.value))}
            min={0}
            max={100}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
      <SelectField
        label="调仓频率"
        value={p.rebalanceFrequency}
        onChange={p.onRebalanceFrequencyChange}
        options={REBALANCE_FREQ_OPTIONS}
      />
      <SelectField
        label="收益目标"
        value={p.returnObjective}
        onChange={(v) => p.onReturnObjectiveChange(v as ReturnObjective)}
        options={RETURN_OBJ_OPTIONS}
      />
      <SelectField
        label="求解器"
        value={p.solver}
        onChange={(v) => p.onSolverChange(v as FrontierSolver)}
        options={SOLVER_OPTIONS}
      />
      <label className="param-check">
        <input
          type="checkbox"
          checked={p.allowCash}
          onChange={(e) => p.onAllowCashChange(e.target.checked)}
        />
        <span>允许现金分配</span>
      </label>
    </>
  );
}

function FrontierParamsFields({ p }: { p: FrontierParamsProps }) {
  return (
    <div className="params-section">
      <div className="params-title">参数设置</div>
      <div className="params-row">
        <FrontierDateRange p={p} />
        <FrontierAdvancedFields p={p} />
      </div>
    </div>
  );
}

function FrontierTickerList({ p }: { p: FrontierParamsProps }) {
  return (
    <div className="portfolios-section">
      <div className="portfolios-header">
        <span className="portfolios-title">标的列表</span>
        <button className="portfolios-add-btn" onClick={p.onAddTicker}>
          <Plus className="w-4 h-4" />
          添加标的
        </button>
      </div>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {p.tickers.map((t, i) => (
            <div key={t || i} className="ticker-row">
              <input
                type="text"
                value={t}
                onChange={(e) => p.onUpdateTicker(i, e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              {p.tickers.length > 2 && (
                <button onClick={() => p.onRemoveTicker(i)} className="row-remove-btn" title="删除">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FrontierParams(props: FrontierParamsProps) {
  return (
    <div className="bt-main-card card">
      <FrontierParamsFields p={props} />
      <div className="bt-action-row">
        <LoadingButton isLoading={props.isLoading} onClick={props.onRun} loadingText="计算中...">
          <Play className="w-4 h-4" />
          计算有效前沿
        </LoadingButton>
      </div>
      <FrontierTickerList p={props} />
    </div>
  );
}

export {
  FrontierParams,
  SOLVE_SPEED_OPTIONS,
  REBALANCE_FREQ_OPTIONS,
  RETURN_OBJ_OPTIONS,
  SOLVER_OPTIONS,
};
export type { SolveSpeed, FrontierSolver, ReturnObjective, FrontierParamsProps };
