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
function CashflowTypeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CashflowLeg['type'];
  onChange: (v: CashflowLeg['type']) => void;
}) {
  const { t } = useTranslation();
  return (
    <ParamCard label={label}>
      <Select value={value} onValueChange={(v) => onChange(v as CashflowLeg['type'])}>
        <SelectTrigger className="w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="contribution">{t('Contribution')}</SelectItem>
          <SelectItem value="withdrawal">{t('Withdrawal')}</SelectItem>
        </SelectContent>
      </Select>
    </ParamCard>
  );
}
function AmountField({
  value,
  currency,
  onChange,
  absolute,
}: {
  value: number | undefined;
  currency: string | undefined;
  onChange: (amount: number) => void;
  absolute?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ParamCard label={t('Amount')}>
      <AffixInput
        type="number"
        value={value || ''}
        placeholder="0"
        prefix={currency === 'usd' ? '$' : '¥'}
        className="w-[140px]"
        onChange={(e) =>
          onChange(absolute ? Math.abs(Number(e.target.value) || 0) : Number(e.target.value) || 0)
        }
      />
    </ParamCard>
  );
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
          <SelectItem value="yearly">{t('Annual')}</SelectItem>
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
      <AmountField
        value={leg.amount}
        currency={currency}
        onChange={(amount) => updateCashflowLeg(leg.id, { amount })}
      />
      <CashflowTypeSelect
        label={t('Cashflow Type')}
        value={leg.type}
        onChange={(type) => updateCashflowLeg(leg.id, { type })}
      />
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
          <AmountField
            value={cf.amount}
            currency={parameters.baseCurrency}
            absolute
            onChange={(amount) => updateOneTimeCashflow(cf.id, { amount })}
          />
          <CashflowTypeSelect
            label={t('Type')}
            value={cf.type}
            onChange={(type) => updateOneTimeCashflow(cf.id, { type })}
          />
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
      <Button variant="ghost" size="sm" onClick={addOneTimeCashflow}>
        <Plus />
        {t('Add One-Time Cashflow')}
      </Button>
    </ParamGroup>
  );
}
