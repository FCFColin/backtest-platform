/* eslint-disable react-refresh/only-export-components -- hook 与组件同文件共享 */
import { Checkbox } from '@/components/ui/uiComponents';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

export function useTagDiff(
  tickers: string[],
  onAdd: () => void,
  onRemove: (i: number) => void,
  onUpdate: (i: number, v: string) => void,
) {
  return (next: string[]) => {
    const oldLen = tickers.length;
    if (next.length > oldLen) {
      onAdd();
    } else if (next.length < oldLen) {
      for (let i = 0; i < oldLen; i++) {
        if (!next.includes(tickers[i])) {
          onRemove(i);
          break;
        }
      }
    } else {
      next.forEach((tk, i) => {
        if (tk !== tickers[i]) onUpdate(i, tk);
      });
    }
  };
}

export function useEmptyRowTagChange(tickers: string[], setTickers: (v: string[]) => void) {
  return (next: string[]) => {
    const emptyRows = tickers.length - tickers.filter(Boolean).length;
    setTickers([...next, ...Array(emptyRows).fill('')]);
  };
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
