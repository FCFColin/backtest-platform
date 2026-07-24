/**
 * @file 标签式标的代码输入组件
 * @description 适用于不需要权重的场景（PCA、优化器候选池等）。
 *   标的以 Badge chip 形式横排展示，回车或逗号添加，点击 ✕ 删除。
 *   基于 shadcn Badge + Input 重构为暗色金融平台主题。
 */
import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TickerTagInputProps {
  /** 当前标的列表 */
  tickers: string[];
  /** 更新标的列表的回调 */
  onChange: (tickers: string[]) => void;
  /** 最少标的数量，低于此数不允许删除 */
  minCount?: number;
  /** placeholder 文案 */
  placeholder?: string;
}

/**
 * 标签式标的输入。回车或逗号添加标的，Backspace 在空输入时删除最后一个。
 * @param props - 见 TickerTagInputProps
 * @returns 渲染的标签输入容器
 */
export function TickerTagInput({
  tickers,
  onChange,
  minCount = 2,
  placeholder = '输入代码回车添加...',
}: TickerTagInputProps) {
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
        'focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15'
      )}
    >
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
            onClick={() => removeTicker(idx)}
            title="移除"
            aria-label={`移除 ${tk}`}
            className="h-3.5 w-3.5 p-0 [&_svg]:size-3 opacity-70 hover:opacity-100"
          >
            <X />
          </Button>
        </Badge>
      ))}
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
        placeholder={tickers.length === 0 ? placeholder : ''}
        aria-label={placeholder}
        className={cn(
          'h-7 min-w-[140px] flex-1 border-0 bg-transparent px-1 shadow-none',
          'focus-visible:ring-0 focus:border-0 focus:ring-0'
        )}
      />
    </div>
  );
}
