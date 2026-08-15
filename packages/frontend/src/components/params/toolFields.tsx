import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/uiComponents';
import { SectionHeader } from '@/components/form/sharedFields';
import { TickerTagInput } from '@/components/form/TickerTagInput.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

export function AssetSelectionField({
  tickers,
  onChange,
  minCount,
  title,
  info,
}: {
  tickers: string[];
  onChange: (v: string[]) => void;
  minCount: number;
  title: string;
  info?: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={title} info={info} />
      <TickerTagInput
        tickers={tickers}
        onChange={onChange}
        minCount={minCount}
        placeholder={t('Enter ticker, e.g. VTI')}
      />
    </section>
  );
}

export function AllHistoryCheckbox({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  label,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  label: string;
}) {
  const allHistory = startDate === '' && endDate === '';
  return (
    <label className="flex cursor-pointer items-center gap-2 text-label text-fg-secondary">
      <Checkbox
        checked={allHistory}
        onCheckedChange={(c) => {
          if (c) {
            onStartDateChange('');
            onEndDateChange('');
          } else {
            onStartDateChange(DEFAULT_BACKTEST_START_DATE);
            onEndDateChange(DEFAULT_END_DATE);
          }
        }}
      />
      {label}
    </label>
  );
}
