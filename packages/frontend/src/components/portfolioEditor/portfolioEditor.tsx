import { useState, useEffect } from 'react';
import { useNsT } from '@/hooks/miscHooks.js';
import { useBacktestStore } from '@/store/backtestStore';
import { Button } from '@/components/ui/uiComponents';
import { Play as PlayIcon, Loader2, Check } from '@/icons/icons.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils';
export { GlidepathForm } from './portfolioEditorFields.js';
export { PortfolioCard } from './portfolioEditorCard.js';

export type StorePortfolio = ReturnType<typeof useBacktestStore.getState>['portfolios'][number];
export type TFunc = (key: string) => string;
interface RunBacktestButtonProps {
  onRun: () => void;
  isRunning: boolean;
  runComplete: boolean;
  elapsedMs?: number;
}
export function RunBacktestButton({
  onRun,
  isRunning,
  runComplete,
  elapsedMs,
}: RunBacktestButtonProps) {
  const { t } = useNsT('backtest');
  const [showComplete, setShowComplete] = useState(false);
  useEffect(() => {
    if (!runComplete) return;
    setShowComplete(true);
    const timer = setTimeout(() => setShowComplete(false), 3000);
    return () => clearTimeout(timer);
  }, [runComplete]);
  if (isRunning)
    return (
      <Button variant="primary" size="default" disabled className="min-w-[160px]">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        {t('backtest.running')}
      </Button>
    );
  if (showComplete)
    return (
      <Button
        variant="primary"
        size="default"
        className={cn(
          'min-w-[160px] bg-success hover:bg-success text-white',
          'animate-in fade-in-0 zoom-in-95 duration-200',
        )}
        disabled
      >
        <Check className="h-4 w-4 mr-2" />
        {elapsedMs
          ? t('backtest.completeWithTime', { seconds: (elapsedMs / 1000).toFixed(1) })
          : t('backtest.complete')}
      </Button>
    );
  return (
    <Button variant="primary" size="default" onClick={onRun} className="min-w-[160px]">
      <PlayIcon className="h-4 w-4 mr-2" />
      {t('backtest.run')}
    </Button>
  );
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
