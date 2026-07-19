/**
 * @file 参数空间 Section
 * @description 搜索参数空间配置：再平衡频率多选 + 阈值范围 + 资金范围。
 *              三个内部子组件（FreqMultiSelect / ThresholdRangeInputs / CapitalRangeInputs）
 *              仅在本文件内消费，故未单独拆分。
 */
import { useTranslation } from 'react-i18next';
import { ParamsSection } from '../../../components/ParamsPanel.js';
import { FREQ_OPTIONS } from '../backtestOptimizerUtils.js';
import type { OptimizerSectionProps } from './types.js';

function FreqMultiSelect({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="param-label" style={{ marginBottom: 6 }}>
        {t('backtest.optimizer.rebalanceFreq')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {FREQ_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="param-check"
            style={{
              padding: '4px 10px',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-control)',
              cursor: 'pointer',
              marginBottom: 0,
              backgroundColor: s.frequencies.includes(opt.value) ? 'var(--brand)' : 'transparent',
              color: s.frequencies.includes(opt.value) ? '#fff' : 'var(--text-body)',
              transition: 'all .15s',
            }}
          >
            <input
              type="checkbox"
              checked={s.frequencies.includes(opt.value)}
              onChange={() => s.toggleFreq(opt.value)}
              style={{ display: 'none' }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ThresholdRangeInputs({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="param-label" style={{ marginBottom: 6 }}>
        {t('backtest.optimizer.thresholdRange')}
      </div>
      <div className="params-row">
        {[
          [t('backtest.optimizer.min'), s.thrMin, s.setThrMin],
          [t('backtest.optimizer.max'), s.thrMax, s.setThrMax],
          [t('backtest.optimizer.step'), s.thrStep, s.setThrStep],
        ].map(([label, val, set]) => (
          <div key={label as string} className="param-field param-field-rolling">
            <span className="param-label">{label as string}</span>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                step="0.5"
                className="param-input param-input-with-suffix"
                value={val as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
              />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapitalRangeInputs({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  const fields: Array<[string, string, (v: string) => void]> = [
    [t('backtest.optimizer.min'), s.capMin, s.setCapMin],
    [t('backtest.optimizer.max'), s.capMax, s.setCapMax],
    [t('backtest.optimizer.step'), s.capStep, s.setCapStep],
  ];
  return (
    <div>
      <div className="param-label" style={{ marginBottom: 6 }}>
        {t('backtest.optimizer.capitalRange')}
      </div>
      <div className="params-row">
        {fields.map(([label, val, set]) => (
          <div key={label} className="param-field param-field-rolling">
            <span className="param-label">{label}</span>
            <div className="param-input-suffix-wrap">
              <span className="param-input-suffix" style={{ position: 'static', paddingRight: 2 }}>
                $
              </span>
              <input
                type="number"
                step="1000"
                className="param-input"
                value={val}
                onChange={(e) => set(e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ParameterSpaceSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.paramSpace')}
      info={t('backtest.optimizer.paramSpaceInfo')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FreqMultiSelect s={s} />
        <ThresholdRangeInputs s={s} />
        <CapitalRangeInputs s={s} />
      </div>
    </ParamsSection>
  );
}
