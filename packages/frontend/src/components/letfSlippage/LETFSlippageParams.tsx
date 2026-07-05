import { Play } from 'lucide-react';
import LoadingButton from '../LoadingButton.js';
import { ParamsPanel, ParamsSection } from '../ParamsPanel.js';
import type { LETFParamsProps } from './types.js';

function LetfEtfSelection({
  letfTicker,
  benchmarkTicker,
  leverage,
  onLetfTickerChange,
  onBenchmarkTickerChange,
  onLeverageChange,
}: Pick<
  LETFParamsProps,
  | 'letfTicker'
  | 'benchmarkTicker'
  | 'leverage'
  | 'onLetfTickerChange'
  | 'onBenchmarkTickerChange'
  | 'onLeverageChange'
>) {
  return (
    <ParamsSection
      title="ETF 选择"
      info="杠杆 ETF（如 TQQQ/UPRO）与对应基准指数（如 QQQ/SPY），杠杆倍数需与 ETF 实际杠杆一致"
    >
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">杠杆 ETF</span>
        <input
          type="text"
          className="param-input"
          value={letfTicker}
          onChange={(e) => onLetfTickerChange(e.target.value)}
          placeholder="如 TQQQ"
        />
      </div>
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">基准指数</span>
        <input
          type="text"
          className="param-input"
          value={benchmarkTicker}
          onChange={(e) => onBenchmarkTickerChange(e.target.value)}
          placeholder="如 QQQ"
        />
      </div>
      <div className="param-field">
        <span className="param-label">杠杆倍数</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {[2, 3].map((lev) => (
            <button
              key={lev}
              type="button"
              onClick={() => onLeverageChange(lev)}
              className="param-input"
              style={{
                flex: 1,
                cursor: 'pointer',
                fontWeight: 600,
                textAlign: 'center',
                ...(leverage === lev
                  ? { borderColor: 'var(--brand)', backgroundColor: 'var(--brand)', color: '#fff' }
                  : {}),
              }}
            >
              {lev}x
            </button>
          ))}
        </div>
      </div>
    </ParamsSection>
  );
}

export function LETFParamsPanel({
  letfTicker,
  benchmarkTicker,
  leverage,
  startDate,
  endDate,
  isLoading,
  onLetfTickerChange,
  onBenchmarkTickerChange,
  onLeverageChange,
  onStartDateChange,
  onEndDateChange,
  onRun,
}: LETFParamsProps) {
  return (
    <ParamsPanel>
      <LetfEtfSelection
        letfTicker={letfTicker}
        benchmarkTicker={benchmarkTicker}
        leverage={leverage}
        onLetfTickerChange={onLetfTickerChange}
        onBenchmarkTickerChange={onBenchmarkTickerChange}
        onLeverageChange={onLeverageChange}
      />

      <ParamsSection title="时间范围">
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
