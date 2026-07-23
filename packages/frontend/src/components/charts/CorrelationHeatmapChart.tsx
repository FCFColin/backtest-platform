/**
 * @file 相关性矩阵热力图
 * @description 展示投资组合内各资产间的收益相关系数矩阵，以颜色深浅表示相关性强弱
 */
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
} from './chartConstants.js';
import { ChartXAxis, ChartYAxis, ChartTooltip, ChartLegend } from './ChartAxis.js';
import { MatrixHeatmap } from './MatrixHeatmap.js';
import { SimpleTable, type SimpleTableColumn } from '../SimpleTable.js';
import {
  computeDailyReturns,
  computeBeta,
  computeRollingCorrelation,
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

/** 相关性矩阵 Props */
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

export function CorrelationMatrix({ tickers, correlations, title }: CorrelationMatrixProps) {
  const { t } = useTranslation();
  if (tickers.length === 0 || correlations.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {t('charts.correlation.noData')}
        </div>
      </div>
    );
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

const selectStyle: React.CSSProperties = {
  height: 28,
  padding: '2px 8px',
  fontSize: 12,
  border: '1px solid var(--border-soft)',
  borderRadius: 4,
  color: 'var(--text-body)',
  background: 'var(--bg-elevated)',
};

/** Beta 值表格 */
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
    {
      key: 'beta',
      label: 'Beta',
      align: 'right',
      render: (row) => row.beta.toFixed(4),
    },
  ];
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('charts.correlation.betaTableTitle', { baseName })}</div>
      <SimpleTable columns={columns} data={betaData} maxWidth={400} rowKey={(r) => r.name} />
    </div>
  );
}

/** 滚动相关性选择器 */
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
  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {t('charts.correlation.portfolioA')}
        </span>
        <select
          value={selectedPair ? selectedPair[0] : 0}
          onChange={(e) => {
            const i = parseInt(e.target.value);
            onSelectPair(selectedPair ? [i, selectedPair[1]] : [i, i === 0 ? 1 : 0]);
          }}
          style={selectStyle}
        >
          {portfolios.map((p, idx) => (
            <option key={p.name} value={idx}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {t('charts.correlation.portfolioB')}
        </span>
        <select
          value={selectedPair ? selectedPair[1] : 1}
          onChange={(e) => {
            const j = parseInt(e.target.value);
            onSelectPair(selectedPair ? [selectedPair[0], j] : [0, j]);
          }}
          style={selectStyle}
        >
          {portfolios.map((p, idx) => (
            <option key={p.name} value={idx}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {t('charts.correlation.windowDays')}
        </span>
        <select
          value={rollingWindow}
          onChange={(e) => onSetWindow(parseInt(e.target.value))}
          style={selectStyle}
        >
          <option value={20}>20</option>
          <option value={60}>60</option>
          <option value={120}>120</option>
          <option value={252}>252</option>
        </select>
      </div>
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
  const rollingCorrelationData = useMemo(() => {
    if (!selectedPair || portfolios.length < 2) return [];
    const [i, j] = selectedPair;
    if (i === j) return [];
    const aReturns = computeDailyReturns(portfolios[i].growthCurve);
    const bReturns = computeDailyReturns(portfolios[j].growthCurve);
    const dates = portfolios[i].growthCurve.slice(1).map((p) => p.date);
    return computeRollingCorrelation(aReturns, bReturns, dates, rollingWindow);
  }, [portfolios, selectedPair, rollingWindow]);

  const pairName = selectedPair
    ? `${portfolios[selectedPair[0]].name} vs ${portfolios[selectedPair[1]].name}`
    : '';

  return (
    <ChartCard
      title={t('charts.correlation.rollingTitle')}
      data={rollingCorrelationData}
      csvFilename="rolling-correlation"
    >
      <RollingCorrelationControls
        portfolios={portfolios}
        selectedPair={selectedPair}
        rollingWindow={rollingWindow}
        onSelectPair={onSelectPair}
        onSetWindow={onSetWindow}
      />
      {!selectedPair && (
        <div
          className="text-[12px]"
          style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}
        >
          {t('charts.correlation.selectTwoPortfolios')}
        </div>
      )}
      {selectedPair && rollingCorrelationData.length === 0 && (
        <div
          className="text-[12px]"
          style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}
        >
          {t('charts.correlation.insufficientData', { window: rollingWindow })}
        </div>
      )}
      {selectedPair && rollingCorrelationData.length > 0 && (
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

  const betaData = useMemo(() => {
    if (portfolios.length < 2) return [];
    const baseReturns = computeDailyReturns(portfolios[0].growthCurve);
    return portfolios.slice(1).map((p) => ({
      name: p.name,
      beta: computeBeta(baseReturns, computeDailyReturns(p.growthCurve)),
    }));
  }, [portfolios]);

  const hasAssetCorrelation =
    assetTickers && assetTickers.length >= 2 && assetCorrelations && assetCorrelations.length >= 2;
  const hasPortfolioCorrelation = portfolios.length >= 2;

  if (!hasAssetCorrelation && !hasPortfolioCorrelation) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {t('charts.correlation.needTwoAssets')}
        </div>
      </div>
    );
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
      <BetaTable betaData={betaData} baseName={portfolios[0]?.name ?? ''} />
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
