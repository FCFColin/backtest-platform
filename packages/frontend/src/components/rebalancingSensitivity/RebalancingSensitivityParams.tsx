import type { ReactNode } from 'react';
import { Play, Loader2, Plus, X } from 'lucide-react';
import type { RebalancingState } from './types.js';
import { REBALANCE_OPTIONS } from './types.js';

function FreqSelector({ s }: { s: RebalancingState }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        调仓频率（可多选）
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {REBALANCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${s.selectedFreqs.includes(opt.value) ? opt.color : 'var(--border-soft)'}`,
              backgroundColor: s.selectedFreqs.includes(opt.value)
                ? `${opt.color}18`
                : 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: s.selectedFreqs.includes(opt.value) ? opt.color : 'var(--text-muted)',
              transition: 'all .12s',
            }}
          >
            <input
              type="checkbox"
              checked={s.selectedFreqs.includes(opt.value)}
              onChange={() => s.toggleFreq(opt.value)}
              style={{ display: 'none' }}
            />
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: opt.color }}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function RebalancingSensitivityParams({ s }: { s: RebalancingState }): ReactNode {
  return (
    <div className="bt-main-card card">
      <div className="params-section">
        <div className="params-title">参数设置</div>
        <div className="params-row">
          <div className="param-field">
            <label className="param-label">开始日期</label>
            <input
              type="date"
              className="param-input"
              value={s.startDate}
              onChange={(e) => s.setStartDate(e.target.value)}
            />
          </div>
          <div className="param-field">
            <label className="param-label">结束日期</label>
            <input
              type="date"
              className="param-input"
              value={s.endDate}
              onChange={(e) => s.setEndDate(e.target.value)}
            />
          </div>
          <div className="param-field param-field-start-val">
            <label className="param-label">初始资金</label>
            <div className="param-input-prefix-wrap">
              <span className="param-input-prefix">{s.baseCurrency === 'usd' ? '$' : '¥'}</span>
              <input
                type="number"
                className="param-input param-input-with-prefix"
                value={s.startingValue}
                onChange={(e) => s.setStartingValue(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="param-field" style={{ width: 90 }}>
            <label className="param-label">货币</label>
            <select
              className="param-input"
              value={s.baseCurrency}
              onChange={(e) => s.setBaseCurrency(e.target.value as 'usd' | 'cny')}
            >
              <option value="usd">USD ($)</option>
              <option value="cny">CNY (¥)</option>
            </select>
          </div>
          <label className="param-toggle">
            <span>通胀调整</span>
            <div
              className={`toggle-switch ${s.adjustForInflation ? 'active' : ''}`}
              onClick={() => s.setAdjustForInflation(!s.adjustForInflation)}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <FreqSelector s={s} />
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div className="param-field" style={{ width: 120 }}>
            <label className="param-label">绝对偏离带</label>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                className="param-input param-input-with-suffix"
                value={s.absoluteBand}
                onChange={(e) =>
                  s.setAbsoluteBand(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="留空关闭"
                min={0}
                max={50}
              />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
          <div className="param-field" style={{ width: 120 }}>
            <label className="param-label">相对偏离带</label>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                className="param-input param-input-with-suffix"
                value={s.relativeBand}
                onChange={(e) =>
                  s.setRelativeBand(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="留空关闭"
                min={0}
                max={100}
              />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
        </div>
      </div>
      <div className="portfolios-section">
        <div className="portfolios-header">
          <span className="portfolios-title">投资组合</span>
        </div>
        <div className="portfolios-cards">
          <div className="portfolio-card">
            {s.assets.map((a, i) => (
              <div key={i} className="ticker-row">
                <input
                  type="text"
                  value={a.ticker}
                  onChange={(e) => s.updateAsset(i, 'ticker', e.target.value)}
                  placeholder="输入代码，如 VTI"
                  className="ticker-input"
                />
                <div className="weight-cell">
                  <input
                    type="number"
                    value={a.weight || ''}
                    onChange={(e) => s.updateAsset(i, 'weight', Number(e.target.value))}
                    min={0}
                    max={100}
                    className="weight-input"
                    placeholder="%"
                  />
                  <span className="weight-suffix">%</span>
                </div>
                <button onClick={() => s.removeAsset(i)} className="row-remove-btn" title="删除">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="portfolio-card-toolbar">
              <button className="toolbar-btn" onClick={s.addAsset}>
                <Plus className="w-4 h-4" />
                添加标的
              </button>
            </div>
            <div
              className={`portfolio-total ${Math.abs(s.totalWeight - 100) <= 0.01 ? 'complete' : 'incomplete'}`}
            >
              <span>合计</span>
              <span className="total-value">{s.totalWeight}%</span>
            </div>
          </div>
        </div>
      </div>
      <div className="bt-action-row">
        <button
          onClick={() => void s.runSensitivity()}
          disabled={s.isLoading}
          className="main-action-btn"
          style={{ width: '100%' }}
        >
          {s.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {s.isLoading ? '分析中...' : '开始分析'}
        </button>
      </div>
    </div>
  );
}
