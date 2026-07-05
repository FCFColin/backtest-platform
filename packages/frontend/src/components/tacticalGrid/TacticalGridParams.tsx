import { Play } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../ParamsPanel';
import LoadingButton from '../LoadingButton';
import type { TacticalGridState } from '../../hooks/useTacticalGridState.js';
import type { ParamRange } from './types.js';
import { INDICATOR_OPTIONS, REBALANCE_OPTIONS, OBJECTIVE_OPTIONS } from './types.js';

function ParamRangeRow({
  range,
  onChange,
  inputMin,
}: {
  range: ParamRange;
  onChange: (v: ParamRange) => void;
  inputMin?: number;
}) {
  return (
    <div className="params-row">
      <div className="param-field">
        <span className="param-label">最小</span>
        <input
          type="number"
          className="param-input"
          value={range.min}
          min={inputMin}
          onChange={(e) => onChange({ ...range, min: Number(e.target.value) })}
        />
      </div>
      <div className="param-field">
        <span className="param-label">最大</span>
        <input
          type="number"
          className="param-input"
          value={range.max}
          min={inputMin}
          onChange={(e) => onChange({ ...range, max: Number(e.target.value) })}
        />
      </div>
      <div className="param-field">
        <span className="param-label">步长</span>
        <input
          type="number"
          className="param-input"
          value={range.step}
          min={0.1}
          step={0.5}
          onChange={(e) => onChange({ ...range, step: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

function SignalGridSection({ state }: { state: TacticalGridState }) {
  const { indicator, setIndicator, param1, setParam1, param2, setParam2, paramLabels } = state;
  return (
    <ParamsSection
      title="信号参数网格"
      info="选择技术指标与参数范围，系统将遍历所有参数组合（笛卡尔积）寻找最优信号参数"
    >
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">技术指标</span>
        <select
          className="param-input"
          value={indicator}
          onChange={(e) => setIndicator(e.target.value as typeof indicator)}
        >
          {INDICATOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
        {paramLabels.p1}
      </div>
      <ParamRangeRow range={param1} onChange={setParam1} inputMin={1} />

      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 4,
          marginTop: 8,
          fontWeight: 600,
        }}
      >
        {paramLabels.p2}
      </div>
      <ParamRangeRow range={param2} onChange={setParam2} />

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
        {indicator === 'rsi'
          ? 'RSI 低于超卖阈值时入场，高于 100-阈值 时离场'
          : '价格突破均线±阈值% 时入场，跌破均线∓阈值% 时离场'}
      </div>
    </ParamsSection>
  );
}

function BacktestParamsSection({ state }: { state: TacticalGridState }) {
  const {
    ticker,
    setTicker,
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
    <ParamsSection title="回测参数" info="设置交易标的、时间范围、初始资金与再平衡频率">
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">标的代码</span>
        <input
          type="text"
          className="param-input"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="如 SPY"
        />
      </div>
      <div className="params-row" style={{ marginBottom: 8 }}>
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
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">初始资金</span>
          <input
            type="number"
            className="param-input"
            value={startingValue}
            min={100}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </div>
        <div className="param-field">
          <span className="param-label">再平衡频率</span>
          <select
            className="param-input"
            value={rebalanceFrequency}
            onChange={(e) => setRebalanceFrequency(e.target.value as typeof rebalanceFrequency)}
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

export default function GridParamsPanel({ state }: { state: TacticalGridState }) {
  const { objective, setObjective, isLoading, runSearch } = state;
  return (
    <ParamsPanel>
      <SignalGridSection state={state} />
      <BacktestParamsSection state={state} />
      <ParamsSection title="优化目标" info="选择用于排序参数组合的优化目标">
        <div className="param-field">
          <span className="param-label">目标</span>
          <select
            className="param-input"
            value={objective}
            onChange={(e) => setObjective(e.target.value as typeof objective)}
          >
            {OBJECTIVE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </ParamsSection>
      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={runSearch} loadingText="搜索中...">
          <Play className="w-4 h-4" />
          开始网格搜索
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}
