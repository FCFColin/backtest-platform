/**
 * @file 权重输入组件（可扩展为 HoldingRow）
 * @description 投资组合权重输入框，支持百分比输入及中间状态容错。
 *   - 默认模式：仅渲染权重 Input（向后兼容旧调用方）。
 *   - HoldingRow 模式：当传入 ticker/onDelete 时，渲染完整持产行
 *     （TickerInput 自适应占满 + 权重 Input（% 内嵌） + 删除按钮），用于组合编辑器资产行。
 *   基于 shadcn Input / Button 重构为暗色金融平台主题；数字使用 tabular-nums 等宽对齐。
 *   注意：保留 type="text" + inputMode="decimal" 以允许 '-'/''.'/'-.' 等中间输入状态，
 *   切换为 type="number" 会破坏中间态容错逻辑。
 */
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AffixInput } from '@/components/ui/affix-input';
import { Button } from '@/components/ui/button';
import TickerInput from './TickerInput.js';
import { cn } from '@/lib/utils';

/** 权重输入框 Props */
interface WeightInputProps {
  /** 权重数值（0-100） */
  value: number;
  /** 权重变更回调 */
  onChange: (num: number) => void;
  /** 持产行模式：标的代码。传入则启用 HoldingRow 渲染 */
  ticker?: string;
  /** 标的代码输入占位文案 */
  tickerPlaceholder?: string;
  /** 标的代码变更回调 */
  onTickerChange?: (ticker: string) => void;
  /** 删除持产行回调；与 ticker 同时传入时启用删除按钮 */
  onDelete?: () => void;
  /** 预留：标的候选列表（供未来自动补全过滤） */
  tickerList?: string[];
}

/**
 * 权重数字输入子组件：本地 state 管理原始字符串，允许空值、负号等中间输入状态。
 * % 后缀内嵌于输入框右缘。
 * @param props - value/onChange/className
 * @returns 渲染的权重输入框
 */
function WeightNumberInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (num: number) => void;
  className?: string;
}) {
  const [raw, setRaw] = useState(String(value));

  // 外部 value 变更时同步（避免输入中间状态被覆盖）
  useEffect(() => {
    const num = parseFloat(raw);
    // 只有当外部值和当前解析值差异较大时才同步
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
        // 允许中间输入状态，不同步到 store
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
      aria-label="weight"
      className={cn('h-8 text-right font-mono tabular-nums', className)}
    />
  );
}

/**
 * 权重输入组件
 * - 默认模式：仅渲染权重 Input
 * - HoldingRow 模式（传入 ticker + onDelete）：渲染 TickerInput + 权重 Input + 删除 Button
 * @param props - 见 WeightInputProps
 * @returns 渲染的权重输入框或持产行
 */
export default function WeightInput({
  value,
  onChange,
  ticker,
  tickerPlaceholder,
  onTickerChange,
  onDelete,
}: WeightInputProps) {
  // HoldingRow 模式：ticker 与 onDelete 同时存在时渲染完整持产行
  if (ticker !== undefined && onDelete && onTickerChange) {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TickerInput
            value={ticker}
            placeholder={tickerPlaceholder}
            onChange={onTickerChange}
            className="h-8 font-mono uppercase"
          />
        </div>
        <div className="w-[96px] shrink-0">
          <WeightNumberInput value={value} onChange={onChange} className="w-full" />
        </div>
        <Button
          variant="destructive"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="delete holding"
          onClick={onDelete}
        >
          <X />
        </Button>
      </div>
    );
  }

  // 向后兼容：仅渲染权重输入框
  return <WeightNumberInput value={value} onChange={onChange} className="w-[80px]" />;
}
