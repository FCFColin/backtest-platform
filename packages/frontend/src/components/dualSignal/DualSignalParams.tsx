import { Play } from 'lucide-react';
import { INDICATORS, COMBINATION_METHODS, type SignalCfg, type DualSignalParamsProps } from './types.js';
import { ParamsPanel, ParamsSection } from '../ParamsPanel.js';
import LoadingButton from '../LoadingButton.js';

function SignalCfgFields({ cfg, onChange }: { cfg: SignalCfg; onChange: (cfg: SignalCfg) => void }) {
  return (
    <>
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">技术指标</span>
        <select
          className="param-input"
          value={cfg.indicator}
          onChange={(e) => onChange({ ...cfg, indicator: e.target.value })}
        >
          {INDICATORS.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">周期</span>
          <input
            type="number"
            className="param-input"
            value={cfg.period}
            min={2}
            onChange={(e) => onChange({ ...cfg, period: Number(e.target.value) })}
          />
        </div>
        <div className="param-field">
          <span className="param-label">阈值</span>
          <input
            type="number"
            className="param-input"
            value={cfg.threshold}
            onChange={(e) => onChange({ ...cfg, threshold: Number(e.target.value) })}
          />
        </div>
      </div>
    </>
  );
}

export function DualSignalParamsPanel({
  cfg1,
  cfg2,
  combinationMethod,
  ticker,
  startDate,
  endDate,
  isLoading,
  onCfg1Change,
  onCfg2Change,
  onCombinationMethodChange,
  onTickerChange,
  onStartDateChange,
  onEndDateChange,
  onRun,
}: DualSignalParamsProps) {
  return (
    <ParamsPanel>
      <ParamsSection title="信号 1 配置">
        <SignalCfgFields cfg={cfg1} onChange={onCfg1Change} />
      </ParamsSection>
      <ParamsSection title="信号 2 配置">
        <SignalCfgFields cfg={cfg2} onChange={onCfg2Change} />
      </ParamsSection>
      <ParamsSection title="组合方式">
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">组合逻辑</span>
          <select
            className="param-input"
            value={combinationMethod}
            onChange={(e) => onCombinationMethodChange(e.target.value as 'and' | 'or' | 'xor')}
          >
            {COMBINATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
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
      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={onRun} loadingText="分析中...">
          <Play className="w-4 h-4" />
          开始分析
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}
