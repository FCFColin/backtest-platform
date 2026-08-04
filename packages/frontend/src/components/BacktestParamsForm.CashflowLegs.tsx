import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '@/store/backtestStore';
import { Plus, X } from 'lucide-react';
import {
  AffixInput,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui/uiComponents';
import type { TFunctionProp } from './BacktestParamsForm.js';
import type { CashflowLeg } from '@backtest/shared';
import { ParamGroup, ParamRow, ParamCard } from './params/paramsLayout.js';
function RowDeleteButton({ onClick, t }: { onClick: () => void; t: TFunctionProp['t'] }) {
  return (
    <div className="flex h-10 items-center">
      <Button
        variant="destructive"
        size="icon"
        onClick={onClick}
        title={t('Delete')}
        aria-label={t('Delete')}
      >
        <X />
      </Button>
    </div>
  );
}
export function CashflowLegsSection() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const addCashflowLeg = useBacktestStore((s) => s.addCashflowLeg);
  return (
    <ParamGroup title={t('Cashflow Legs')} badge={parameters.cashflowLegs?.length || 0}>
      <ParamRow>
        <div className="flex h-10 items-center gap-2">
          <Switch id="cf-inflation-adjust" />
          <label
            htmlFor="cf-inflation-adjust"
            className="cursor-pointer text-caption text-fg-secondary"
          >
            {t('Adjust Fixed Cashflows for Inflation')}
          </label>
        </div>
        <ParamCard label={t('Annual Cashflow Growth')}>
          <AffixInput
            type="number"
            defaultValue={0}
            suffix="%"
            className="w-[104px] font-mono tabular-nums"
          />
        </ParamCard>
      </ParamRow>
      {(parameters.cashflowLegs || []).map((leg) => (
        <CashflowLegRow key={leg.id} leg={leg} currency={parameters.baseCurrency} t={t} />
      ))}
      <Button variant="ghost" size="sm" className="mt-3" onClick={addCashflowLeg}>
        <Plus />
        {t('Add Cashflow Leg')}
      </Button>
    </ParamGroup>
  );
}
interface CashflowLegRowProps extends TFunctionProp {
  leg: CashflowLeg;
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
    <ParamCard label={t('Frequency')}>
      <Select
        value={leg.frequency}
        onValueChange={(v) =>
          updateCashflowLeg(leg.id, {
            frequency: v as 'yearly' | 'monthly' | 'quarterly' | 'weekly',
          })
        }
      >
        <SelectTrigger className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yearly">{t('Yearly')}</SelectItem>
          <SelectItem value="quarterly">{t('Quarterly')}</SelectItem>
          <SelectItem value="monthly">{t('Monthly')}</SelectItem>
          <SelectItem value="weekly">{t('Weekly')}</SelectItem>
        </SelectContent>
      </Select>
    </ParamCard>
  );
}
function CashflowLegRow({ leg, currency, t }: CashflowLegRowProps) {
  const removeCashflowLeg = useBacktestStore((s) => s.removeCashflowLeg);
  const updateCashflowLeg = useBacktestStore((s) => s.updateCashflowLeg);
  return (
    <ParamRow className="mt-4">
      <ParamCard label={t('Amount')}>
        <AffixInput
          type="number"
          value={leg.amount || ''}
          placeholder="0"
          prefix={currency === 'usd' ? '$' : '¥'}
          className="w-[140px]"
          onChange={(e) => updateCashflowLeg(leg.id, { amount: Number(e.target.value) || 0 })}
        />
      </ParamCard>
      <ParamCard label={t('Cashflow Type')}>
        <Select
          value={leg.type}
          onValueChange={(v) =>
            updateCashflowLeg(leg.id, { type: v as 'contribution' | 'withdrawal' })
          }
        >
          <SelectTrigger className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contribution">{t('Contribution')}</SelectItem>
            <SelectItem value="withdrawal">{t('Withdrawal')}</SelectItem>
          </SelectContent>
        </Select>
      </ParamCard>
      <CashflowFrequencySelect leg={leg} updateCashflowLeg={updateCashflowLeg} t={t} />
      <ParamCard label={t('Offset')}>
        <Input
          type="number"
          value={leg.offset || ''}
          placeholder="0"
          className="w-[80px]"
          onChange={(e) => updateCashflowLeg(leg.id, { offset: Number(e.target.value) || 0 })}
        />
      </ParamCard>
      <ParamCard label={t('Until')}>
        <Input
          type="date"
          value={leg.until || ''}
          className="w-[150px]"
          onChange={(e) => updateCashflowLeg(leg.id, { until: e.target.value })}
        />
      </ParamCard>
      <RowDeleteButton onClick={() => removeCashflowLeg(leg.id)} t={t} />
    </ParamRow>
  );
}
export function OneTimeCashflowSection() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const addOneTimeCashflow = useBacktestStore((s) => s.addOneTimeCashflow);
  const removeOneTimeCashflow = useBacktestStore((s) => s.removeOneTimeCashflow);
  const updateOneTimeCashflow = useBacktestStore((s) => s.updateOneTimeCashflow);
  return (
    <ParamGroup title={t('One-Time Cashflow')} badge={parameters.oneTimeCashflows?.length || 0}>
      {(parameters.oneTimeCashflows || []).map((cf) => (
        <ParamRow key={cf.id} className="mb-4 last:mb-0">
          <ParamCard label={t('Amount')}>
            <AffixInput
              type="number"
              value={cf.amount || ''}
              placeholder="0"
              prefix={parameters.baseCurrency === 'usd' ? '$' : '¥'}
              className="w-[140px]"
              onChange={(e) =>
                updateOneTimeCashflow(cf.id, { amount: Math.abs(Number(e.target.value) || 0) })
              }
            />
          </ParamCard>
          <ParamCard label={t('Type')}>
            <Select
              value={cf.type}
              onValueChange={(v) =>
                updateOneTimeCashflow(cf.id, { type: v as 'contribution' | 'withdrawal' })
              }
            >
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contribution">{t('Contribution')}</SelectItem>
                <SelectItem value="withdrawal">{t('Withdrawal')}</SelectItem>
              </SelectContent>
            </Select>
          </ParamCard>
          <ParamCard label={t('Date')}>
            <Input
              type="date"
              value={cf.date}
              className="w-[150px]"
              onChange={(e) => updateOneTimeCashflow(cf.id, { date: e.target.value })}
            />
          </ParamCard>
          <RowDeleteButton onClick={() => removeOneTimeCashflow(cf.id)} t={t} />
        </ParamRow>
      ))}
      {(parameters.oneTimeCashflows || []).length === 0 && (
        <Button variant="ghost" size="sm" onClick={addOneTimeCashflow}>
          <Plus />
          {t('Add One-Time Cashflow')}
        </Button>
      )}
    </ParamGroup>
  );
}
