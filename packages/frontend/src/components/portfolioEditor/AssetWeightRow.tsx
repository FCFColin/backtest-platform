/**
 * @file AssetWeightRow 组件
 * @description 单行资产配置：ticker Input（大写 mono）+ weight Input（右对齐数字）+ % + 删除按钮。
 *   下方显示 ticker 名称（通过 useTickerMeta hook 获取）。
 */
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input.js';
import { Button } from '@/components/ui/button.js';
import { INPUT_WIDTHS } from '@/lib/layout-widths.js';
import { useTickerMeta } from '@/hooks/useTickerMeta.js';
import { cn } from '@/lib/utils.js';

interface AssetWeightRowProps {
  asset: { ticker: string; weight: number };
  onUpdate: (asset: { ticker: string; weight: number }) => void;
  onDelete: () => void;
}

/**
 * 单行资产配置组件。
 * @param props - asset/onUpdate/onDelete。
 * @returns 资产行元素，含 ticker 名称副行。
 */
export function AssetWeightRow({ asset, onUpdate, onDelete }: AssetWeightRowProps) {
  const meta = useTickerMeta(asset.ticker);

  return (
    <div className="group">
      <div className="flex items-center gap-2">
        <Input
          value={asset.ticker}
          onChange={(e) => onUpdate({ ...asset, ticker: e.target.value.toUpperCase() })}
          placeholder="VTI"
          className={cn(INPUT_WIDTHS.ticker, 'font-mono uppercase h-9')}
        />
        <Input
          type="number"
          value={asset.weight}
          onChange={(e) => onUpdate({ ...asset, weight: Number(e.target.value) })}
          className={cn(INPUT_WIDTHS.weight, 'font-mono tabular-nums text-right h-9')}
          min={0}
          max={100}
          step={0.1}
        />
        <span className="text-caption text-fg-tertiary w-4">%</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:text-danger"
          onClick={onDelete}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {meta?.name && (
        <div className="text-caption text-fg-tertiary mt-0.5 ml-1 truncate">{meta.name}</div>
      )}
    </div>
  );
}
