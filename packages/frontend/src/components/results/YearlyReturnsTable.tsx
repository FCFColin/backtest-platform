import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/uiComponents.js';
import { formatPercentSigned } from '@/utils/format.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { cn } from '@/lib/utils.js';
import type { PortfolioResult, TimeSeriesPoint } from '@backtest/shared';
interface YearlyReturnsTableProps {
  portfolios: PortfolioResult[];
  benchmarkGrowth?: TimeSeriesPoint[];
  benchmarkName?: string;
}
interface YearlyRow {
  year: number;
  returns: Record<string, number>;
  benchmarkReturn?: number;
  vsBenchmark?: number;
}
function computeBenchmarkAnnualReturns(benchmarkGrowth: TimeSeriesPoint[]): Map<number, number> {
  const byYear = new Map<number, { first: number; last: number }>();
  for (const point of benchmarkGrowth) {
    const year = new Date(point.date).getUTCFullYear();
    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, { first: point.value, last: point.value });
    } else {
      existing.last = point.value;
    }
  }
  const result = new Map<number, number>();
  for (const [year, { first, last }] of byYear) {
    if (first > 0) result.set(year, last / first - 1);
  }
  return result;
}
function valueColorClass(value: number | undefined): string {
  if (value === undefined) return 'text-fg-tertiary';
  if (value > 0) return 'text-pos';
  if (value < 0) return 'text-neg';
  return 'text-fg';
}
function buildYearlyRows(
  portfolios: PortfolioResult[],
  benchmarkGrowth?: TimeSeriesPoint[],
): { rows: YearlyRow[]; hasBenchmark: boolean } {
  const benchMap = benchmarkGrowth?.length
    ? computeBenchmarkAnnualReturns(benchmarkGrowth)
    : new Map<number, number>();
  const benchAvailable = benchMap.size > 0;
  const yearSet = new Set<number>();
  for (const p of portfolios) {
    for (const ar of p.annualReturns ?? []) yearSet.add(ar.year);
  }
  if (benchAvailable) {
    for (const y of benchMap.keys()) yearSet.add(y);
  }
  const sortedYears = [...yearSet].sort((a, b) => b - a);
  const rows: YearlyRow[] = sortedYears.map((year) => {
    const returns: Record<string, number> = {};
    for (const p of portfolios) {
      const ar = p.annualReturns?.find((r) => r.year === year);
      if (ar) returns[p.name] = ar.return;
    }
    const benchmarkReturn = benchMap.get(year);
    const firstReturn = returns[portfolios[0]?.name];
    const vsBenchmark =
      benchmarkReturn !== undefined && firstReturn !== undefined
        ? firstReturn - benchmarkReturn
        : undefined;
    return { year, returns, benchmarkReturn, vsBenchmark };
  });
  return { rows, hasBenchmark: benchAvailable };
}
function PortfolioHeaderCell({ name, index }: { name: string; index: number }) {
  return (
    <th className="h-10 px-3 text-right text-fg-tertiary text-label-tiny">
      <span className="inline-flex items-center gap-1.5 ml-auto">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: getPortfolioColor(index) }}
        />
        {name}
      </span>
    </th>
  );
}
function ValueCell({ value }: { value: number | undefined }) {
  return (
    <td
      className={cn('px-3 text-right font-mono tabular-nums font-medium', valueColorClass(value))}
    >
      {value !== undefined ? formatPercentSigned(value) : '—'}
    </td>
  );
}
function TableBody({
  rows,
  portfolios,
  hasBenchmark,
}: {
  rows: YearlyRow[];
  portfolios: PortfolioResult[];
  hasBenchmark: boolean;
}) {
  return (
    <tbody>
      {rows.map((row, ri) => (
        <tr
          key={row.year}
          className={cn(
            'h-10 border-b border-border-subtle',
            'hover:bg-hover/50 transition-colors',
            ri === rows.length - 1 && 'border-b-0',
          )}
        >
          <td className="px-3 text-left font-mono tabular-nums text-fg">{row.year}</td>
          {portfolios.map((p) => (
            <ValueCell key={p.name} value={row.returns[p.name]} />
          ))}
          {hasBenchmark && <ValueCell value={row.benchmarkReturn} />}
          {hasBenchmark && portfolios.length === 1 && <ValueCell value={row.vsBenchmark} />}
        </tr>
      ))}
    </tbody>
  );
}
export function YearlyReturnsTable({
  portfolios,
  benchmarkGrowth,
  benchmarkName,
}: YearlyReturnsTableProps) {
  const { t } = useTranslation();
  const { rows, hasBenchmark } = useMemo(
    () => buildYearlyRows(portfolios, benchmarkGrowth),
    [portfolios, benchmarkGrowth],
  );
  const showVsBenchmark = hasBenchmark && portfolios.length === 1;
  const positiveYears = useMemo(
    () => rows.filter((r) => (r.returns[portfolios[0]?.name] ?? 0) > 0).length,
    [rows, portfolios],
  );
  if (portfolios.length === 0) return null;
  return (
    <Card className="p-5" data-testid="yearly-returns-table">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-h3">{t('Yearly Returns')}</h3>
        <span className="text-caption text-fg-tertiary font-mono tabular-nums">
          {t('{{positive}} / {{total}} positive years', {
            positive: positiveYears,
            total: rows.length,
          })}
        </span>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead>
              <tr className="bg-surface-sunken border-b border-border">
                <th className="h-10 px-3 text-left text-fg-tertiary text-label-tiny">
                  {t('Year')}
                </th>
                {portfolios.map((p, i) => (
                  <PortfolioHeaderCell key={p.name} name={p.name} index={i} />
                ))}
                {hasBenchmark && (
                  <th className="h-10 px-3 text-right text-fg-tertiary text-label-tiny">
                    {benchmarkName ?? t('Benchmark')}
                  </th>
                )}
                {hasBenchmark && showVsBenchmark && (
                  <th className="h-10 px-3 text-right text-fg-tertiary text-label-tiny">
                    {t('vs Benchmark')}
                  </th>
                )}
              </tr>
            </thead>
            <TableBody rows={rows} portfolios={portfolios} hasBenchmark={hasBenchmark} />
          </table>
        </div>
      </div>
    </Card>
  );
}
