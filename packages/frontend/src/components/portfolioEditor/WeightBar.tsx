/**
 * @file 权重相关共享组件
 * @description AllocationBar（分配条）+ TotalWeightBlock（总权重块），供 PortfolioEditor 和 PortfolioCardV2 复用。
 */
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';

/**
 * 资产分配条：按权重堆叠的细条，未满 100% 时露出轨道。
 * @param props - assets（资产列表）+ tw（当前总权重）
 */
export function AllocationBar({ assets, tw }: { assets: { ticker: string; weight: number; id?: string }[]; tw: number }) {
  const scale = tw > 100 ? 100 / tw : 1;
  return (
    <div
      className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-input-bg"
      role="img"
      aria-label="allocation"
    >
      <div className="flex h-full">
        {assets.map((a, i) =>
          a.weight > 0 ? (
            <div
              key={a.id ?? i}
              className="h-full shrink-0"
              style={{
                width: `${a.weight * scale}%`,
                backgroundColor: getPortfolioColor(i),
              }}
              title={`${a.ticker || '?'} ${a.weight}%`}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

/**
 * 总权重状态块：达标绿色 / 未达标红色。
 * @param props - tw（当前总权重）+ isComplete（权重是否达到 100%）
 */
export function TotalWeightBlock({ tw, isComplete }: { tw: number; isComplete: boolean }) {
  return (
    <div
      className={cn(
        'flex h-8 w-[96px] shrink-0 items-center justify-end rounded-md border px-2.5 font-mono text-caption tabular-nums',
        isComplete
          ? 'border-success/40 bg-success/5 text-success'
          : 'border-danger/40 bg-danger/5 text-danger',
      )}
    >
      {Number.isInteger(tw) ? tw : tw.toFixed(2)}%
    </div>
  );
}
