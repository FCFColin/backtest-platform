/**
 * @file 现金流分区
 * @description 周期性现金流腿（CashflowLegs）与一次性现金流（OneTimeCashflow）两个分区。
 *   基于 shadcn Input / Select / Switch / Button + token 类名，使用统一参数布局组件。
 */
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
          <div className="flex items-center gap-2 h-10">
            <Switch id="cf-inflation-adjust" />
            <label
              htmlFor="cf-inflation-adjust"
              className="text-caption text-fg-secondary cursor-pointer"
            >
              {t('params.adjustForInflation')}
            </label>
          </div>
        </ParamCard>
        <ParamCard label={t('params.annualCashflowGrowth')}>
          <div className="flex items-center gap-2">
            <Input type="number" defaultValue={0} className="font-mono tabular-nums" />
            <span className="text-caption text-fg-tertiary shrink-0">%</span>
          </div>
        </ParamCard>
      </ParamRow>
      {(parameters.cashflowLegs || []).map((leg) => (
        <CashflowLegRow key={leg.id} leg={leg} currency={parameters.baseCurrency} t={t} />
      ))}
      <Button variant="ghost" size="sm" className="mt-2" onClick={addCashflowLeg}>
        <Plus />
        {t('params.addCashflowLeg')}
      </Button>
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

function CashflowFrequencySelect({
  leg,
  updateCashflowLeg,
  t,
}: {
  leg: CashflowLeg;
  updateCashflowLeg: (id: string, patch: Partial<CashflowLeg>) => void;
  t: TFunctionProp['t'];
}) {
  return (
    <ParamCard label={t('params.frequency')}>
      <Select
        value={leg.frequency}
        onValueChange={(v) =>
          updateCashflowLeg(leg.id, {
            frequency: v as 'yearly' | 'monthly' | 'quarterly' | 'weekly',
          })
        }
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yearly">{t('params.yearly')}</SelectItem>
          <SelectItem value="quarterly">{t('params.quarterly')}</SelectItem>
          <SelectItem value="monthly">{t('params.monthly')}</SelectItem>
          <SelectItem value="weekly">{t('params.weekly')}</SelectItem>
        </SelectContent>
      </Select>
    </ParamCard>
  );
}

function CashflowLegRow({ leg, currency, t }: CashflowLegRowProps) {
  const removeCashflowLeg = useBacktestStore((s) => s.removeCashflowLeg);
  const updateCashflowLeg = useBacktestStore((s) => s.updateCashflowLeg);
  return (
    <ParamRow>
      <ParamCard label={t('params.amount')}>
        <div className="flex items-center gap-2">
          <span className="text-body text-fg-tertiary font-mono">
            {currency === 'usd' ? '$' : '¥'}
          </span>
          <Input
            type="number"
            value={leg.amount || ''}
            placeholder="0"
            onChange={(e) => updateCashflowLeg(leg.id, { amount: Number(e.target.value) || 0 })}
          />
        </div>
      </ParamCard>
      <ParamCard label={t('params.cashflowType')}>
        <Select
          value={leg.type}
          onValueChange={(v) =>
            updateCashflowLeg(leg.id, { type: v as 'contribution' | 'withdrawal' })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contribution">{t('params.contribution')}</SelectItem>
            <SelectItem value="withdrawal">{t('params.withdrawal')}</SelectItem>
          </SelectContent>
        </Select>
      </ParamCard>
      <CashflowFrequencySelect leg={leg} updateCashflowLeg={updateCashflowLeg} t={t} />
      <ParamCard label={t('params.offset')}>
        <Input
          type="number"
          value={leg.offset || ''}
          placeholder="0"
          onChange={(e) => updateCashflowLeg(leg.id, { offset: Number(e.target.value) || 0 })}
        />
      </ParamCard>
      <ParamCard label={t('params.until')}>
        <Input
          type="date"
          value={leg.until || ''}
          onChange={(e) => updateCashflowLeg(leg.id, { until: e.target.value })}
        />
      </ParamCard>
      <Button
        variant="destructive"
        size="icon"
        className="mt-7"
        onClick={() => removeCashflowLeg(leg.id)}
        title={t('common.delete')}
        aria-label={t('common.delete')}
      >
        <X />
      </Button>
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
            <div className="flex items-center gap-2">
              <span className="text-body text-fg-tertiary font-mono">
                {parameters.baseCurrency === 'usd' ? '$' : '¥'}
              </span>
              <Input
                type="number"
                value={cf.amount || ''}
                placeholder="0"
                onChange={(e) =>
                  updateOneTimeCashflow(cf.id, { amount: Math.abs(Number(e.target.value) || 0) })
                }
              />
            </div>
          </ParamCard>
          <ParamCard label={t('params.type')}>
            <Select
              value={cf.type}
              onValueChange={(v) =>
                updateOneTimeCashflow(cf.id, { type: v as 'contribution' | 'withdrawal' })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contribution">{t('params.contribution')}</SelectItem>
                <SelectItem value="withdrawal">{t('params.withdrawal')}</SelectItem>
              </SelectContent>
            </Select>
          </ParamCard>
          <ParamCard label={t('params.date')}>
            <Input
              type="date"
              value={cf.date}
              onChange={(e) => updateOneTimeCashflow(cf.id, { date: e.target.value })}
            />
          </ParamCard>
          <Button
            variant="destructive"
            size="icon"
            className="mt-7"
            onClick={() => removeOneTimeCashflow(cf.id)}
            title={t('common.delete')}
            aria-label={t('common.delete')}
          >
            <X />
          </Button>
        </ParamRow>
      ))}
      {(parameters.oneTimeCashflows || []).length === 0 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={addOneTimeCashflow}>
          + {t('params.addOneTimeCashflow')}
        </Button>
      )}
    </ParamGroup>
  );
}
