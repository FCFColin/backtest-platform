/**
 * @file StatisticsTableV2 组件
 * @description 17 列横向统计表格：列排序 + 列隐藏 + sticky 首列 + 横向滚动。
 *   数字 font-mono tabular-nums text-right，正负色 text-pos/text-neg。
 */
import { useState } from 'react';
import { ArrowUp, ArrowDown, Download, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu.js';
import { cn } from '@/lib/utils.js';
import { formatCurrency, formatPercent, formatDuration, formatNumber } from '@/lib/formatters.js';

interface StatColumn {
  key: string;
  label: string;
  format: 'currency' | 'percent' | 'duration' | 'number' | 'text';
  colorize?: boolean;
  sticky?: 'left' | 'right';
  minWidth?: string;
}

const DEFAULT_COLUMNS: StatColumn[] = [
  { key: 'name', label: '组合', format: 'text', sticky: 'left', minWidth: '140px' },
  { key: 'endingValue', label: '终值', format: 'currency' },
  { key: 'totalContributions', label: '总投入', format: 'currency' },
  { key: 'cumulativeReturn', label: '累计收益', format: 'percent', colorize: true },
  { key: 'cagr', label: 'CAGR', format: 'percent', colorize: true },
  { key: 'mwrr', label: 'MWRR', format: 'percent', colorize: true },
  { key: 'maxDrawdown', label: '最大回撤', format: 'percent', colorize: true },
  { key: 'avgDrawdown', label: '平均回撤', format: 'percent', colorize: true },
  { key: 'longestDrawdown', label: '最长回撤', format: 'duration' },
  { key: 'volatility', label: '波动率', format: 'percent' },
  { key: 'sharpe', label: '夏普', format: 'number' },
  { key: 'sortino', label: '索提诺', format: 'number' },
  { key: 'calmar', label: '卡尔玛', format: 'number' },
  { key: 'ulcerIndex', label: 'Ulcer', format: 'number' },
  { key: 'upi', label: 'UPI', format: 'number' },
  { key: 'diversificationRatio', label: '分散比', format: 'number' },
  { key: 'beta', label: 'Beta', format: 'number' },
];

/** 统计列 key → data-testid 映射，供契约校验脚本定位指标值单元格 */
const STAT_KEY_TO_TESTID: Record<string, string> = {
  endingValue: 'stat-ending-value',
  cagr: 'stat-cagr',
  mwrr: 'stat-mwrr',
  maxDrawdown: 'stat-max-drawdown',
  avgDrawdown: 'stat-avg-drawdown',
  volatility: 'stat-volatility',
  sharpe: 'stat-sharpe',
  sortino: 'stat-sortino',
  calmar: 'stat-calmar',
  ulcerIndex: 'stat-ulcer',
  upi: 'stat-upi',
  diversificationRatio: 'stat-diversification',
  beta: 'stat-beta',
};

interface StatisticsTableV2Props {
  portfolios: Array<{
    id: string;
    name: string;
    stats: Record<string, number | string>;
  }>;
  colors: string[];
  onExport?: () => void;
  extendedTable?: React.ReactNode;
}

/**
 * 17 列统计表格 V2。
 * @param props - portfolios/colors/onExport/extendedTable。
 * @returns 统计表格元素。
 */
export function StatisticsTableV2({
  portfolios,
  colors,
  onExport,
  extendedTable,
}: StatisticsTableV2Props) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const visibleColumns = DEFAULT_COLUMNS.filter((c) => !hiddenColumns.has(c.key));

  const sortedPortfolios = [...portfolios].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a.stats[sortKey] as number;
    const bv = b.stats[sortKey] as number;
    if (typeof av !== 'number' || typeof bv !== 'number') return 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const getColorClass = (value: number): string => {
    if (value > 0) return 'text-pos';
    if (value < 0) return 'text-neg';
    return 'text-fg';
  };

  const renderCell = (portfolio: (typeof portfolios)[0], col: StatColumn, index: number) => {
    if (col.key === 'name') {
      return (
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: colors[index] ?? '#888' }}
          />
          <span className="truncate">{portfolio.name}</span>
        </div>
      );
    }
    const value = portfolio.stats[col.key];
    if (value === undefined || value === null) return '—';
    switch (col.format) {
      case 'currency':
        return formatCurrency(Number(value));
      case 'percent':
        return formatPercent(Number(value));
      case 'duration':
        return formatDuration(Number(value));
      case 'number':
        return formatNumber(Number(value));
      default:
        return String(value);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-h3">统计概览</h3>
          <span className="text-caption text-fg-tertiary">
            {portfolios.length} 个组合 · {visibleColumns.length} 列
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-caption"
          >
            {expanded ? '收起详细指标' : '展开详细指标 (+30 列)'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {DEFAULT_COLUMNS.filter((c) => c.key !== 'name').map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={!hiddenColumns.has(col.key)}
                  onCheckedChange={(checked) => {
                    const next = new Set(hiddenColumns);
                    if (checked) next.delete(col.key);
                    else next.add(col.key);
                    setHiddenColumns(next);
                  }}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={onExport}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead>
              <tr className="bg-surface-sunken border-b border-border">
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'h-10 px-3 text-fg-tertiary text-label-tiny',
                      col.format === 'text' ? 'text-left' : 'text-right',
                      col.sticky === 'left' && 'sticky left-0 bg-surface-sunken z-10',
                    )}
                    style={{ minWidth: col.minWidth }}
                  >
                    <button
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-fg transition-colors',
                        col.format !== 'text' && 'ml-auto',
                      )}
                      onClick={() => {
                        if (sortKey === col.key) {
                          setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortKey(col.key);
                          setSortDir('desc');
                        }
                      }}
                    >
                      {col.label}
                      {sortKey === col.key &&
                        (sortDir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        ))}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPortfolios.map((p, i) => (
                <tr
                  key={p.id}
                  className={cn(
                    'h-12 border-b border-border-subtle',
                    'hover:bg-hover/50 transition-colors',
                    i === sortedPortfolios.length - 1 && 'border-b-0',
                  )}
                >
                  {visibleColumns.map((col) => {
                    const value = col.key === 'name' ? p.name : (p.stats[col.key] as number);
                    return (
                      <td
                        key={col.key}
                        data-testid={STAT_KEY_TO_TESTID[col.key]}
                        className={cn(
                          'px-3',
                          col.format === 'text' ? 'text-left' : 'text-right',
                          col.format !== 'text' && 'font-mono tabular-nums',
                          col.sticky === 'left' && 'sticky left-0 bg-surface z-10',
                          col.colorize && typeof value === 'number' && getColorClass(value),
                        )}
                      >
                        {renderCell(p, col, i)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {expanded && extendedTable}
    </div>
  );
}
