import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/uiComponents.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/uiComponents.js';
import { cn } from '@/lib/utils.js';
import { formatISODate } from '@/utils/format.js';
interface ResultsActionBarProps {
  timeRange: { start: string; end: string; years: number };
  onExport?: (format: 'csv' | 'json') => void;
}
export function ResultsActionBar({ timeRange, onExport }: ResultsActionBarProps) {
  const { t } = useTranslation();
  const [sticky, setSticky] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setSticky(!entry.isIntersecting), {
      threshold: 0,
    });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);
  const years = Number.isInteger(timeRange.years) ? timeRange.years : +timeRange.years.toFixed(1);
  return (
    <>
      <div ref={sentinelRef} className="h-0" />
      <div
        className={cn(
          'transition-all duration-200',
          sticky
            ? 'sticky top-15 z-40 h-14 bg-sticky-bg/95 backdrop-blur-md border-b border-border shadow-md'
            : 'h-14 bg-transparent border-b border-border-subtle',
        )}
      >
        <div className="max-w-[1440px] mx-auto h-full px-6 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-h3">{t('Results')}</h2>
            <span className="text-caption text-fg-tertiary font-mono tabular-nums">
              {t('{{years}} yrs · {{start}} to {{end}}', {
                years,
                start: formatISODate(timeRange.start),
                end: formatISODate(timeRange.end),
              })}
            </span>
          </div>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                {t('Export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport?.('csv')}>
                {t('CSV (Data)')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport?.('json')}>
                {t('JSON (Full Config + Results)')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}
