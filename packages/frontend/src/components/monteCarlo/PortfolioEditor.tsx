/** @file MonteCarlo portfolio editor component */
import { Plus, X } from 'lucide-react';
import type { PortfolioState } from './types.js';

interface PortfolioEditorProps {
  portfolio: PortfolioState;
  onUpdate: (patch: Partial<PortfolioState>) => void;
  onAddAsset: () => void;
  onRemoveAsset: (aIdx: number) => void;
  onUpdateAsset: (aIdx: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
  isComplete: boolean;
}

export function PortfolioEditor({
  portfolio: p,
  onUpdate,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
  totalWeight,
  isComplete,
}: PortfolioEditorProps) {
  return (
    <div
      className="portfolio-card"
      style={{ width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' }}
    >
      <div className="portfolio-card-header">
        <div className="portfolio-card-name-row">
          <input
            type="text"
            className="portfolio-name-input"
            style={{ flex: 1, width: 'auto' }}
            value={p.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
          <select
            className="portfolio-rebalance-select"
            value={p.rebalanceFrequency}
            onChange={(e) => onUpdate({ rebalanceFrequency: e.target.value })}
          >
            <option value="yearly">每年</option>
            <option value="quarterly">每季度</option>
            <option value="monthly">每月</option>
            <option value="none">不调仓</option>
          </select>
        </div>
      </div>
      {p.assets.map((a, i) => (
        <div key={i} className="ticker-row">
          <input
            type="text"
            value={a.ticker}
            onChange={(e) => onUpdateAsset(i, 'ticker', e.target.value)}
            placeholder="输入代码，如 VTI"
            className="ticker-input"
          />
          <div className="weight-cell">
            <input
              type="number"
              value={a.weight || ''}
              onChange={(e) => onUpdateAsset(i, 'weight', Number(e.target.value))}
              min={0}
              max={100}
              className="weight-input"
              placeholder="%"
            />
            <span className="weight-suffix">%</span>
          </div>
          <button onClick={() => onRemoveAsset(i)} className="row-remove-btn" title="删除">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="portfolio-card-toolbar">
        <button className="toolbar-btn" onClick={onAddAsset}>
          <Plus className="w-4 h-4" /> 添加标的
        </button>
      </div>
      <div className={`portfolio-total ${isComplete ? 'complete' : 'incomplete'}`}>
        <span>合计</span>
        <span className="total-value">{totalWeight}%</span>
      </div>
    </div>
  );
}
