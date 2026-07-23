/**
 * @file 现金流分区
 * @description 周期性现金流腿（CashflowLegs）与一次性现金流（OneTimeCashflow）两个分区。
 * 使用统一参数布局组件。
 */
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import { Plus, X } from 'lucide-react';

import type { TFunctionProp } from './BacktestParamsForm.types.js';
import type { CashflowLeg } from '@backtest/shared';
import { ParamGroup, ParamRow, ParamCard } from './params/index.js';

/** 周期性现金流分区 */
export function CashflowLegsSection() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const addCashflowLeg = useBacktestStore((s) => s.addCashflowLeg);

  return (
    <ParamGroup title={t('params.cashflowLegs')} badge={parameters.cashflowLegs?.length || 0}>
      <ParamRow>
        <ParamCard label={t('params.adjustFixedCashflowsForInflation')}>
          <label className="param-check">
            <input type="checkbox" />
            <span>{t('params.adjustForInflation')}</span>
          </label>
        </ParamCard>
        <ParamCard label={t('params.annualCashflowGrowth')}>
          <div className="param-input-suffix-wrap">
            <input type="number" defaultValue={0} className="param-input param-input-with-suffix" />
            <span className="param-input-suffix">%</span>
          </div>
        </ParamCard>
      </ParamRow>
      {(parameters.cashflowLegs || []).map((leg) => (
        <CashflowLegRow key={leg.id} leg={leg} currency={parameters.baseCurrency} t={t} />
      ))}
      <button className="btn-add-cashflow" onClick={addCashflowLeg}>
        <Plus className="w-3.5 h-3.5" />
        {t('params.addCashflowLeg')}
      </button>
    </ParamGroup>
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
    <ParamRow>
      <ParamCard label={t('params.amount')}>
        <div className="param-input-prefix-wrap">
          <span className="param-input-prefix">{currency === 'usd' ? '$' : '¥'}</span>
          <input
            type="number"
            value={leg.amount || ''}
            className="param-input param-input-with-prefix"
            placeholder="0"
            onChange={(e) => updateCashflowLeg(leg.id, { amount: Number(e.target.value) || 0 })}
          />
        </div>
      </ParamCard>
      <ParamCard label={t('params.cashflowType')}>
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
      </ParamCard>
      <ParamCard label={t('params.frequency')}>
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
      </ParamCard>
      <ParamCard label={t('params.offset')}>
        <input
          type="number"
          value={leg.offset || ''}
          className="param-input"
          placeholder="0"
          onChange={(e) => updateCashflowLeg(leg.id, { offset: Number(e.target.value) || 0 })}
        />
      </ParamCard>
      <ParamCard label={t('params.until')}>
        <input
          type="date"
          value={leg.until || ''}
          className="param-input"
          onChange={(e) => updateCashflowLeg(leg.id, { until: e.target.value })}
        />
      </ParamCard>
      <button
        className="row-remove-btn"
        onClick={() => removeCashflowLeg(leg.id)}
        title={t('common.delete')}
      >
        <X className="w-4 h-4" />
      </button>
    </ParamRow>
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
    <ParamGroup
      title={t('params.oneTimeCashflow')}
      badge={parameters.oneTimeCashflows?.length || 0}
    >
      {(parameters.oneTimeCashflows || []).map((cf) => (
        <ParamRow key={cf.id}>
          <ParamCard label={t('params.amount')}>
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
          </ParamCard>
          <ParamCard label={t('params.type')}>
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
          </ParamCard>
          <ParamCard label={t('params.date')}>
            <input
              type="date"
              value={cf.date}
              className="param-input"
              onChange={(e) => updateOneTimeCashflow(cf.id, { date: e.target.value })}
            />
          </ParamCard>
          <button
            className="row-remove-btn"
            onClick={() => removeOneTimeCashflow(cf.id)}
            title={t('common.delete')}
          >
            <X className="w-4 h-4" />
          </button>
        </ParamRow>
      ))}
      {(parameters.oneTimeCashflows || []).length === 0 && (
        <button className="params-link-btn" onClick={addOneTimeCashflow}>
          + {t('params.addOneTimeCashflow')}
        </button>
      )}
    </ParamGroup>
  );
}
