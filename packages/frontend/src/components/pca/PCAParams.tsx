import { Play, Plus, X } from 'lucide-react';
import type { PCAParamsProps } from './types.js';
import { ParamsPanel, ParamsSection } from '../ParamsPanel.js';
import LoadingButton from '../LoadingButton.js';

function PcaAssetSelection({
  tickers,
  onAddTicker,
  onRemoveTicker,
  onUpdateTicker,
}: Pick<PCAParamsProps, 'tickers' | 'onAddTicker' | 'onRemoveTicker' | 'onUpdateTicker'>) {
  return (
    <ParamsSection
      title="资产选择"
      info="添加 2 个或以上标的代码，PCA 将基于它们的日收益率进行分析"
    >
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {tickers.map((t, idx) => (
            <div key={idx} className="ticker-row">
              <input
                type="text"
                value={t}
                onChange={(e) => onUpdateTicker(idx, e.target.value)}
                placeholder="输入代码，如 SPY"
                className="ticker-input"
              />
              {tickers.length > 1 && (
                <button onClick={() => onRemoveTicker(idx)} className="row-remove-btn" title="删除">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={onAddTicker} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" />
        添加标的
      </button>
    </ParamsSection>
  );
}

export default function PCAParamsPanel({
  tickers,
  startDate,
  endDate,
  numComponents,
  isLoading,
  onAddTicker,
  onRemoveTicker,
  onUpdateTicker,
  onStartDateChange,
  onEndDateChange,
  onNumComponentsChange,
  onRun,
}: PCAParamsProps) {
  return (
    <ParamsPanel>
      <PcaAssetSelection
        tickers={tickers}
        onAddTicker={onAddTicker}
        onRemoveTicker={onRemoveTicker}
        onUpdateTicker={onUpdateTicker}
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

      <ParamsSection title="分析参数" defaultOpen={false}>
        <div className="param-field">
          <span className="param-label">主成分数量</span>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              min={1}
              className="param-input param-input-with-suffix"
              value={numComponents}
              onChange={(e) =>
                onNumComponentsChange(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="自动"
            />
            <span className="param-input-suffix">个</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          留空则自动保留全部主成分（等于资产数量）
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
