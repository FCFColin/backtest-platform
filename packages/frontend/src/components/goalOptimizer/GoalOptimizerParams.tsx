import { Plus, X, Play } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../ParamsPanel';
import LoadingButton from '../LoadingButton';
import type { GoalAsset } from './types.js';

interface GoalParamsProps {
  targetAmount: number;
  initialAmount: number;
  years: number;
  assets: GoalAsset[];
  maxDrawdown: number | '';
  minSuccessRate: number | '';
  maxVolatility: number | '';
  numSimulations: number;
  totalWeight: number;
  isLoading: boolean;
  onTargetAmountChange: (v: number) => void;
  onInitialAmountChange: (v: number) => void;
  onYearsChange: (v: number) => void;
  onAddAsset: () => void;
  onRemoveAsset: (idx: number) => void;
  onUpdateAsset: (idx: number, field: 'ticker' | 'weight', val: string | number) => void;
  onMaxDrawdownChange: (v: number | '') => void;
  onMinSuccessRateChange: (v: number | '') => void;
  onMaxVolatilityChange: (v: number | '') => void;
  onNumSimulationsChange: (v: number) => void;
  onRun: () => void;
}

function GoalSettingsSection({
  targetAmount,
  initialAmount,
  years,
  onTargetAmountChange,
  onInitialAmountChange,
  onYearsChange,
}: Pick<
  GoalParamsProps,
  | 'targetAmount'
  | 'initialAmount'
  | 'years'
  | 'onTargetAmountChange'
  | 'onInitialAmountChange'
  | 'onYearsChange'
>) {
  return (
    <ParamsSection title="目标设置" info="设定您的财务目标：目标金额、初始金额与投资时间范围">
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">目标金额</span>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={targetAmount}
              onChange={(e) => onTargetAmountChange(Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
        <div className="param-field">
          <span className="param-label">初始金额</span>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={initialAmount}
              onChange={(e) => onInitialAmountChange(Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
        <div className="param-field">
          <span className="param-label">时间范围</span>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={years}
              onChange={(e) => onYearsChange(Number(e.target.value))}
              min={1}
            />
            <span className="param-input-suffix">年</span>
          </div>
        </div>
      </div>
    </ParamsSection>
  );
}

function AssetConfigSection({
  assets,
  totalWeight,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
}: Pick<
  GoalParamsProps,
  'assets' | 'totalWeight' | 'onAddAsset' | 'onRemoveAsset' | 'onUpdateAsset'
>) {
  return (
    <ParamsSection title="资产配置" info="添加标的与权重，权重合计需为 100%">
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {assets.map((a, idx) => (
            <div key={idx} className="ticker-row">
              <input
                type="text"
                value={a.ticker}
                onChange={(e) => onUpdateAsset(idx, 'ticker', e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              <div className="weight-cell">
                <input
                  type="number"
                  value={a.weight || ''}
                  onChange={(e) => onUpdateAsset(idx, 'weight', Number(e.target.value))}
                  min={0}
                  max={100}
                  className="weight-input"
                  placeholder="%"
                />
                <span className="weight-suffix">%</span>
              </div>
              {assets.length > 1 && (
                <button onClick={() => onRemoveAsset(idx)} className="row-remove-btn" title="删除">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={onAddAsset} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" />
        添加标的
      </button>
      <div
        className={`portfolio-total ${totalWeight === 100 ? 'complete' : 'incomplete'}`}
        style={{ marginTop: 8 }}
      >
        <span>合计</span>
        <span className="total-value">{totalWeight}%</span>
      </div>
    </ParamsSection>
  );
}

function ConstraintField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
}) {
  return (
    <div className="param-field">
      <span className="param-label">{label}</span>
      <div className="param-input-suffix-wrap">
        <input
          type="number"
          className="param-input param-input-with-suffix"
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          min={0}
          max={100}
          placeholder="不限"
        />
        <span className="param-input-suffix">%</span>
      </div>
    </div>
  );
}

function ConstraintsAndSimulation({
  maxDrawdown,
  minSuccessRate,
  maxVolatility,
  numSimulations,
  onMaxDrawdownChange,
  onMinSuccessRateChange,
  onMaxVolatilityChange,
  onNumSimulationsChange,
}: {
  maxDrawdown: number | '';
  minSuccessRate: number | '';
  maxVolatility: number | '';
  numSimulations: number;
  onMaxDrawdownChange: (v: number | '') => void;
  onMinSuccessRateChange: (v: number | '') => void;
  onMaxVolatilityChange: (v: number | '') => void;
  onNumSimulationsChange: (v: number) => void;
}) {
  return (
    <>
      <ParamsSection
        title="约束条件"
        info="可选：设置最大回撤、最小成功率、最大波动率约束，模拟将过滤不满足最大回撤与最大波动率约束的路径"
        defaultOpen={false}
      >
        <div className="params-row">
          <ConstraintField
            label="最大回撤限制"
            value={maxDrawdown}
            onChange={onMaxDrawdownChange}
          />
          <ConstraintField
            label="最小成功率"
            value={minSuccessRate}
            onChange={onMinSuccessRateChange}
          />
          <ConstraintField
            label="最大波动率"
            value={maxVolatility}
            onChange={onMaxVolatilityChange}
          />
        </div>
      </ParamsSection>
      <ParamsSection
        title="模拟参数"
        info="蒙特卡洛模拟次数，越多越精确但耗时越长（默认 1000，上限 10000）"
      >
        <div className="param-field">
          <span className="param-label">模拟次数</span>
          <input
            type="number"
            className="param-input"
            value={numSimulations}
            onChange={(e) => onNumSimulationsChange(Number(e.target.value))}
            min={100}
            max={10000}
          />
        </div>
      </ParamsSection>
    </>
  );
}

export function GoalOptimizerParamsPanel(props: GoalParamsProps) {
  return (
    <ParamsPanel>
      <GoalSettingsSection {...props} />
      <AssetConfigSection {...props} />
      <ConstraintsAndSimulation
        maxDrawdown={props.maxDrawdown}
        minSuccessRate={props.minSuccessRate}
        maxVolatility={props.maxVolatility}
        numSimulations={props.numSimulations}
        onMaxDrawdownChange={props.onMaxDrawdownChange}
        onMinSuccessRateChange={props.onMinSuccessRateChange}
        onMaxVolatilityChange={props.onMaxVolatilityChange}
        onNumSimulationsChange={props.onNumSimulationsChange}
      />
      <div className="bt-action-row">
        <LoadingButton isLoading={props.isLoading} onClick={props.onRun} loadingText="优化中...">
          <Play className="w-4 h-4" />
          开始优化
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}
