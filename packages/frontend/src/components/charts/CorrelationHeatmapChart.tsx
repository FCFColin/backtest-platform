import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/uiComponents';
import { TableEmpty } from '@/components/stateDisplay.js';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import { CorrelationMatrixTable } from './tables.js';
import { SimpleTable, type SimpleTableColumn } from '../tables.js';
import { type RollingCorrelationPoint, type BetaRow } from './chartUtils.js';
import { type PortfolioResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import ChartCard from '../ChartCard.js';
import { useChartCalcWorker, type WorkerTask } from '../../hooks/miscHooks.js';
interface CorrelationWithBetaProps {
  portfolios: PortfolioResult[];
  assetTickers?: string[];
  assetCorrelations?: number[][];
  portfolioCorrelations?: number[][];
}
const selectStyle: React.CSSProperties = {
  height: 28,
  padding: '2px 8px',
  fontSize: 12,
  border: '1px solid var(--border-soft)',
  borderRadius: 4,
  color: 'var(--text-body)',
  background: 'var(--bg-surface)',
};
const ROLLING_WINDOWS = [20, 60, 120, 252];

function BetaTable({ betaData, baseName }: { betaData: BetaRow[]; baseName: string }) {
  const { t } = useTranslation();
  if (betaData.length === 0) return null;
  const columns: SimpleTableColumn<BetaRow>[] = [
    {
      key: 'name',
      label: t('Portfolio'),
      render: (row, idx) => (
        <>
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: getPortfolioColor(idx + 1) }}
          />
          {row.name}
        </>
      ),
    },
    { key: 'beta', label: 'Beta', align: 'right', render: (row) => row.beta.toFixed(4) },
  ];
  return (
    <ChartCard title={t('Beta Table (Benchmark: {{baseName}})', { baseName })}>
      <SimpleTable columns={columns} data={betaData} maxWidth={400} rowKey={(r) => r.name} />
    </ChartCard>
  );
}
function PairSelect({
  ariaLabel,
  value,
  onChange,
  portfolios,
}: {
  ariaLabel: string;
  value: number;
  onChange: (v: number) => void;
  portfolios: PortfolioResult[];
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      style={selectStyle}
    >
      {portfolios.map((p, idx) => (
        <option key={p.name} value={idx}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
type RollingCorrelationProps = {
  portfolios: PortfolioResult[];
  selectedPair: [number, number] | null;
  rollingWindow: number;
  onSelectPair: (pair: [number, number] | null) => void;
  onSetWindow: (w: number) => void;
};
function RollingCorrelationControls({
  portfolios,
  selectedPair,
  rollingWindow,
  onSelectPair,
  onSetWindow,
}: RollingCorrelationProps) {
  const { t } = useTranslation();
  const setA = (i: number) =>
    onSelectPair(selectedPair ? [i, selectedPair[1]] : [i, i === 0 ? 1 : 0]);
  const setB = (j: number) => onSelectPair(selectedPair ? [selectedPair[0], j] : [0, j]);
  const labels = [
    { key: 'charts.correlation.portfolioA', value: selectedPair?.[0] ?? 0, onChange: setA },
    { key: 'charts.correlation.portfolioB', value: selectedPair?.[1] ?? 1, onChange: setB },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      {labels.map((l) => (
        <span key={l.key} style={{ display: 'contents' }}>
          <span className="text-caption" style={{ color: 'var(--text-muted)' }}>
            {t(l.key)}
          </span>
          <PairSelect
            ariaLabel={t(l.key)}
            value={l.value}
            onChange={l.onChange}
            portfolios={portfolios}
          />
        </span>
      ))}
      <span className="text-caption" style={{ color: 'var(--text-muted)' }}>
        {t('Window (days)')}
      </span>
      <select
        aria-label={t('Window (days)')}
        value={rollingWindow}
        onChange={(e) => onSetWindow(parseInt(e.target.value))}
        style={selectStyle}
      >
        {ROLLING_WINDOWS.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
    </div>
  );
}
function RollingCorrelationLineChart({
  data,
  pairName,
}: {
  data: RollingCorrelationPoint[];
  pairName: string;
}) {
  const { t } = useTranslation();
  return (
    <TimeSeriesLineChart
      data={data}
      series={[{ dataKey: 'value', legendName: pairName, strokeWidth: 1.5 }]}
      height={300}
      yTickFormatter={(v: number) => v.toFixed(1)}
      tooltipValueFormatter={(v, name) => [v.toFixed(4), name || t('Correlation')]}
      tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
      yDomain={[-1, 1]}
      referenceY={0}
      showBrush
    />
  );
}
function RollingCorrelationSection({
  portfolios,
  selectedPair,
  rollingWindow,
  onSelectPair,
  onSetWindow,
}: RollingCorrelationProps) {
  const { t } = useTranslation();
  const task = useMemo<WorkerTask | null>(() => {
    if (!selectedPair || portfolios.length < 2 || selectedPair[0] === selectedPair[1]) return null;
    return {
      type: 'buildRollingCorrelationData',
      payload: [
        { growthCurve: portfolios[selectedPair[0]].growthCurve },
        { growthCurve: portfolios[selectedPair[1]].growthCurve },
        rollingWindow,
      ],
    };
  }, [portfolios, selectedPair, rollingWindow]);
  const { data: rollingCorrelationData, isPending } =
    useChartCalcWorker<RollingCorrelationPoint[]>(task);
  const pairName = selectedPair
    ? `${portfolios[selectedPair[0]].name} vs ${portfolios[selectedPair[1]].name}`
    : '';
  return (
    <ChartCard
      title={t('Rolling Correlation')}
      data={rollingCorrelationData ?? []}
      csvFilename="rolling-correlation"
    >
      <RollingCorrelationControls
        portfolios={portfolios}
        selectedPair={selectedPair}
        rollingWindow={rollingWindow}
        onSelectPair={onSelectPair}
        onSetWindow={onSetWindow}
      />
      {isPending ? (
        <div className="flex items-center justify-center py-5">
          <Spinner />
        </div>
      ) : !selectedPair ? (
        <TableEmpty message={t('Please select two portfolios')} className="text-caption py-5" />
      ) : !rollingCorrelationData?.length ? (
        <TableEmpty
          message={t('Insufficient data (window: {{window}})', { window: rollingWindow })}
          className="text-caption py-5"
        />
      ) : (
        <RollingCorrelationLineChart data={rollingCorrelationData} pairName={pairName} />
      )}
    </ChartCard>
  );
}
export default function CorrelationWithBeta({
  portfolios,
  assetTickers,
  assetCorrelations,
  portfolioCorrelations,
}: CorrelationWithBetaProps) {
  const { t } = useTranslation();
  const [selectedPair, setSelectedPair] = useState<[number, number] | null>(null);
  const [rollingWindow, setRollingWindow] = useState(60);
  const betaTask = useMemo<WorkerTask | null>(() => {
    if (portfolios.length < 2) return null;
    return {
      type: 'buildBetaData',
      payload: [portfolios.map((p) => ({ name: p.name, growthCurve: p.growthCurve }))],
    };
  }, [portfolios]);
  const { data: betaData, isPending: betaPending } = useChartCalcWorker<BetaRow[]>(betaTask);
  const hasAssetCorrelation =
    assetTickers && assetTickers.length >= 2 && assetCorrelations && assetCorrelations.length >= 2;
  const hasPortfolioCorrelation = portfolios.length >= 2;
  if (!hasAssetCorrelation && !hasPortfolioCorrelation) {
    return (
      <ChartCard>
        <TableEmpty message={t('At least 2 assets required')} className="text-caption py-5" />
      </ChartCard>
    );
  }
  return (
    <div>
      {hasAssetCorrelation && (
        <CorrelationMatrixTable
          tickers={assetTickers!}
          correlations={assetCorrelations!}
          title={t('Asset Correlation')}
        />
      )}
      {hasPortfolioCorrelation && (
        <CorrelationMatrixTable
          tickers={portfolios.map((p) => p.name)}
          correlations={portfolioCorrelations ?? []}
          title={t('Portfolio Correlation')}
        />
      )}
      {betaPending ? (
        <ChartCard className="flex items-center justify-center py-5">
          <Spinner />
        </ChartCard>
      ) : (
        <BetaTable betaData={betaData ?? []} baseName={portfolios[0]?.name ?? ''} />
      )}
      {portfolios.length >= 2 && (
        <RollingCorrelationSection
          portfolios={portfolios}
          selectedPair={selectedPair}
          rollingWindow={rollingWindow}
          onSelectPair={setSelectedPair}
          onSetWindow={setRollingWindow}
        />
      )}
    </div>
  );
}
