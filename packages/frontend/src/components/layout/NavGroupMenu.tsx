/**
 * @file 导航分组配置与渲染
 * @description 合并自 navConfig.ts（NAV_GROUP_KEYS 路由分组数据）与 NavGroupMenu.tsx（NavGroup 渲染器）。
 *   路由分组数据与渲染器紧密耦合：NavGroup 直接消费 NAV_GROUP_KEYS 类型与 items 结构。
 *   NavGroup 使用 shadcn DropdownMenu 实现子菜单，受控开关由父级管理以保证同时只开一个分组。
 */
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ============ 导航分组配置 ============

export const NAV_GROUP_KEYS = [
  {
    key: 'backtest',
    items: [
      { to: '/', key: 'portfolioBacktest' },
      { to: '/backtest-optimizer', key: 'backtestOptimizer' },
      { to: '/rebalancing-sensitivity', key: 'rebalancingSensitivity' },
      { to: '/lumpsum-vs-dca', key: 'lumpSumDca' },
      { to: '/comparison', key: 'portfolioComparison' },
    ],
  },
  {
    key: 'analysisOptimization',
    items: [
      { to: '/analysis', key: 'assetAnalysis' },
      { to: '/factor-regression', key: 'factorRegression' },
      { to: '/pca', key: 'pca' },
      { to: '/optimizer', key: 'portfolioOptimize' },
      { to: '/efficient-frontier', key: 'efficientFrontier' },
      { to: '/monte-carlo', key: 'monteCarlo' },
      { to: '/goal-optimizer', key: 'goalOptimizer' },
    ],
  },
  {
    key: 'tacticalSignal',
    items: [
      { to: '/tactical', key: 'tacticalAllocation' },
      { to: '/tactical-grid', key: 'tacticalGrid' },
      { to: '/signal-analyzer', key: 'signalAnalyzer' },
      { to: '/dual-signal', key: 'dualSignal' },
      { to: '/multi-signal', key: 'multiSignal' },
      { to: '/letf-slippage', key: 'letfAnalysis' },
      { to: '/calculators', key: 'calculators' },
    ],
  },
] as const;

// ============ NavGroup 渲染器 ============

/**
 * 导航分组组件：触发按钮 + 下拉子菜单（shadcn DropdownMenu）。
 * 受控模式：父级通过 isOpen/onToggle 控制开合，保证同时只展开一个分组。
 * @param props - group/isActive/isOpen/onToggle/t。
 * @returns 导航分组元素。
 */
export function NavGroup({
  group,
  isActive,
  isOpen,
  onToggle,
  t,
}: {
  group: (typeof NAV_GROUP_KEYS)[number];
  isActive: (to: string) => boolean;
  isOpen: boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
}) {
  const groupActive = group.items.some((item) => isActive(item.to));
  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => onToggle(open ? group.key : '')}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'h-9 px-2.5 text-label text-fg-secondary hover:bg-hover hover:text-fg [&_svg]:size-3',
            groupActive && 'text-fg'
          )}
        >
          {t(`nav.${group.key}`)}
          <ChevronDown className={cn('transition-transform duration-150', isOpen && 'rotate-180')} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        {group.items.map((item) => {
          const active = isActive(item.to);
          return (
            <DropdownMenuItem asChild key={item.to} className={cn(active && 'text-brand')}>
              <Link to={item.to}>{t(`nav.${item.key}`)}</Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
