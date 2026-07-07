import { Plus, X } from 'lucide-react';
import type { DcaFrequency } from './types.js';

interface ParamsSectionProps {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  baseCurrency: 'usd' | 'cny';
  setBaseCurrency: (v: 'usd' | 'cny') => void;
  adjustForInflation: boolean;
  setAdjustForInflation: (v: boolean) => void;
  dcaFrequency: DcaFrequency;
  setDcaFrequency: (v: DcaFrequency) => void;
  dcaPeriods: number;
  setDcaPeriods: (v: number) => void;
  investTbill: boolean;
  setInvestTbill: (v: boolean) => void;
}

function DcaSubParams({
  dcaFrequency,
  setDcaFrequency,
  dcaPeriods,
  setDcaPeriods,
  startingValue,
  baseCurrency,
  investTbill,
  setInvestTbill,
}: {
  dcaFrequency: DcaFrequency;
  setDcaFrequency: (v: DcaFrequency) => void;
  dcaPeriods: number;
  setDcaPeriods: (v: number) => void;
  startingValue: number;
  baseCurrency: 'usd' | 'cny';
  investTbill: boolean;
  setInvestTbill: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div className="param-field" style={{ width: 120 }}>
        <label className="param-label">DCA节奏</label>
        <select
          className="param-input"
          value={dcaFrequency}
          onChange={(e) => setDcaFrequency(e.target.value as DcaFrequency)}
        >
          <option value="monthly">每月</option>
          <option value="quarterly">每季度</option>
        </select>
      </div>
      <div className="param-field" style={{ width: 100 }}>
        <label className="param-label">DCA期数</label>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={dcaPeriods}
            onChange={(e) => setDcaPeriods(Number(e.target.value) || 1)}
            min={1}
            max={360}
          />
          <span className="param-input-suffix">期</span>
        </div>
      </div>
      <div className="param-field" style={{ width: 140 }}>
        <label className="param-label">每期投入</label>
        <div className="param-input-prefix-wrap">
          <span className="param-input-prefix">{baseCurrency === 'usd' ? '$' : '¥'}</span>
          <input
            type="text"
            className="param-input param-input-with-prefix"
            value={Math.round(startingValue / dcaPeriods).toLocaleString()}
            readOnly
            style={{ opacity: 0.7 }}
          />
        </div>
      </div>
      <label className="param-check">
        <input
          type="checkbox"
          checked={investTbill}
          onChange={(e) => setInvestTbill(e.target.checked)}
        />
        <span>未投入资金放入T-Bill</span>
      </label>
    </div>
  );
}

function ParamsSection(props: ParamsSectionProps) {
  return (
    <div className="params-section">
      <div className="params-title">参数设置</div>
      <div className="params-row">
        <div className="param-field">
          <label className="param-label">开始日期</label>
          <input
            type="date"
            className="param-input"
            value={props.startDate}
            onChange={(e) => props.setStartDate(e.target.value)}
          />
        </div>
        <div className="param-field">
          <label className="param-label">结束日期</label>
          <input
            type="date"
            className="param-input"
            value={props.endDate}
            onChange={(e) => props.setEndDate(e.target.value)}
          />
        </div>
        <div className="param-field param-field-start-val">
          <label className="param-label">初始资金</label>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">{props.baseCurrency === 'usd' ? '$' : '¥'}</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={props.startingValue}
              onChange={(e) => props.setStartingValue(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="param-field" style={{ width: 90 }}>
          <label className="param-label">货币</label>
          <select
            className="param-input"
            value={props.baseCurrency}
            onChange={(e) => props.setBaseCurrency(e.target.value as 'usd' | 'cny')}
          >
            <option value="usd">USD ($)</option>
            <option value="cny">CNY (¥)</option>
          </select>
        </div>
        <label className="param-toggle">
          <span>通胀调整</span>
          <div
            className={`toggle-switch ${props.adjustForInflation ? 'active' : ''}`}
            onClick={() => props.setAdjustForInflation(!props.adjustForInflation)}
          />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          定投参数
        </div>
        <DcaSubParams
          dcaFrequency={props.dcaFrequency}
          setDcaFrequency={props.setDcaFrequency}
          dcaPeriods={props.dcaPeriods}
          setDcaPeriods={props.setDcaPeriods}
          startingValue={props.startingValue}
          baseCurrency={props.baseCurrency}
          investTbill={props.investTbill}
          setInvestTbill={props.setInvestTbill}
        />
      </div>
    </div>
  );
}

interface PortfolioEditorProps {
  assets: Array<{ ticker: string; weight: number }>;
  addAsset: () => void;
  removeAsset: (i: number) => void;
  updateAsset: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
}

function PortfolioEditor({
  assets,
  addAsset,
  removeAsset,
  updateAsset,
  totalWeight,
}: PortfolioEditorProps) {
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
                onChange={(e) => updateAsset(i, 'ticker', e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              <div className="weight-cell">
                <input
                  type="number"
                  value={a.weight || ''}
                  onChange={(e) => updateAsset(i, 'weight', Number(e.target.value))}
                  min={0}
                  max={100}
                  className="weight-input"
                  placeholder="%"
                />
                <span className="weight-suffix">%</span>
              </div>
              <button onClick={() => removeAsset(i)} className="row-remove-btn" title="删除">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="portfolio-card-toolbar">
            <button className="toolbar-btn" onClick={addAsset}>
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

export { ParamsSection, PortfolioEditor };
