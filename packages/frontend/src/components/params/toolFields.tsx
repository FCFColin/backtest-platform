import { Checkbox } from '@/components/ui/uiComponents';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

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
