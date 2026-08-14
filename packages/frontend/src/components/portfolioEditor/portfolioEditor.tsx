import { useBacktestStore } from '@/store/backtestStore';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
import type { Portfolio } from '@backtest/shared';
export { GlidepathForm } from './portfolioEditorFields.js';
export { PortfolioCard } from './portfolioEditorCard.js';

export type StorePortfolio = ReturnType<typeof useBacktestStore.getState>['portfolios'][number];
export type TFunc = (key: string) => string;
export interface PortfolioFieldProps {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}
export function AllocationBar({
  assets,
  tw,
}: {
  assets: { ticker: string; weight: number; id?: string }[];
  tw: number;
}) {
  const scale = tw > 100 ? 100 / tw : 1;
  return (
    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-input-bg">
      <div className="flex h-full">
        {assets.map((a, i) =>
          a.weight > 0 ? (
            <div
              key={a.id ?? i}
              className="h-full shrink-0"
              style={{ width: `${a.weight * scale}%`, backgroundColor: getPortfolioColor(i) }}
              title={`${a.ticker || '?'} ${a.weight}%`}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
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
