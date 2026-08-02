import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
interface TickerTagInputProps {
  tickers: string[];
  onChange: (tickers: string[]) => void;
  minCount?: number;
  placeholder?: string;
}
function TickerChips({
  tickers,
  onRemove,
}: {
  tickers: string[];
  onRemove: (idx: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {tickers.map((tk, idx) => (
        <Badge
          key={`${tk}-${idx}`}
          variant="asset"
          size="sm"
          className="animate-in fade-in zoom-in-50 duration-150 uppercase"
        >
          <span>{tk}</span>
          <Button
            type="button"
            variant="icon"
            size="icon"
            onClick={() => onRemove(idx)}
            title={t('components.tickerTagInput.remove')}
            aria-label={t('components.tickerTagInput.removeTicker', { ticker: tk })}
            className="h-3.5 w-3.5 p-0 [&_svg]:size-3 opacity-70 hover:opacity-100"
          >
            <X />
          </Button>
        </Badge>
      ))}
    </>
  );
}
export function TickerTagInput({
  tickers,
  onChange,
  minCount = 2,
  placeholder,
}: TickerTagInputProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('components.tickerTagInput.placeholder');
  const [input, setInput] = useState('');
  const addTicker = (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || tickers.includes(code)) return;
    onChange([...tickers, code]);
  };
  const removeTicker = (idx: number) => {
    if (tickers.length <= minCount) return;
    onChange(tickers.filter((_, i) => i !== idx));
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) {
        addTicker(input);
        setInput('');
      }
    } else if (e.key === 'Backspace' && input === '' && tickers.length > 0) {
      removeTicker(tickers.length - 1);
    }
  };
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 p-2',
        'bg-input-bg border border-border rounded-lg',
        'min-h-10 transition-colors duration-150',
        'hover:border-border-strong',
        'focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15',
      )}
    >
      <TickerChips tickers={tickers} onRemove={removeTicker} />
      <Input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (input.trim()) {
            addTicker(input);
            setInput('');
          }
        }}
        placeholder={tickers.length === 0 ? resolvedPlaceholder : ''}
        aria-label={resolvedPlaceholder}
        className={cn(
          'h-7 min-w-[140px] flex-1 border-0 bg-transparent px-1 shadow-none',
          'focus-visible:ring-0 focus:border-0 focus:ring-0',
        )}
      />
    </div>
  );
}
