/**
 * @file 组合高级设置分区
 * @description 每个组合的年度拖累、总回报模式及再平衡偏离带（Rebalance Bands）编辑。
 * 从 BacktestParamsForm 抽出以隔离再平衡带的复杂 UI。
 */
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import { ParamsSection } from './ParamsPanel.js';
import type { RebalanceBands } from '@backtest/shared';

/** 单个组合的 Rebalance Bands 输入行 */
function PortfolioBandsEditor({
  bands,
  onUpdate,
}: {
  bands: RebalanceBands;
  onUpdate: (bands: RebalanceBands) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <BandField
        label={t('params.absoluteBandSymmetric')}
        value={bands.absoluteBand ?? 5}
        onChange={(v) => onUpdate({ ...bands, absoluteBand: v ?? 0 })}
        suffix="±%"
      />
      <BandField
        label={t('params.relativeBandSymmetric')}
        value={bands.relativeBand ?? 20}
        onChange={(v) => onUpdate({ ...bands, relativeBand: v ?? 0 })}
        suffix="±%"
        max={100}
        step={1}
      />
      <BandField
        label={t('params.upperBandAsymmetric')}
        value={bands.upperBand ?? ''}
        onChange={(v) => onUpdate({ ...bands, upperBand: v })}
        suffix="%"
        placeholder="—"
      />
      <BandField
        label={t('params.lowerBandAsymmetric')}
        value={bands.lowerBand ?? ''}
        onChange={(v) => onUpdate({ ...bands, lowerBand: v })}
        suffix="%"
        placeholder="—"
      />
    </>
  );
}

function BandField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max = 50,
  step = 0.5,
  placeholder,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | undefined) => void;
  suffix: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className="param-field" style={{ width: 100 }}>
      <label className="param-label">{label}</label>
      <div className="param-input-suffix-wrap">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          className="param-input param-input-with-suffix"
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        <span className="param-input-suffix">{suffix}</span>
      </div>
    </div>
  );
}

/** 组合高级设置分区 */
export function AdvancedSettingsSection() {
  const { t } = useTranslation();
  const portfolios = useBacktestStore(useShallow((s) => s.portfolios));
  const updatePortfolio = useBacktestStore((s) => s.updatePortfolio);

  return (
    <ParamsSection
      title={t('params.advancedSettings')}
      defaultOpen={false}
      info={t('params.advancedSettingsInfo')}
    >
      <div className="params-subsection-body">
        {portfolios.map((portfolio) => (
          <div
            key={portfolio.id}
            className="cashflow-leg-row"
            style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}
          >
            <div
              className="text-[12px] font-semibold"
              style={{ color: 'var(--text-strong)', width: '100%', marginBottom: '2px' }}
            >
              {portfolio.name}
            </div>
            <div className="param-field" style={{ width: 100 }}>
              <label className="param-label">{t('params.annualDrag')}</label>
              <div className="param-input-suffix-wrap">
                <input
                  type="number"
                  value={portfolio.drag ?? 0}
                  min={0}
                  max={10}
                  step={0.1}
                  className="param-input param-input-with-suffix"
                  onChange={(e) =>
                    updatePortfolio(portfolio.id, { drag: Number(e.target.value) || 0 })
                  }
                />
                <span className="param-input-suffix">%</span>
              </div>
            </div>
            <label className="param-check" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={portfolio.totalReturn ?? true}
                onChange={(e) => updatePortfolio(portfolio.id, { totalReturn: e.target.checked })}
              />
              <span>{t('params.totalReturnMode')}</span>
            </label>
            <label className="param-check" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={portfolio.rebalanceBands?.enabled ?? false}
                onChange={(e) => {
                  const current = portfolio.rebalanceBands || { enabled: false };
                  const updated: RebalanceBands = { ...current, enabled: e.target.checked };
                  if (e.target.checked && updated.absoluteBand === undefined)
                    updated.absoluteBand = 5;
                  if (e.target.checked && updated.relativeBand === undefined)
                    updated.relativeBand = 20;
                  updatePortfolio(portfolio.id, { rebalanceBands: updated });
                }}
              />
              <span>{t('params.enableRebalanceBands')}</span>
            </label>
            {portfolio.rebalanceBands?.enabled && (
              <PortfolioBandsEditor
                bands={portfolio.rebalanceBands}
                onUpdate={(bands) => updatePortfolio(portfolio.id, { rebalanceBands: bands })}
              />
            )}
          </div>
        ))}
      </div>
    </ParamsSection>
  );
}
