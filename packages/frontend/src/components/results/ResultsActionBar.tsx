import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Bookmark, Bell, Save, Download, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/uiComponents.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/uiComponents.js';
import { PlanBadge } from '@/components/layout/PlanBadge.js';
import { cn } from '@/lib/utils.js';
interface ResultsActionBarProps {
  timeRange: { start: string; end: string; years: number };
  onRefresh?: () => void;
  onShare?: () => void;
  onSaveBacktest?: () => void;
  onEmailAlerts?: () => void;
  onSavePortfolio?: () => void;
  onExport?: (format: 'csv' | 'json' | 'png' | 'pdf') => void;
}
interface ActionBarActionsProps {
  onRefresh?: () => void;
  onShare?: () => void;
  onSaveBacktest?: () => void;
  onEmailAlerts?: () => void;
  onSavePortfolio?: () => void;
  onExport?: (format: 'csv' | 'json' | 'png' | 'pdf') => void;
}
function ActionBarActions({ onRefresh, onShare, onSaveBacktest, onEmailAlerts, onSavePortfolio, onExport }: ActionBarActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} title={t('results.actionBar.refresh')}>
        <RefreshCw className="h-4 w-4" />
      </Button>
      <div className="w-px h-5 bg-border mx-1" />
      <Button variant="ghost" size="sm" onClick={onShare}>
        <Link className="h-4 w-4 mr-1.5" /> {t('results.actionBar.share')}
      </Button>
      <Button variant="ghost" size="sm" onClick={onSaveBacktest}>
        <Bookmark className="h-4 w-4 mr-1.5" /> {t('results.actionBar.saveBacktest')}
      </Button>
      <Button variant="ghost" size="sm" onClick={onEmailAlerts}>
        <Bell className="h-4 w-4 mr-1.5" /> {t('results.actionBar.emailAlerts')}
        <PlanBadge tier="pro" className="ml-1.5" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onSavePortfolio}>
        <Save className="h-4 w-4 mr-1.5" /> {t('results.actionBar.savePortfolio')}
      </Button>
      <div className="w-px h-5 bg-border mx-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4 mr-1.5" />
            {t('results.actionBar.export')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onExport?.('csv')}>{t('results.actionBar.exportCsv')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport?.('json')}>{t('results.actionBar.exportJson')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport?.('png')}>{t('results.actionBar.exportPng')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport?.('pdf')}>{t('results.actionBar.exportPdf')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
export function ResultsActionBar(props: ResultsActionBarProps) {
  const { t } = useTranslation();
  const [sticky, setSticky] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setSticky(!entry.isIntersecting), {
      threshold: 0
    });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div ref={sentinelRef} className="h-0" />
      <div className={cn('transition-all duration-200', sticky ? 'sticky top-0 z-40 h-14 bg-sticky-bg/95 backdrop-blur-md border-b border-border shadow-md' : 'h-14 bg-transparent border-b border-border-subtle')}>
        <div className="max-w-[1440px] mx-auto h-full px-6 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-h3">{t('results.actionBar.title')}</h2>
            <span className="text-caption text-fg-tertiary font-mono tabular-nums">
              {t('results.actionBar.timeRange', {
                years: props.timeRange.years.toFixed(2),
                start: props.timeRange.start,
                end: props.timeRange.end
              })}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Info className="h-3.5 w-3.5 text-fg-tertiary" />
            </Button>
          </div>
          <div className="flex-1" />
          <ActionBarActions onRefresh={props.onRefresh} onShare={props.onShare} onSaveBacktest={props.onSaveBacktest} onEmailAlerts={props.onEmailAlerts} onSavePortfolio={props.onSavePortfolio} onExport={props.onExport} />
        </div>
      </div>
    </>
  );
}
