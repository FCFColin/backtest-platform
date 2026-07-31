import { memo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import { Switch } from '@/components/ui/uiComponents';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/uiComponents';
import { FloatingLabelInput } from '@/components/form/FloatingLabelInput.js';
import { FloatingLabelSelect } from '@/components/form/FloatingLabelSelect.js';
import { FloatingLabelDate } from '@/components/form/FloatingLabelDate.js';
import TickerInput from './TickerInput.js';
import { validateDateChange } from './backtestParamsUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { CashflowLegsSection, OneTimeCashflowSection } from './BacktestParamsForm.CashflowLegs.js';
import { cn } from '@/lib/utils';
import type { TFunction } from 'i18next';
export interface TFunctionProp {
  t: TFunction;
}
function useParamField() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return { t, parameters, updateParameter };
}
function SwitchRow({ label, description, checked, onCheckedChange }: { label: string; description?: string; checked: boolean | undefined; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Switch checked={checked ?? false} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <div className="flex-1">
        <div className="text-body text-fg">{label}</div>
        {description && <div className="text-caption text-fg-tertiary mt-0.5">{description}</div>}
      </div>
    </div>
  );
}
const CURRENCY_OPTIONS = [
  { value: 'usd', label: 'USD ($)' },
  { value: 'cny', label: 'CNY (¥)' }
];
 
function BasicParamsGrid() {
  const { t, parameters, updateParameter } = useParamField();
  const dateRangeMode = parameters.startDate === '' && parameters.endDate === '' ? 'all' : 'custom';
  const handleDateRangeChange = (value: string) => {
    if (value === 'all') {
      updateParameter('startDate', '');
      updateParameter('endDate', '');
    } else {
      updateParameter('startDate', DEFAULT_BACKTEST_START_DATE);
      updateParameter('endDate', DEFAULT_END_DATE);
    }
  };
  const handleNum = (key: 'startingValue' | 'rollingWindowMonths', e: ChangeEvent<HTMLInputElement>) => updateParameter(key, Math.max(1, Number(e.target.value) || 0));
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <FloatingLabelDate
        label={t('params.startDate')}
        value={parameters.startDate || DEFAULT_BACKTEST_START_DATE}
        disabled={dateRangeMode === 'all'}
        onChange={(e) => {
          const err = validateDateChange('startDate', e.target.value, parameters.endDate, t);
          if (err) {
            useToastStore.getState().addToast('warning', err);
            return;
          }
          updateParameter('startDate', e.target.value);
        }}
      />
      <FloatingLabelDate
        label={t('params.endDate')}
        value={parameters.endDate || DEFAULT_END_DATE}
        disabled={dateRangeMode === 'all'}
        onChange={(e) => {
          const err = validateDateChange('endDate', e.target.value, parameters.startDate, t);
          if (err) {
            useToastStore.getState().addToast('warning', err);
            return;
          }
          updateParameter('endDate', e.target.value);
        }}
      />
      <FloatingLabelInput label={t('params.startingValue')} type="number" value={parameters.startingValue} min={1} step="any" onChange={(e) => handleNum('startingValue', e)} prefix={parameters.baseCurrency === 'usd' ? '$' : '¥'} />
      <FloatingLabelInput label={t('params.rollingWindow')} type="number" value={parameters.rollingWindowMonths} min={1} max={120} step={1} onChange={(e) => handleNum('rollingWindowMonths', e)} suffix={t('params.months')} />
      <FloatingLabelSelect
        label={t('params.dateRange')}
        value={dateRangeMode}
        onValueChange={handleDateRangeChange}
        options={[
          { value: 'all', label: t('params.allHistory') },
          { value: 'custom', label: t('params.customRange') }
        ]}
      />
      <FloatingLabelSelect label={t('params.currency')} value={parameters.baseCurrency} onValueChange={(v) => updateParameter('baseCurrency', v as 'usd' | 'cny')} options={CURRENCY_OPTIONS} />
    </div>
  );
}
function AdvancedParamsSection({ advancedOpen, setAdvancedOpen }: { advancedOpen: boolean; setAdvancedOpen: (v: boolean) => void }) {
  const { t, parameters, updateParameter } = useParamField();
  const benchmarkEnabled = parameters.benchmarkTicker !== '';
  return (
    <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-body text-fg-secondary hover:text-fg transition-colors">
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', advancedOpen && 'rotate-180')} />
        {t('params.advanced')}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-border-subtle">
          <SwitchRow label={t('params.adjustForInflation')} checked={parameters.adjustForInflation} onCheckedChange={(v) => updateParameter('adjustForInflation', v)} />
          <SwitchRow label={t('params.extendedWithdrawalStats')} checked={parameters.extendedWithdrawalStats} onCheckedChange={(v) => updateParameter('extendedWithdrawalStats', v)} />
          <div className="flex items-start gap-3 py-2">
            <Switch checked={benchmarkEnabled} onCheckedChange={(v) => updateParameter('benchmarkTicker', v ? 'SPY' : '')} className="mt-0.5" />
            <div className="flex-1">
              <div className="text-body text-fg">{t('params.pickBenchmarkTicker')}</div>
              {benchmarkEnabled && (
                <div className="mt-1 w-[130px]">
                  <TickerInput value={parameters.benchmarkTicker} onChange={(v) => updateParameter('benchmarkTicker', v)} placeholder="SPY" />
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
function BasicParamsSection() {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <BasicParamsGrid />
      <AdvancedParamsSection advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen} />
    </div>
  );
}
const BacktestParamsForm = memo(function BacktestParamsForm() {
  return (
    <>
      <BasicParamsSection />
      <CashflowLegsSection />
      <OneTimeCashflowSection />
    </>
  );
});
export default BacktestParamsForm;
