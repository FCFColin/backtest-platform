import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AffixInput } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
import TickerInput from './TickerInput.js';
import { cn } from '@/lib/utils';
import i18n from '@/i18n/index.js';
interface WeightInputProps {
  value: number;
  onChange: (num: number) => void;
  ticker?: string;
  tickerPlaceholder?: string;
  onTickerChange?: (ticker: string) => void;
  onDelete?: () => void;
  tickerList?: string[];
}
function WeightNumberInput({ value, onChange, className }: { value: number; onChange: (num: number) => void; className?: string }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => {
    const num = parseFloat(raw);
    if (isNaN(num) || Math.abs(num - value) > 0.001) {
      setRaw(String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在外部 value 变化时同步，读取 raw 仅为比较，不作为触发条件
  }, [value]);
  return (
    <AffixInput
      type="text"
      inputMode="decimal"
      value={raw}
      suffix="%"
      onChange={(e) => {
        const newRaw = e.target.value;
        setRaw(newRaw);
        if (newRaw === '' || newRaw === '-' || newRaw === '.' || newRaw === '-.') return;
        const num = parseFloat(newRaw);
        if (!isNaN(num)) {
          onChange(num);
        }
      }}
      onBlur={() => {
        const num = parseFloat(raw);
        const normalized = isNaN(num) ? 0 : num;
        onChange(normalized);
        setRaw(String(normalized));
      }}
      aria-label={i18n.t('ariaLabels.weightInput')}
      className={cn('h-8 text-right font-mono tabular-nums', className)}
    />
  );
}
export default function WeightInput({ value, onChange, ticker, tickerPlaceholder, onTickerChange, onDelete }: WeightInputProps) {
  if (ticker !== undefined && onDelete && onTickerChange) {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TickerInput value={ticker} placeholder={tickerPlaceholder} onChange={onTickerChange} className="h-8 font-mono uppercase" />
        </div>
        <div className="w-[96px] shrink-0">
          <WeightNumberInput value={value} onChange={onChange} className="w-full" />
        </div>
        <Button variant="destructive" size="icon" className="h-8 w-8 shrink-0" aria-label="delete holding" onClick={onDelete}>
          <X />
        </Button>
      </div>
    );
  }
  return <WeightNumberInput value={value} onChange={onChange} className="w-[80px]" />;
}
