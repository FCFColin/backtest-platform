import { Plus, X } from 'lucide-react';
import type {
  FactorParamsProps,
  PortfolioEditorProps,
  FactorSelectorProps,
  ReturnFrequency,
} from './types.js';
import { FACTOR_OPTIONS, RF_SOURCE_OPTIONS } from './types.js';

function FactorSelector({ selectedFactors, onToggle }: FactorSelectorProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FACTOR_OPTIONS.map((opt) => (
        <label
          key={opt.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 'var(--radius-control)',
            border: `1px solid ${selectedFactors.includes(opt.key) ? 'var(--brand)' : 'var(--border-soft)'}`,
            backgroundColor: selectedFactors.includes(opt.key)
              ? 'var(--brand-soft)'
              : 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: selectedFactors.includes(opt.key) ? 'var(--brand)' : 'var(--text-muted)',
            transition: 'all .12s',
          }}
        >
          <input
            type="checkbox"
            checked={selectedFactors.includes(opt.key)}
            onChange={() => onToggle(opt.key)}
            style={{ display: 'none' }}
          />
          {opt.label}
          <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>({opt.desc})</span>
        </label>
      ))}
    </div>
  );
}

function PortfolioEditor({ assets, totalWeight, onAdd, onRemove, onUpdate }: PortfolioEditorProps) {
  return (
    <div className="portfolios-section">
      <div className="portfolios-header">
        <span className="portfolios-title">投资组合</span>
      </div>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {assets.map((a, i) => (
            <div key={i} className="ticker-row">
              <input
                type="text"
                value={a.ticker}
                onChange={(e) => onUpdate(i, 'ticker', e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              <div className="weight-cell">
                <input
                  type="number"
                  value={a.weight || ''}
                  onChange={(e) => onUpdate(i, 'weight', Number(e.target.value))}
                  min={0}
                  max={100}
                  className="weight-input"
                  placeholder="%"
                />
                <span className="weight-suffix">%</span>
              </div>
              <button onClick={() => onRemove(i)} className="row-remove-btn" title="删除">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="portfolio-card-toolbar">
            <button className="toolbar-btn" onClick={onAdd}>
              <Plus className="w-4 h-4" />
              添加标的
            </button>
          </div>
          <div
            className={`portfolio-total ${Math.abs(totalWeight - 100) <= 0.01 ? 'complete' : 'incomplete'}`}
          >
            <span>合计</span>
            <span className="total-value">{totalWeight}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FactorParamsSection({
  startDate,
  endDate,
  returnFrequency,
  rfSource,
  selectedFactors,
  onStartDateChange,
  onEndDateChange,
  onReturnFrequencyChange,
  onRfSourceChange,
  onToggleFactor,
}: FactorParamsProps) {
  return (
    <div className="params-section">
      <div className="params-title">参数设置</div>
      <div className="params-row">
        <div className="param-field">
          <label className="param-label">开始日期</label>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>
        <div className="param-field">
          <label className="param-label">结束日期</label>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </div>
        <div className="param-field" style={{ width: 110 }}>
          <label className="param-label">收益频率</label>
          <select
            className="param-input"
            value={returnFrequency}
            onChange={(e) => onReturnFrequencyChange(e.target.value as ReturnFrequency)}
          >
            <option value="monthly">月度</option>
            <option value="daily">日度</option>
          </select>
        </div>
        <div className="param-field" style={{ width: 150 }}>
          <label className="param-label">无风险利率</label>
          <select
            className="param-input"
            value={rfSource}
            onChange={(e) => onRfSourceChange(e.target.value)}
          >
            {RF_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          因子选择（多选）
        </div>
        <FactorSelector selectedFactors={selectedFactors} onToggle={onToggleFactor} />
      </div>
    </div>
  );
}

export default FactorParamsSection;
export { FactorParamsSection, PortfolioEditor, FactorSelector };
