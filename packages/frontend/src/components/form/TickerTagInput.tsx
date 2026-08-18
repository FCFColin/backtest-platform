import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { normalizeTicker } from '@/utils/ticker';
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
            title={t('Remove')}
            aria-label={t('Remove {{ticker}}', { ticker: tk })}
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
}: {
  tickers: string[];
  onChange: (tickers: string[]) => void;
  minCount?: number;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const ph = placeholder ?? t('Enter a ticker and press Enter to add...');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addTicker = (raw: string): boolean => {
    const code = normalizeTicker(raw);
    if (!code) {
      if (raw.trim()) setError(t('Enter a valid ticker first'));
      return false;
    }
    if (tickers.includes(code)) {
      setError(t('{{ticker}} is already added', { ticker: code }));
      return false;
    }
    onChange([...tickers, code]);
    setError(null);
    return true;
  };
  const removeTicker = (idx: number) => {
    if (tickers.length <= minCount) return;
    onChange(tickers.filter((_, i) => i !== idx));
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (addTicker(input)) setInput('');
    } else if (e.key === 'Backspace' && input === '' && tickers.length > 0)
      removeTicker(tickers.length - 1);
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const next = [...tickers];
    for (const raw of e.clipboardData.getData('text').split(/[\s,;]+/)) {
      const code = normalizeTicker(raw);
      if (code && !next.includes(code)) next.push(code);
    }
    onChange(next);
    setInput('');
  };
  return (
    <>
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
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (addTicker(input)) setInput('');
          }}
          placeholder={tickers.length === 0 ? ph : ''}
          aria-label={ph}
          aria-invalid={error !== null}
          className="h-7 min-w-[140px] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus:border-0 focus:ring-0"
        />
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger mt-1">
          {error}
        </p>
      )}
    </>
  );
}
