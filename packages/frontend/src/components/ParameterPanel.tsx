/**
 * @file 回测参数面板
 * @description 回测核心参数配置面板，包括标的、权重、日期范围及调仓策略等设置。
 * 使用 ParamsPanel/ParamsSection 组件组织可折叠分区，对标 testfol.io 参数区风格。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import { Plus, X } from 'lucide-react';
import TickerInput from './TickerInput';
import { ParamsPanel, ParamsSection } from './ParamsPanel';
import type { RebalanceBands } from '@backtest/shared';
import type { CashflowLeg } from '@backtest/shared';

function validateDateChange(
  field: 'startDate' | 'endDate',
  value: string,
  otherDate: string,
  t: TFunction,
): string | null {
  if (!value) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (field === 'endDate' && value > today) return t('params.endDateAfterToday');
  if (field === 'startDate' && otherDate && value > otherDate) return t('params.startDateAfterEnd');
  if (field === 'endDate' && otherDate && value < otherDate) return t('params.endDateBeforeStart');
  return null;
}

/** 日期范围输入 */
function DateRangeFields({
  startDate,
  endDate,
  onUpdate,
  t,
}: {
  startDate: string;
  endDate: string;
  onUpdate: (field: 'startDate' | 'endDate', value: string) => void;
  t: TFunction;
}) {
  return (
    <>
      <label className="param-check">
        <input
          type="checkbox"
          checked={startDate === '' && endDate === ''}
          onChange={(e) => {
            if (e.target.checked) {
              onUpdate('startDate', '');
              onUpdate('endDate', '');
            } else {
              onUpdate('startDate', '2010-01-01');
              onUpdate('endDate', '2024-12-31');
            }
          }}
        />
        <span>{t('params.allHistory')}</span>
      </label>
      <div className="param-field">
        <label className="param-label">{t('params.startDate')}</label>
        <input
          type="date"
          value={startDate}
          className="param-input"
          onChange={(e) => {
            const err = validateDateChange('startDate', e.target.value, endDate, t);
            if (err) {
              useToastStore.getState().addToast('warning', err);
              return;
            }
            onUpdate('startDate', e.target.value);
          }}
        />
      </div>
      <div className="param-field">
        <label className="param-label">{t('params.endDate')}</label>
        <input
          type="date"
          value={endDate}
          className="param-input"
          onChange={(e) => {
            const err = validateDateChange('endDate', e.target.value, startDate, t);
            if (err) {
              useToastStore.getState().addToast('warning', err);
              return;
            }
            onUpdate('endDate', e.target.value);
          }}
        />
      </div>
    </>
  );
}

/** 基本参数分区 */
function BasicParamsSection() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);

  return (
    <ParamsSection title={t('params.basicParams')} info={t('params.basicParamsInfo')}>
      <div className="params-row">
        <DateRangeFields
          startDate={parameters.startDate}
          endDate={parameters.endDate}
          onUpdate={(field, value) => updateParameter(field, value)}
          t={t}
        />
        <StartingValueField t={t} />
        <CurrencyField t={t} />
        <InflationToggle t={t} />
        <RollingWindowField t={t} />
        <label className="param-check">
          <input
            type="checkbox"
            checked={parameters.extendedWithdrawalStats}
            onChange={(e) => updateParameter('extendedWithdrawalStats', e.target.checked)}
          />
          <span>{t('params.extendedWithdrawalStats')}</span>
        </label>
        <BenchmarkField t={t} />
      </div>
    </ParamsSection>
  );
}

function StartingValueField({ t }: { t: TFunction }) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <div className="param-field param-field-start-val">
      <label className="param-label">{t('params.startingValue')}</label>
      <div className="param-input-prefix-wrap">
        <span className="param-input-prefix">{parameters.baseCurrency === 'usd' ? '$' : '¥'}</span>
        <input
          type="number"
          value={parameters.startingValue}
          min={1}
          step={1000}
          className="param-input param-input-with-prefix"
          onChange={(e) =>
            updateParameter('startingValue', Math.max(1, Number(e.target.value) || 0))
          }
        />
      </div>
    </div>
  );
}

function CurrencyField({ t }: { t: TFunction }) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <div className="param-field" style={{ width: 90 }}>
      <label className="param-label">{t('params.currency')}</label>
      <select
        value={parameters.baseCurrency}
        className="param-input"
        onChange={(e) => updateParameter('baseCurrency', e.target.value as 'usd' | 'cny')}
      >
        <option value="usd">USD ($)</option>
        <option value="cny">CNY (¥)</option>
      </select>
    </div>
  );
}

function InflationToggle({ t }: { t: TFunction }) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <>
      <label className="param-toggle">
        <span>{t('params.inflationAdjust')}</span>
        <div
          className={`toggle-switch ${parameters.adjustForInflation ? 'active' : ''}`}
          onClick={() => updateParameter('adjustForInflation', !parameters.adjustForInflation)}
        />
      </label>
      {parameters.adjustForInflation && (
        <span
          className="param-hint"
          style={{ color: '#f59e0b', fontSize: '12px', whiteSpace: 'nowrap' }}
        >
          {parameters.baseCurrency === 'usd' ? t('params.useUSCPI') : t('params.useCNCPI')}
        </span>
      )}
    </>
  );
}

function RollingWindowField({ t }: { t: TFunction }) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <div className="param-field param-field-rolling">
      <label className="param-label">{t('params.rollingWindow')}</label>
      <div className="param-input-suffix-wrap">
        <input
          type="number"
          value={parameters.rollingWindowMonths}
          min={1}
          max={120}
          className="param-input param-input-with-suffix"
          onChange={(e) =>
            updateParameter('rollingWindowMonths', Math.max(1, Number(e.target.value) || 12))
          }
        />
        <span className="param-input-suffix">{t('params.months')}</span>
      </div>
    </div>
  );
}

function BenchmarkField({ t }: { t: TFunction }) {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return (
    <>
      <label className="param-check">
        <input
          type="checkbox"
          checked={parameters.benchmarkTicker !== ''}
          onChange={(e) => updateParameter('benchmarkTicker', e.target.checked ? 'SPY' : '')}
        />
        <span>{t('params.selectBenchmark')}</span>
      </label>
      {parameters.benchmarkTicker !== '' && (
        <div className="param-field" style={{ width: 120 }}>
          <TickerInput
            value={parameters.benchmarkTicker}
            onChange={(v) => updateParameter('benchmarkTicker', v)}
            placeholder="SPY"
          />
        </div>
      )}
    </>
  );
}

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
function AdvancedSettingsSection() {
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

/** 周期性现金流分区 */
function CashflowLegsSection() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const addCashflowLeg = useBacktestStore((s) => s.addCashflowLeg);

  return (
    <ParamsSection
      title={t('params.cashflowLegs')}
      defaultOpen={false}
      info={t('params.cashflowLegsInfo')}
    >
      <div className="params-subsection-body">
        {(parameters.cashflowLegs || []).map((leg) => (
          <CashflowLegRow key={leg.id} leg={leg} currency={parameters.baseCurrency} t={t} />
        ))}
        <button className="toolbar-btn" onClick={addCashflowLeg}>
          <Plus className="w-3.5 h-3.5" />
          {t('params.addCashflowLeg')}
        </button>
      </div>
    </ParamsSection>
  );
}

function CashflowLegRow({
  leg,
  currency,
  t,
}: {
  leg: CashflowLeg;
  currency: string | undefined;
  t: TFunction;
}) {
  const removeCashflowLeg = useBacktestStore((s) => s.removeCashflowLeg);
  const updateCashflowLeg = useBacktestStore((s) => s.updateCashflowLeg);
  return (
    <div className="cashflow-leg-row">
      <CashflowAmountField leg={leg} currency={currency} t={t} />
      <div className="param-field" style={{ width: 100 }}>
        <label className="param-label">{t('params.cashflowType')}</label>
        <select
          value={leg.type}
          className="param-input"
          onChange={(e) =>
            updateCashflowLeg(leg.id, {
              type: e.target.value as 'contribution' | 'withdrawal',
            })
          }
        >
          <option value="contribution">{t('params.contribution')}</option>
          <option value="withdrawal">{t('params.withdrawal')}</option>
        </select>
      </div>
      <div className="param-field" style={{ width: 100 }}>
        <label className="param-label">{t('params.frequency')}</label>
        <select
          value={leg.frequency}
          className="param-input"
          onChange={(e) =>
            updateCashflowLeg(leg.id, {
              frequency: e.target.value as 'yearly' | 'monthly' | 'quarterly' | 'weekly',
            })
          }
        >
          <option value="yearly">{t('params.yearly')}</option>
          <option value="quarterly">{t('params.quarterly')}</option>
          <option value="monthly">{t('params.monthly')}</option>
          <option value="weekly">{t('params.weekly')}</option>
        </select>
      </div>
      <div className="param-field" style={{ width: 70 }}>
        <label className="param-label">{t('params.offset')}</label>
        <input
          type="number"
          value={leg.offset || ''}
          className="param-input"
          placeholder="0"
          onChange={(e) => updateCashflowLeg(leg.id, { offset: Number(e.target.value) || 0 })}
        />
      </div>
      <div className="param-field" style={{ width: 120 }}>
        <label className="param-label">{t('params.until')}</label>
        <input
          type="date"
          value={leg.until || ''}
          className="param-input"
          onChange={(e) => updateCashflowLeg(leg.id, { until: e.target.value })}
        />
      </div>
      <button
        className="row-remove-btn"
        onClick={() => removeCashflowLeg(leg.id)}
        title={t('common.delete')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function CashflowAmountField({
  leg,
  currency,
  t,
}: {
  leg: CashflowLeg;
  currency: string | undefined;
  t: TFunction;
}) {
  const updateCashflowLeg = useBacktestStore((s) => s.updateCashflowLeg);
  return (
    <div className="param-field" style={{ width: 100 }}>
      <label className="param-label">{t('params.amount')}</label>
      <div className="param-input-prefix-wrap">
        <span className="param-input-prefix">{currency === 'usd' ? '$' : '¥'}</span>
        <input
          type="number"
          value={leg.amount || ''}
          className="param-input param-input-with-prefix"
          placeholder="0"
          onChange={(e) =>
            updateCashflowLeg(leg.id, { amount: Math.abs(Number(e.target.value) || 0) })
          }
        />
      </div>
    </div>
  );
}

/** 一次性现金流分区 */
function OneTimeCashflowSection() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const addOneTimeCashflow = useBacktestStore((s) => s.addOneTimeCashflow);
  const removeOneTimeCashflow = useBacktestStore((s) => s.removeOneTimeCashflow);
  const updateOneTimeCashflow = useBacktestStore((s) => s.updateOneTimeCashflow);

  return (
    <ParamsSection
      title={t('params.oneTimeCashflow')}
      defaultOpen={false}
      info={t('params.oneTimeCashflowInfo')}
    >
      <div className="params-subsection-body">
        {(parameters.oneTimeCashflows || []).map((cf) => (
          <div key={cf.id} className="cashflow-leg-row">
            <div className="param-field" style={{ width: 100 }}>
              <label className="param-label">{t('params.amount')}</label>
              <div className="param-input-prefix-wrap">
                <span className="param-input-prefix">
                  {parameters.baseCurrency === 'usd' ? '$' : '¥'}
                </span>
                <input
                  type="number"
                  value={cf.amount || ''}
                  className="param-input param-input-with-prefix"
                  placeholder="0"
                  onChange={(e) =>
                    updateOneTimeCashflow(cf.id, { amount: Math.abs(Number(e.target.value) || 0) })
                  }
                />
              </div>
            </div>
            <div className="param-field" style={{ width: 100 }}>
              <label className="param-label">{t('params.type')}</label>
              <select
                value={cf.type}
                className="param-input"
                onChange={(e) =>
                  updateOneTimeCashflow(cf.id, {
                    type: e.target.value as 'contribution' | 'withdrawal',
                  })
                }
              >
                <option value="contribution">{t('params.contribution')}</option>
                <option value="withdrawal">{t('params.withdrawal')}</option>
              </select>
            </div>
            <div className="param-field" style={{ width: 130 }}>
              <label className="param-label">{t('params.date')}</label>
              <input
                type="date"
                value={cf.date}
                className="param-input"
                onChange={(e) => updateOneTimeCashflow(cf.id, { date: e.target.value })}
              />
            </div>
            <button
              className="row-remove-btn"
              onClick={() => removeOneTimeCashflow(cf.id)}
              title={t('common.delete')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button className="toolbar-btn" onClick={addOneTimeCashflow}>
          <Plus className="w-3.5 h-3.5" />
          {t('params.addOneTimeCashflow')}
        </button>
      </div>
    </ParamsSection>
  );
}

const ParameterPanel = memo(function ParameterPanel() {
  const { t } = useTranslation();
  return (
    <div className="params-section">
      <div className="params-title">{t('params.title')}</div>
      <ParamsPanel>
        <BasicParamsSection />
        <AdvancedSettingsSection />
        <CashflowLegsSection />
        <OneTimeCashflowSection />
      </ParamsPanel>
    </div>
  );
});

export default ParameterPanel;
