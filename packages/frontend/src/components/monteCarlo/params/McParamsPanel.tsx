/** @file MonteCarlo params panel sub-components */
import { Play, Loader2 } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../../ParamsPanel';
import { PortfolioEditor } from '../PortfolioEditor.js';
import type { McState } from '../useMonteCarloState.js';
import { GOAL_OPTIONS } from '../types.js';
import type { PortfolioMode } from '../types.js';

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

function SimBasicFields({ s }: { s: McState }) {
  return (
    <>
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
    </>
  );
}

function SimAdvancedFields({ s }: { s: McState }) {
  return (
    <>
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
    </>
  );
}

function SimDateFields({ s }: { s: McState }) {
  return (
    <>
      <SimBasicFields s={s} />
      <SimAdvancedFields s={s} />
    </>
  );
}

function SimParamsSection({ s }: { s: McState }) {
  return (
    <ParamsSection title="模拟参数" info="区块自举法参数：从历史数据中随机抽取区块拼接为模拟路径">
      <div className="params-row">
        <SimDateFields s={s} />
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

export function McParamsPanel({ s }: { s: McState }) {
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
