import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { PortfolioResult, Statistics } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/uiComponents.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/uiComponents.js';
import { fmtPct } from '@/utils/format.js';
const HORIZON_LABELS = ['stats.horizon10y', 'stats.horizon20y', 'stats.horizon30y', 'stats.horizon40y'] as const;
const RATE_ROWS = [
  {
    labelKey: 'stats.swr',
    descKey: 'stats.swrDesc',
    keys: ['swr10y', 'swr20y', 'swr30y', 'swr40y'] as const
  },
  {
    labelKey: 'stats.pwr',
    descKey: 'stats.pwrDesc',
    keys: ['pwr10y', 'pwr20y', 'pwr30y', 'pwr40y'] as const
  }
] as const;
export interface WithdrawalRatesCardProps {
  portfolios: PortfolioResult[];
}
function hasWithdrawalData(portfolios: PortfolioResult[]): boolean {
  return portfolios.some((p) =>
    RATE_ROWS.some((row) =>
      row.keys.some((k) => {
        const v = p.statistics[k];
        return v != null && v !== 0;
      })
    )
  );
}
export function WithdrawalRatesCard({ portfolios }: WithdrawalRatesCardProps) {
  const { t } = useTranslation();
  if (!hasWithdrawalData(portfolios)) return null;
  const showName = portfolios.length > 1;
  return (
    <Card data-testid="withdrawal-rates-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-h3">{t('components.statisticsTable.groups.withdrawalRate')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {portfolios.map((p, idx) => {
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          return (
            <div key={p.name} className="space-y-2">
              {showName && (
                <div className="flex items-center gap-2 text-caption text-fg-secondary">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="truncate">{p.name}</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="h-9 pr-3 text-left text-label-tiny text-fg-tertiary" />
                      {HORIZON_LABELS.map((label) => (
                        <th key={label} className="h-9 px-2 text-right text-label-tiny text-fg-tertiary">
                          {t(label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RATE_ROWS.map((row) => (
                      <tr key={row.labelKey} className="border-b border-border-subtle last:border-b-0">
                        <td className="py-2 pr-3 text-left">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-fg-secondary">{t(row.labelKey)}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="size-3 cursor-help text-fg-tertiary" aria-label={t(row.descKey)} />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs rounded-md border border-border bg-elevated p-2 text-caption text-fg-secondary leading-relaxed shadow-lg whitespace-normal">{t(row.descKey)}</TooltipContent>
                            </Tooltip>
                          </span>
                        </td>
                        {row.keys.map((k) => (
                          <td key={k} data-testid={`withdrawal-rate-${k}`} className="px-2 py-2 text-right font-mono tabular-nums text-fg">
                            {fmtPct(p.statistics[k as keyof Statistics] as number)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
