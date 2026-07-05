import { Plus, X, Play, Loader2 } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../ParamsPanel';
import type { OptimizerState, Objective } from './types.js';
import { FREQ_OPTIONS } from './utils.js';

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

export function BacktestOptimizerParams({ state }: { state: OptimizerState }) {
  return (
    <ParamsPanel>
      <PortfolioConfigSection s={state} />
      <ParameterSpaceSection s={state} />
      <ObjectiveSection s={state} />
      <BacktestRangeSection s={state} />
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button
          onClick={() => void state.runOptimize()}
          disabled={state.isLoading}
          className="main-action-btn"
          style={{ width: '100%' }}
        >
          {state.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {state.isLoading ? '优化中...' : '开始优化'}
        </button>
      </div>
    </ParamsPanel>
  );
}
