import { Plus, X, Play } from 'lucide-react';
import type { MultiSignalParamsProps, SignalItem } from './types.js';
import { INDICATORS, AGGREGATION_METHODS } from './types.js';
import LoadingButton from '../LoadingButton';
import { ParamsPanel, ParamsSection } from '../ParamsPanel';

function SignalRow({
  signal: s,
  idx,
  weight,
  showWeight,
  canRemove,
  onUpdateSignal,
  onRemoveSignal,
  onUpdateWeight,
}: {
  signal: SignalItem;
  idx: number;
  weight: number;
  showWeight: boolean;
  canRemove: boolean;
  onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void;
  onRemoveSignal: (id: number) => void;
  onUpdateWeight: (idx: number, val: number) => void;
}) {
  const inputStyle = { width: 64, fontSize: 12, padding: '4px 8px' };
  return (
    <div className="ticker-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      <select
        className="param-input"
        style={{ width: 110, fontSize: 12, padding: '4px 8px' }}
        value={s.indicator}
        onChange={(e) => onUpdateSignal(s.id, { indicator: e.target.value })}
      >
        {INDICATORS.map((ind) => (
          <option key={ind} value={ind}>
            {ind}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="param-input"
        style={inputStyle}
        value={s.period}
        min={2}
        title="周期"
        onChange={(e) => onUpdateSignal(s.id, { period: Number(e.target.value) })}
      />
      <input
        type="number"
        className="param-input"
        style={inputStyle}
        value={s.threshold}
        title="阈值"
        onChange={(e) => onUpdateSignal(s.id, { threshold: Number(e.target.value) })}
      />
      {showWeight && (
        <input
          type="number"
          step="0.1"
          className="param-input"
          style={{ ...inputStyle, width: 60 }}
          value={weight}
          title="权重"
          onChange={(e) => onUpdateWeight(idx, Number(e.target.value))}
        />
      )}
      {canRemove && (
        <button onClick={() => onRemoveSignal(s.id)} className="row-remove-btn" title="删除">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function SignalListSection({
  signals,
  weights,
  aggregationMethod,
  onAddSignal,
  onRemoveSignal,
  onUpdateSignal,
  onUpdateWeight,
}: Pick<
  MultiSignalParamsProps,
  | 'signals'
  | 'weights'
  | 'aggregationMethod'
  | 'onAddSignal'
  | 'onRemoveSignal'
  | 'onUpdateSignal'
  | 'onUpdateWeight'
>) {
  return (
    <ParamsSection title="信号列表" info="添加多个技术指标信号，可单独删除">
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {signals.map((s, idx) => (
            <SignalRow
              key={s.id}
              signal={s}
              idx={idx}
              weight={weights[idx] ?? 0}
              showWeight={aggregationMethod === 'weighted'}
              canRemove={signals.length > 1}
              onUpdateSignal={onUpdateSignal}
              onRemoveSignal={onRemoveSignal}
              onUpdateWeight={onUpdateWeight}
            />
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={onAddSignal} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" /> 添加信号
      </button>
    </ParamsSection>
  );
}

function AggregationSection({
  aggregationMethod,
  onAggregationMethodChange,
}: Pick<MultiSignalParamsProps, 'aggregationMethod' | 'onAggregationMethodChange'>) {
  const descMap: Record<string, string> = {
    weighted: '加权：按权重对信号方向加权求和，正值买入、负值卖出。在信号列表中设置各信号权重。',
    voting: '投票：多数信号同向时触发（买入数 > 卖出数 则买入，反之卖出）。',
    rank: '排名：取历史胜率最高的触发信号方向。',
  };
  return (
    <ParamsSection title="聚合配置">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">聚合方式</span>
        <select
          className="param-input"
          value={aggregationMethod}
          onChange={(e) =>
            onAggregationMethodChange(e.target.value as 'weighted' | 'voting' | 'rank')
          }
        >
          {AGGREGATION_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {descMap[aggregationMethod]}
      </div>
    </ParamsSection>
  );
}

function BacktestParamsSection({
  ticker,
  startDate,
  endDate,
  onTickerChange,
  onStartDateChange,
  onEndDateChange,
}: Pick<
  MultiSignalParamsProps,
  'ticker' | 'startDate' | 'endDate' | 'onTickerChange' | 'onStartDateChange' | 'onEndDateChange'
>) {
  return (
    <ParamsSection title="回测参数">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">标的代码</span>
        <input
          type="text"
          className="param-input"
          value={ticker}
          onChange={(e) => onTickerChange(e.target.value)}
          placeholder="如 SPY"
        />
      </div>
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">开始日期</span>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>
        <div className="param-field">
          <span className="param-label">结束日期</span>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </div>
      </div>
    </ParamsSection>
  );
}

function MultiSignalParamsPanel(props: MultiSignalParamsProps) {
  return (
    <ParamsPanel>
      <SignalListSection {...props} />
      <AggregationSection {...props} />
      <BacktestParamsSection {...props} />
      <div className="bt-action-row">
        <LoadingButton isLoading={props.isLoading} onClick={props.onRun} loadingText="分析中...">
          <Play className="w-4 h-4" />
          开始分析
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}

export default MultiSignalParamsPanel;
export { SignalListSection, AggregationSection, BacktestParamsSection, SignalRow };
