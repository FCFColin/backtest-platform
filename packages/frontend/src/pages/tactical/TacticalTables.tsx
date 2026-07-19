import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { WhatIfResult, TacticalStrategy } from '@backtest/shared/types/tactical';
import type { TFunction } from 'i18next';
import LoadingButton from '../../components/LoadingButton.js';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type Column } from '../../components/SortableTable.js';
import { TABLE_TH_STYLE, TABLE_TD_STYLE } from '../../components/tableStyles.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { apiPostJSON } from '@/utils/apiClient';
import { fmtPrice, whatIfSignalColor, whatIfSignalLabel } from './tacticalResultUtils.js';
import type { BacktestResponse } from './TacticalUtils.js';

function buildWhatIfColumns(t: TFunction): Column<WhatIfResult>[] {
  return [
    { key: 'ticker', label: t('tactical.results.ticker'), sortValue: (r) => r.ticker },
    {
      key: 'currentPrice',
      label: t('tactical.results.latestPrice'),
      sortValue: (r) => r.currentPrice,
      render: (r) => <span className="font-mono">{fmtPrice(r.currentPrice)}</span>,
    },
    { key: 'signalDate', label: t('tactical.results.signalDate'), sortValue: (r) => r.signalDate },
    {
      key: 'signalType',
      label: t('tactical.results.signalStatus'),
      sortValue: (r) => r.signalType,
      render: (r) => (
        <span style={{ color: whatIfSignalColor(r.signalType), fontWeight: 600 }}>
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
    <ChartCard title={t('tactical.results.signalHistoryTitle')}>
      <div className="overflow-x-auto" style={{ maxHeight: 400, overflowY: 'auto' }}>
        <table className="w-full border-collapse">
          <thead style={{ position: 'sticky', top: 0 }}>
            <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <th className="text-[12px] font-semibold text-left py-2 px-3" style={TABLE_TH_STYLE}>
                {t('tactical.results.date')}
              </th>
              <th className="text-[12px] font-semibold text-left py-2 px-3" style={TABLE_TH_STYLE}>
                {t('tactical.results.activeSignals')}
              </th>
              <th className="text-[12px] font-semibold text-right py-2 px-3" style={TABLE_TH_STYLE}>
                {t('tactical.results.targetWeights')}
              </th>
            </tr>
          </thead>
          <tbody>
            {signalHistory.map((h, idx) => (
              <tr
                key={idx}
                style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td className="text-[13px] py-2 px-3 font-mono" style={TABLE_TD_STYLE}>
                  {h.date}
                </td>
                <td className="text-[13px] py-2 px-3" style={TABLE_TD_STYLE}>
                  {h.activeSignals.length > 0 ? (
                    h.activeSignals.join(', ')
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {t('tactical.results.noneEqualWeight')}
                    </span>
                  )}
                </td>
                <td
                  className="text-[13px] py-2 px-3 text-right font-mono"
                  style={{ ...TABLE_TD_STYLE, color: 'var(--text-strong)' }}
                >
                  {h.weights.map((w) => `${w.ticker}: ${(w.weight * 100).toFixed(1)}%`).join('  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
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
    <div className="space-y-4">
      <ChartCard title={t('tactical.results.whatIfTitle')}>
        <div className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
          {t('tactical.results.whatIfDesc')}
        </div>
        <div className="ticker-row" style={{ marginBottom: 12 }}>
          <input
            type="text"
            className="ticker-input"
            style={{ flex: 1 }}
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder={t('tactical.results.whatIfPlaceholder')}
          />
          <LoadingButton
            isLoading={isLoading}
            onClick={handleQuery}
            loadingText={t('tactical.results.whatIfQuerying')}
            className="main-action-btn"
            style={{ minHeight: 40, padding: '0 16px' }}
          >
            <Search className="w-4 h-4" />
            {t('tactical.results.whatIfQuery')}
          </LoadingButton>
        </div>
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        {results.length > 0 && (
          <SortableTable
            columns={columns}
            data={results}
            initialSortKey="ticker"
            initialSortDir="asc"
          />
        )}
        {results.length === 0 && !error && !isLoading && (
          <div
            style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32, fontSize: 13 }}
          >
            {t('tactical.results.whatIfHint')}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

export { SignalHistoryTable, WhatIfTab };
