/**
 * @file 现金流分区
 * @description 周期性现金流腿（CashflowLegs）与一次性现金流（OneTimeCashflow）两个分区。
 * 从 BacktestParamsForm 抽出以隔离现金流相关行级编辑 UI。
 */
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import { Plus, X } from 'lucide-react';
import { ParamsSection } from './ParamsPanel.js';
import type { TFunctionProp } from './BacktestParamsForm.types.js';
import type { CashflowLeg } from '@backtest/shared';

/** 周期性现金流分区 */
export function CashflowLegsSection() {
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

/** CashflowLegRow 组件 Props */
interface CashflowLegRowProps extends TFunctionProp {
  /** 单条现金流腿 */
  leg: CashflowLeg;
  /** 基础货币（usd/cny），决定金额前缀符号 */
  currency: string | undefined;
}

function CashflowLegRow({ leg, currency, t }: CashflowLegRowProps) {
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

/** CashflowAmountField 组件 Props */
interface CashflowAmountFieldProps extends TFunctionProp {
  /** 单条现金流腿 */
  leg: CashflowLeg;
  /** 基础货币（usd/cny），决定金额前缀符号 */
  currency: string | undefined;
}

function CashflowAmountField({ leg, currency, t }: CashflowAmountFieldProps) {
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
export function OneTimeCashflowSection() {
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
