import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  DATE_TICK_FORMATTER,
  getCorrelationColor,
} from '@/lib/chart-theme.js';
import { ChartXAxis, ChartYAxis, ChartTooltip, ChartLegend } from './ChartAxis.js';
import { MatrixHeatmap } from './tables.js';
import { SimpleTable, type SimpleTableColumn } from '../SimpleTable.js';
import {
  getCorrelationTextColor,
  type RollingCorrelationPoint,
  type BetaRow,
} from './correlationDataTransforms.js';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions.js';
import { useChartCalcWorker, type WorkerTask } from '../../hooks/useWorkerCompute.js';
interface CorrelationMatrixProps {
  tickers: string[];
  correlations: number[][];
  title?: string;
}
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
  background: 'var(--bg-elevated)',
};
const ROLLING_WINDOWS = [20, 60, 120, 252];
function NoDataCard({ message }: { message: string }) {
  return (
    <div className="chart-card">
      <div className="text-label" style={{ color: 'var(--text-muted)' }}>
        {message}
      </div>
    </div>
  );
}
export function CorrelationMatrix({ tickers, correlations, title }: CorrelationMatrixProps) {
  const { t } = useTranslation();
  if (tickers.length === 0 || correlations.length === 0) {
    return <NoDataCard message={t('charts.correlation.noData')} />;
  }
  return (
    <div className="chart-card">
      <div className="chart-card-title">{title || t('charts.correlation.defaultTitle')}</div>
      <MatrixHeatmap
        rowLabels={tickers}
        columnLabels={tickers}
        matrix={correlations}
        getBackgroundColor={getCorrelationColor}
        getTextColor={getCorrelationTextColor}
        formatValue={(v) => v.toFixed(2)}
      />
    </div>
  );
}
function BetaTable({ betaData, baseName }: { betaData: BetaRow[]; baseName: string }) {
  const { t } = useTranslation();
  if (betaData.length === 0) return null;
  const columns: SimpleTableColumn<BetaRow>[] = [
    {
      key: 'name',
      label: t('charts.correlation.portfolio'),
      render: (row, idx) => (
        <>
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: CHART_COLORS[(idx + 1) % CHART_COLORS.length] }}
          />
          {row.name}
        </>
      ),
    },
    { key: 'beta', label: 'Beta', align: 'right', render: (row) => row.beta.toFixed(4) },
  ];
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('charts.correlation.betaTableTitle', { baseName })}</div>
      <SimpleTable columns={columns} data={betaData} maxWidth={400} rowKey={(r) => r.name} />
    </div>
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
function RollingCorrelationControls({
  portfolios,
  selectedPair,
  rollingWindow,
  onSelectPair,
  onSetWindow,
}: {
  portfolios: PortfolioResult[];
  selectedPair: [number, number] | null;
  rollingWindow: number;
  onSelectPair: (pair: [number, number] | null) => void;
  onSetWindow: (w: number) => void;
}) {
  const { t } = useTranslation();
  const setA = (i: number) =>
    onSelectPair(selectedPair ? [i, selectedPair[1]] : [i, i === 0 ? 1 : 0]);
  const setB = (j: number) => onSelectPair(selectedPair ? [selectedPair[0], j] : [0, j]);
  const labels = [
    {
      key: 'charts.correlation.portfolioA',
      value: selectedPair ? selectedPair[0] : 0,
      onChange: setA,
    },
    {
      key: 'charts.correlation.portfolioB',
      value: selectedPair ? selectedPair[1] : 1,
      onChange: setB,
    },
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
        {t('charts.correlation.windowDays')}
      </span>
      <select
        aria-label={t('charts.correlation.windowDays')}
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
  const chartData = data.length > DOWNSAMPLE_THRESHOLD ? downsample(data, DOWNSAMPLE_TARGET) : data;
  const isLargeDataset = chartData.length >= 100;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <ChartXAxis tickFontSize={10} interval="preserveStartEnd" />
        <ChartYAxis domain={[-1, 1]} tickFormatter={(v: number) => v.toFixed(1)} />
        <ChartTooltip
          formatter={(value: number, name: string) => [
            value.toFixed(4),
            name || t('charts.correlation.correlation'),
          ]}
          labelFormatter={(label: string) => t('charts.correlation.dateLabel', { label })}
          isLargeDataset={isLargeDataset}
        />
        <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
        <ReferenceLine y={1} stroke="var(--border-soft)" strokeDasharray="1 3" />
        <ReferenceLine y={-1} stroke="var(--border-soft)" strokeDasharray="1 3" />
        <Line
          type="monotone"
          dataKey="correlation"
          stroke={CHART_COLORS[0]}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 5, stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
          name={pairName}
          isAnimationActive={!isLargeDataset}
        />
        <ChartLegend />
        {chartData.length > 100 && (
          <Brush
            dataKey="date"
            height={20}
            stroke="var(--brand)"
            travellerWidth={8}
            tickFormatter={DATE_TICK_FORMATTER}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="text-caption"
      style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}
    >
      {message}
    </div>
  );
}
function RollingCorrelationSection({
  portfolios,
  selectedPair,
  rollingWindow,
  onSelectPair,
  onSetWindow,
}: {
  portfolios: PortfolioResult[];
  selectedPair: [number, number] | null;
  rollingWindow: number;
  onSelectPair: (pair: [number, number] | null) => void;
  onSetWindow: (w: number) => void;
}) {
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
      title={t('charts.correlation.rollingTitle')}
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
      {isPending && (
        <div className="flex items-center justify-center py-5">
          <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent text-fg-tertiary" />
        </div>
      )}
      {!isPending && !selectedPair && (
        <EmptyState message={t('charts.correlation.selectTwoPortfolios')} />
      )}
      {!isPending &&
        selectedPair &&
        (!rollingCorrelationData || rollingCorrelationData.length === 0) && (
          <EmptyState
            message={t('charts.correlation.insufficientData', { window: rollingWindow })}
          />
        )}
      {!isPending &&
        selectedPair &&
        rollingCorrelationData &&
        rollingCorrelationData.length > 0 && (
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
    return <NoDataCard message={t('charts.correlation.needTwoAssets')} />;
  }
  return (
    <div>
      {hasAssetCorrelation && (
        <CorrelationMatrix
          tickers={assetTickers!}
          correlations={assetCorrelations!}
          title={t('charts.correlation.assetCorrelationTitle')}
        />
      )}
      {hasPortfolioCorrelation && (
        <CorrelationMatrix
          tickers={portfolios.map((p) => p.name)}
          correlations={portfolioCorrelations ?? []}
          title={t('charts.correlation.portfolioCorrelationTitle')}
        />
      )}
      {betaPending ? (
        <div className="chart-card flex items-center justify-center py-5">
          <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent text-fg-tertiary" />
        </div>
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
