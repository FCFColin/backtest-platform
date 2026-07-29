/**
 * @file RunBacktestButton 组件
 * @description 三态运行按钮：idle → running → complete（3秒后消失）。
 *   产品活力信号，状态转换要明显。
 */
import { useState, useEffect } from 'react';
import { Play, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface RunBacktestButtonProps {
  onRun: () => void;
  isRunning: boolean;
  runComplete: boolean;
  elapsedMs?: number;
}

/**
 * 三态运行回测按钮。
 * @param props - onRun/isRunning/runComplete/elapsedMs。
 * @returns 按钮元素，状态自动切换。
 */
export function RunBacktestButton({ onRun, isRunning, runComplete, elapsedMs }: RunBacktestButtonProps) {
  const { t } = useTranslation();
  const [showComplete, setShowComplete] = useState(false);

  useEffect(() => {
    if (runComplete) {
      setShowComplete(true);
      const timer = setTimeout(() => setShowComplete(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [runComplete]);

  if (isRunning) {
    return (
      <Button variant="primary" size="default" disabled className="min-w-[160px]">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        {t('backtest.running')}
      </Button>
    );
  }

  if (showComplete) {
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
        {elapsedMs ? t('backtest.completeWithTime', { seconds: (elapsedMs / 1000).toFixed(1) }) : t('backtest.complete')}
      </Button>
    );
  }

  return (
    <Button variant="primary" size="default" onClick={onRun} className="min-w-[160px]">
      <Play className="h-4 w-4 mr-2" />
      {t('backtest.run')}
    </Button>
  );
}
