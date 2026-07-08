import { Plus, X, Play } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import LoadingButton from '../../components/LoadingButton.js';
import {
  useTacticalPageState,
  INDICATOR_OPTIONS,
  OPERATOR_OPTIONS,
  REBALANCE_OPTIONS,
  AGGREGATION_OPTIONS,
  RANKING_METHOD_OPTIONS,
  createDefaultCondition,
} from './TacticalUtils.js';
import type {
  TacticalStrategy,
  TradingSignal,
  SignalCondition,
} from '@backtest/shared/types/tactical';
import type { RebalanceFrequency } from '@backtest/shared';

type TacticalPageState = ReturnType<typeof useTacticalPageState>;

function ConditionRow({
  cond,
  ci,
  onUpdate,
  onRemove,
  canRemove,
}: {
  cond: SignalCondition;
  ci: number;
  onUpdate: (ci: number, patch: Partial<SignalCondition>) => void;
  onRemove: (ci: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="ticker-row" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
      <select
        className="param-input"
        style={{ width: 130, height: 32, fontSize: 12, padding: '2px 6px' }}
        value={cond.indicator}
        onChange={(e) =>
          onUpdate(ci, { indicator: e.target.value as SignalCondition['indicator'] })
        }
      >
        {INDICATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="param-input-suffix-wrap" style={{ width: 80 }}>
        <input
          type="number"
          className="param-input param-input-with-suffix"
          style={{ height: 32, fontSize: 12, padding: '2px 30px 2px 6px' }}
          value={cond.period}
          onChange={(e) => onUpdate(ci, { period: Number(e.target.value) })}
        />
        <span className="param-input-suffix">周期</span>
      </div>
      <select
        className="param-input"
        style={{ width: 100, height: 32, fontSize: 12, padding: '2px 6px' }}
        value={cond.operator}
        onChange={(e) => onUpdate(ci, { operator: e.target.value as SignalCondition['operator'] })}
      >
        {OPERATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="param-input-prefix-wrap" style={{ width: 90 }}>
        <input
          type="number"
          step="0.01"
          className="param-input param-input-with-prefix"
          style={{ height: 32, fontSize: 12, padding: '2px 6px 2px 18px' }}
          value={cond.threshold}
          onChange={(e) => onUpdate(ci, { threshold: Number(e.target.value) })}
        />
        <span className="param-input-prefix">阈值</span>
      </div>
      {canRemove && (
        <button className="row-remove-btn" onClick={() => onRemove(ci)} title="删除条件">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function WeightRow({
  weight,
  wi,
  onUpdate,
  onRemove,
  canRemove,
}: {
  weight: { ticker: string; weight: number };
  wi: number;
  onUpdate: (wi: number, patch: Partial<{ ticker: string; weight: number }>) => void;
  onRemove: (wi: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="ticker-row" style={{ marginBottom: 4 }}>
      <input
        type="text"
        className="ticker-input"
        style={{ flex: 1, height: 32, fontSize: 12 }}
        value={weight.ticker}
        onChange={(e) => onUpdate(wi, { ticker: e.target.value.toUpperCase() })}
        placeholder="标的代码"
      />
      <div className="param-input-suffix-wrap" style={{ width: 100 }}>
        <input
          type="number"
          className="param-input param-input-with-suffix"
          style={{ height: 32, fontSize: 12, padding: '2px 30px 2px 6px' }}
          value={weight.weight}
          onChange={(e) => onUpdate(wi, { weight: Number(e.target.value) })}
        />
        <span className="param-input-suffix">%</span>
      </div>
      {canRemove && (
        <button className="row-remove-btn" onClick={() => onRemove(wi)} title="删除">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function useSignalEditorHandlers(signal: TradingSignal, onChange: (s: TradingSignal) => void) {
  const updateName = (name: string) => onChange({ ...signal, name });
  const updateCondition = (ci: number, patch: Partial<SignalCondition>) => {
    const next = signal.conditions.map((c, i) => (i === ci ? { ...c, ...patch } : c));
    onChange({ ...signal, conditions: next });
  };
  const addCondition = () =>
    onChange({ ...signal, conditions: [...signal.conditions, createDefaultCondition()] });
  const removeCondition = (ci: number) => {
    if (signal.conditions.length <= 1) return;
    onChange({ ...signal, conditions: signal.conditions.filter((_, i) => i !== ci) });
  };
  const updateWeight = (wi: number, patch: Partial<{ ticker: string; weight: number }>) => {
    const next = signal.targetWeights.map((w, i) => (i === wi ? { ...w, ...patch } : w));
    onChange({ ...signal, targetWeights: next });
  };
  const addWeight = () =>
    onChange({ ...signal, targetWeights: [...signal.targetWeights, { ticker: '', weight: 0 }] });
  const removeWeight = (wi: number) => {
    if (signal.targetWeights.length <= 1) return;
    onChange({ ...signal, targetWeights: signal.targetWeights.filter((_, i) => i !== wi) });
  };
  return {
    updateName,
    updateCondition,
    addCondition,
    removeCondition,
    updateWeight,
    addWeight,
    removeWeight,
  };
}

const signalEditorStyle = {
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  padding: 12,
  marginBottom: 12,
  background: 'var(--bg-subtle)',
};

function SignalEditor({
  signal,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  signal: TradingSignal;
  index: number;
  onChange: (signal: TradingSignal) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const h = useSignalEditorHandlers(signal, onChange);
  return (
    <div style={signalEditorStyle}>
      <div className="ticker-row" style={{ marginBottom: 8 }}>
        <input
          type="text"
          className="ticker-input"
          style={{ flex: 1, textTransform: 'none' }}
          value={signal.name}
          onChange={(e) => h.updateName(e.target.value)}
          placeholder={`信号 ${index + 1} 名称`}
        />
        {canRemove && (
          <button className="row-remove-btn" onClick={onRemove} title="删除信号">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
        触发条件（全部满足）
      </div>
      {signal.conditions.map((cond, ci) => (
        <ConditionRow
          key={ci}
          cond={cond}
          ci={ci}
          onUpdate={h.updateCondition}
          onRemove={h.removeCondition}
          canRemove={signal.conditions.length > 1}
        />
      ))}
      <button className="portfolios-add-btn" onClick={h.addCondition} style={{ marginTop: 4 }}>
        <Plus className="w-3 h-3" />
        添加条件
      </button>
      <div
        style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 4px', fontWeight: 600 }}
      >
        目标权重（激活时切换）
      </div>
      {signal.targetWeights.map((w, wi) => (
        <WeightRow
          key={wi}
          weight={w}
          wi={wi}
          onUpdate={h.updateWeight}
          onRemove={h.removeWeight}
          canRemove={signal.targetWeights.length > 1}
        />
      ))}
      <button className="portfolios-add-btn" onClick={h.addWeight} style={{ marginTop: 4 }}>
        <Plus className="w-3 h-3" />
        添加标的
      </button>
    </div>
  );
}

function SignalBuilderSection({ state }: { state: TacticalPageState }) {
  const { strategy, updateSignal, addSignal, removeSignal } = state;
  return (
    <ParamsSection
      title="信号构建器"
      info="基于技术指标构建交易信号。每个信号包含若干触发条件（全部满足时激活）及目标权重（激活时切换的配置）"
    >
      {strategy.signals.map((sig, idx) => (
        <SignalEditor
          key={sig.id}
          signal={sig}
          index={idx}
          onChange={(s) => updateSignal(idx, s)}
          onRemove={() => removeSignal(idx)}
          canRemove={strategy.signals.length > 1}
        />
      ))}
      <button
        className="portfolios-add-btn"
        onClick={addSignal}
        style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
      >
        <Plus className="w-4 h-4" />
        添加信号
      </button>
    </ParamsSection>
  );
}

function RankingConfigRow({
  strategy,
  setStrategy,
}: {
  strategy: TacticalStrategy;
  setStrategy: (s: TacticalStrategy) => void;
}) {
  return (
    <div className="params-row">
      <div className="param-field param-field-rolling">
        <span className="param-label">排名方式</span>
        <select
          className="param-input"
          value={strategy.rankingConfig?.method ?? 'fixed_share'}
          onChange={(e) =>
            setStrategy({
              ...strategy,
              rankingConfig: {
                method: e.target.value as 'fixed_share' | 'risk_parity',
                topN: strategy.rankingConfig?.topN ?? 3,
              },
            })
          }
        >
          {RANKING_METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="param-field param-field-rolling">
        <span className="param-label">TopN</span>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            min={1}
            className="param-input param-input-with-suffix"
            value={strategy.rankingConfig?.topN ?? 3}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                rankingConfig: {
                  method: strategy.rankingConfig?.method ?? 'fixed_share',
                  topN: Math.max(1, Number(e.target.value)),
                },
              })
            }
          />
          <span className="param-input-suffix">个</span>
        </div>
      </div>
    </div>
  );
}

function AggregationSection({ state }: { state: TacticalPageState }) {
  const { strategy, setStrategy } = state;
  return (
    <ParamsSection title="聚合配置" info="多信号同时激活时的权重合成方式">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">聚合方式</span>
        <select
          className="param-input"
          value={strategy.aggregationMethod}
          onChange={(e) =>
            setStrategy({
              ...strategy,
              aggregationMethod: e.target.value as TacticalStrategy['aggregationMethod'],
            })
          }
        >
          {AGGREGATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {strategy.aggregationMethod === 'rank' && (
        <RankingConfigRow strategy={strategy} setStrategy={setStrategy} />
      )}
    </ParamsSection>
  );
}

function BacktestParamsSection({ state }: { state: TacticalPageState }) {
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    rebalanceFrequency,
    setRebalanceFrequency,
  } = state;
  return (
    <ParamsSection title="回测参数">
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">开始日期</span>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="param-field">
          <span className="param-label">结束日期</span>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="params-row" style={{ marginTop: 8 }}>
        <div className="param-field param-field-start-val">
          <span className="param-label">初始资金</span>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={startingValue}
              onChange={(e) => setStartingValue(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="param-field param-field-rolling">
          <span className="param-label">再平衡频率</span>
          <select
            className="param-input"
            value={rebalanceFrequency}
            onChange={(e) => setRebalanceFrequency(e.target.value as RebalanceFrequency)}
          >
            {REBALANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </ParamsSection>
  );
}

function TacticalParamsPanel({ state }: { state: TacticalPageState }) {
  const { isLoading, handleRunBacktest } = state;
  return (
    <ParamsPanel>
      <SignalBuilderSection state={state} />
      <AggregationSection state={state} />
      <BacktestParamsSection state={state} />
      <div className="bt-action-row">
        <LoadingButton
          isLoading={isLoading}
          onClick={handleRunBacktest}
          loadingText="回测中..."
          style={{ width: '100%' }}
        >
          <Play className="w-4 h-4" />
          运行战术回测
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}

export { TacticalParamsPanel };
export type { TacticalPageState };
