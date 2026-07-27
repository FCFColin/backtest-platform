/**
 * @file ResultsActionBar 组件
 * @description 智能 Sticky 操作栏：IntersectionObserver 检测结果区可见性。
 *   h-14 bg-sticky-bg/95 backdrop-blur-md，左：标题+时间范围，右：操作按钮+导出。
 */
import { useEffect, useState, useRef } from 'react';
import { Link, Bookmark, Bell, Save, Download, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu.js';
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

/**
 * 智能 Sticky 结果操作栏。
 * @param props - timeRange + 5 个回调 + onExport。
 * @returns 操作栏元素（含 sentinel）。
 */
export function ResultsActionBar(props: ResultsActionBarProps) {
  const [sticky, setSticky] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setSticky(!entry.isIntersecting), {
      threshold: 0,
    });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="h-0" />
      <div
        className={cn(
          'transition-all duration-200',
          sticky
            ? 'sticky top-0 z-40 h-14 bg-sticky-bg/95 backdrop-blur-md border-b border-border shadow-md'
            : 'h-14 bg-transparent border-b border-border-subtle',
        )}
      >
        <div className="max-w-[1440px] mx-auto h-full px-6 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-h3">结果</h2>
            <span className="text-caption text-fg-tertiary font-mono tabular-nums">
              {props.timeRange.years.toFixed(2)} 年 · {props.timeRange.start} 至{' '}
              {props.timeRange.end}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Info className="h-3.5 w-3.5 text-fg-tertiary" />
            </Button>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={props.onRefresh}
              title="刷新"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button variant="ghost" size="sm" onClick={props.onShare}>
              <Link className="h-4 w-4 mr-1.5" /> 分享
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onSaveBacktest}>
              <Bookmark className="h-4 w-4 mr-1.5" /> 保存回测
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onEmailAlerts}>
              <Bell className="h-4 w-4 mr-1.5" /> 邮件提醒
              <PlanBadge tier="pro" className="ml-1.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onSavePortfolio}>
              <Save className="h-4 w-4 mr-1.5" /> 保存组合
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Download className="h-4 w-4 mr-1.5" />
                  导出
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => props.onExport?.('csv')}>
                  CSV (数据)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onExport?.('json')}>
                  JSON (完整配置+结果)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onExport?.('png')}>
                  PNG (图表)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => props.onExport?.('pdf')}>
                  PDF (报告)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </>
  );
}
