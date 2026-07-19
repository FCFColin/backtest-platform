/**
 * @file 优化目标 Section
 * @description 选择优化目标（maxCagr/minMaxDrawdown/maxSharpe/maxSortino）
 *              与可选约束（最大回撤上限 / CAGR 下限）。ConstraintRow 为内部子组件。
 */
import { useTranslation } from 'react-i18next';
import { ParamsSection } from '../../../components/ParamsPanel.js';
import type { OptimizerSectionProps, ConstraintRowProps, Objective } from './types.js';

function ConstraintRow({
  enabled,
  setEnabled,
  label,
  value,
  setValue,
  placeholder,
}: ConstraintRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <label className="param-check" style={{ width: 130, marginBottom: 0 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>{label}</span>
      </label>
      <div className="param-field param-field-rolling" style={{ flex: 1 }}>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            step="0.1"
            className="param-input param-input-with-suffix"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={!enabled}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
    </div>
  );
}

export function ObjectiveSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.objective')}
      info={t('backtest.optimizer.objectiveInfo')}
    >
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">{t('backtest.optimizer.target')}</span>
          <select
            className="param-input"
            value={s.objective}
            onChange={(e) => s.setObjective(e.target.value as Objective)}
          >
            <option value="maxCagr">{t('backtest.optimizer.maxCagr')}</option>
            <option value="minMaxDrawdown">{t('backtest.optimizer.minMaxDrawdown')}</option>
            <option value="maxSharpe">{t('backtest.optimizer.maxSharpe')}</option>
            <option value="maxSortino">{t('backtest.optimizer.maxSortino')}</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <ConstraintRow
          enabled={s.enableMaxDD}
          setEnabled={s.setEnableMaxDD}
          label={t('backtest.optimizer.maxDrawdownConstraint')}
          value={s.maxDD}
          setValue={s.setMaxDD}
          placeholder={t('backtest.optimizer.maxDrawdownPlaceholder')}
        />
        <ConstraintRow
          enabled={s.enableMinCagr}
          setEnabled={s.setEnableMinCagr}
          label={t('backtest.optimizer.cagrConstraint')}
          value={s.minCagr}
          setValue={s.setMinCagr}
          placeholder={t('backtest.optimizer.cagrPlaceholder')}
        />
      </div>
    </ParamsSection>
  );
}
