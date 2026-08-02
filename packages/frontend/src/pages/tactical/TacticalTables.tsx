import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { WhatIfResult, TacticalStrategy } from '@backtest/shared/types/tactical';
import type { TFunction } from 'i18next';
import { Button, Card, Input } from '@/components/ui/uiComponents';
import { EmptyState } from '@/components/stateDisplay';
import { SortableTable, type Column } from '@/components/tables';
import { useAsyncAction } from '@/hooks/miscHooks';
import { apiPostJSON } from '@/utils/apiClient';
import { fmtPrice, whatIfSignalColor, whatIfSignalLabel } from './tacticalResultUtils';
import type { BacktestResponse } from './TacticalUtils';
function buildWhatIfColumns(t: TFunction): Column<WhatIfResult>[] {
  return [
    { key: 'ticker', label: t('tactical.results.ticker'), sortValue: (r) => r.ticker },
    {
      key: 'currentPrice',
      label: t('tactical.results.latestPrice'),
      sortValue: (r) => r.currentPrice,
      render: (r) => <span className="font-mono tabular-nums">{fmtPrice(r.currentPrice)}</span>,
    },
    { key: 'signalDate', label: t('tactical.results.signalDate'), sortValue: (r) => r.signalDate },
    {
      key: 'signalType',
      label: t('tactical.results.signalStatus'),
      sortValue: (r) => r.signalType,
      render: (r) => (
        <span className="font-semibold" style={{ color: whatIfSignalColor(r.signalType) }}>
          {whatIfSignalLabel(r.signalType, t)}
        </span>
      ),
    },
  ];
}
function SignalHistoryTable({
  signalHistory,
}: {
  signalHistory: BacktestResponse['signalHistory'];
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">{t('tactical.results.signalHistoryTitle')}</h3>
      <div className="max-h-[400px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-elevated">
            <tr>
              <th className="border-b border-border-strong px-3 py-2 text-left text-caption font-semibold text-fg-tertiary">
                {t('tactical.results.date')}
              </th>
              <th className="border-b border-border-strong px-3 py-2 text-left text-caption font-semibold text-fg-tertiary">
                {t('tactical.results.activeSignals')}
              </th>
              <th className="border-b border-border-strong px-3 py-2 text-right text-caption font-semibold text-fg-tertiary">
                {t('tactical.results.targetWeights')}
              </th>
            </tr>
          </thead>
          <tbody>
            {signalHistory.map((h, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-input-bg/40' : 'bg-transparent'}>
                <td className="border-b border-border-subtle px-3 py-2 text-label font-mono tabular-nums text-fg">
                  {h.date}
                </td>
                <td className="border-b border-border-subtle px-3 py-2 text-label text-fg-secondary">
                  {h.activeSignals.length > 0 ? (
                    h.activeSignals.join(', ')
                  ) : (
                    <span className="text-fg-tertiary">
                      {t('tactical.results.noneEqualWeight')}
                    </span>
                  )}
                </td>
                <td className="border-b border-border-subtle px-3 py-2 text-right text-label font-mono tabular-nums text-fg">
                  {h.weights.map((w) => `${w.ticker}: ${(w.weight * 100).toFixed(1)}%`).join('  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function WhatIfTab({ strategy }: { strategy: TacticalStrategy }) {
  const { t } = useTranslation();
  const [tickerInput, setTickerInput] = useState('SPY, TLT, GLD');
  const [results, setResults] = useState<WhatIfResult[]>([]);
  const { isLoading, error, run, setError } = useAsyncAction();
  const columns = buildWhatIfColumns(t);
  const handleQuery = () => {
    const tickers = tickerInput
      .split(/[\s,]+/)
      .map((tk) => tk.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) {
      setError(t('tactical.results.whatIfEmptyError'));
      return;
    }
    run(async () => {
      const data = await apiPostJSON<WhatIfResult[]>(
        '/api/v1/tactical/what-if',
        { tickers, strategy },
        t('tactical.results.whatIfFailed'),
      );
      setResults(data ?? []);
    });
  };
  return (
    <Card className="p-4">
      <h3 className="mb-1 text-h3 text-fg">{t('tactical.results.whatIfTitle')}</h3>
      <p className="mb-3 text-caption text-fg-tertiary">{t('tactical.results.whatIfDesc')}</p>
      <div className="mb-3 flex gap-2">
        <Input
          type="text"
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value)}
          placeholder={t('tactical.results.whatIfPlaceholder')}
          className="flex-1"
        />
        <Button variant="primary" onClick={handleQuery} disabled={isLoading}>
          <Search className="size-4" />
          {isLoading ? t('tactical.results.whatIfQuerying') : t('tactical.results.whatIfQuery')}
        </Button>
      </div>
      {error && <p className="mb-3 text-caption text-danger">{error}</p>}
      {results.length > 0 && (
        <SortableTable
          columns={columns}
          data={results}
          initialSortKey="ticker"
          initialSortDir="asc"
        />
      )}
      {results.length === 0 && !error && !isLoading && (
        <EmptyState title={t('tactical.results.whatIfHint')} className="py-10" />
      )}
    </Card>
  );
}
export { SignalHistoryTable, WhatIfTab };
