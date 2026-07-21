/**
 * @file 目标优化器参数面板子组件
 * @description 承载目标设置、资产配置、约束条件、模拟次数与执行按钮
 */
import { useTranslation } from 'react-i18next';
import { Play, Plus, X } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import LoadingButton from '../../components/LoadingButton.js';
import { ParamRow, ParamCard } from '../../components/params/index.js';
import type { GoalAsset } from './goalOptimizerUtils.js';

/** 参数面板 props */
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

function ConstraintField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
}) {
  const { t } = useTranslation();
  return (
    <ParamCard label={label}>
      <div className="param-input-suffix-wrap">
        <input
          type="number"
          className="param-input param-input-with-suffix"
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          min={0}
          max={100}
          placeholder={t('goalOptimizer.noLimit')}
        />
        <span className="param-input-suffix">%</span>
      </div>
    </ParamCard>
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
}: Pick<
  GoalParamsProps,
  | 'maxDrawdown'
  | 'minSuccessRate'
  | 'maxVolatility'
  | 'numSimulations'
  | 'onMaxDrawdownChange'
  | 'onMinSuccessRateChange'
  | 'onMaxVolatilityChange'
  | 'onNumSimulationsChange'
>) {
  const { t } = useTranslation();
  return (
    <>
      <ParamsSection
        title={t('goalOptimizer.constraints.section')}
        info={t('goalOptimizer.constraints.sectionInfo')}
        defaultOpen={false}
      >
        <ParamRow>
          <ConstraintField
            label={t('goalOptimizer.constraints.maxDrawdown')}
            value={maxDrawdown}
            onChange={onMaxDrawdownChange}
          />
          <ConstraintField
            label={t('goalOptimizer.constraints.minSuccessRate')}
            value={minSuccessRate}
            onChange={onMinSuccessRateChange}
          />
          <ConstraintField
            label={t('goalOptimizer.constraints.maxVolatility')}
            value={maxVolatility}
            onChange={onMaxVolatilityChange}
          />
        </ParamRow>
      </ParamsSection>
      <ParamsSection
        title={t('goalOptimizer.simulation.section')}
        info={t('goalOptimizer.simulation.sectionInfo')}
      >
        <ParamRow>
          <ParamCard label={t('goalOptimizer.simulation.count')}>
            <input
              type="number"
              className="param-input"
              value={numSimulations}
              onChange={(e) => onNumSimulationsChange(Number(e.target.value))}
              min={100}
              max={10000}
            />
          </ParamCard>
        </ParamRow>
      </ParamsSection>
    </>
  );
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
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('goalOptimizer.goal.section')}
      info={t('goalOptimizer.goal.sectionInfo')}
    >
      <ParamRow>
        <ParamCard label={t('goalOptimizer.goal.targetAmount')}>
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
        </ParamCard>
        <ParamCard label={t('goalOptimizer.goal.initialAmount')}>
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
        </ParamCard>
        <ParamCard label={t('goalOptimizer.goal.timeRange')}>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={years}
              onChange={(e) => onYearsChange(Number(e.target.value))}
              min={1}
            />
            <span className="param-input-suffix">{t('goalOptimizer.yearUnit')}</span>
          </div>
        </ParamCard>
      </ParamRow>
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
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('goalOptimizer.asset.section')}
      info={t('goalOptimizer.asset.sectionInfo')}
    >
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {assets.map((a, idx) => (
            <div key={idx} className="ticker-row">
              <input
                type="text"
                value={a.ticker}
                onChange={(e) => onUpdateAsset(idx, 'ticker', e.target.value)}
                placeholder={t('goalOptimizer.asset.tickerPlaceholder')}
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
                <button
                  onClick={() => onRemoveAsset(idx)}
                  className="row-remove-btn"
                  title={t('goalOptimizer.delete')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={onAddAsset} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" />
        {t('goalOptimizer.addAsset')}
      </button>
      <div
        className={`portfolio-total ${totalWeight === 100 ? 'complete' : 'incomplete'}`}
        style={{ marginTop: 8 }}
      >
        <span>{t('goalOptimizer.total')}</span>
        <span className="total-value">{totalWeight}%</span>
      </div>
    </ParamsSection>
  );
}

/** 目标优化器参数面板（目标 + 资产 + 约束 + 模拟 + 执行） */
export function GoalOptimizerParamsPanel(props: GoalParamsProps) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <GoalSettingsSection {...props} />
      <AssetConfigSection {...props} />
      <ConstraintsAndSimulation {...props} />
      <div className="bt-action-row">
        <LoadingButton
          isLoading={props.isLoading}
          onClick={props.onRun}
          loadingText={t('goalOptimizer.optimizing')}
        >
          <Play className="w-4 h-4" />
          {t('goalOptimizer.startOptimize')}
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}
