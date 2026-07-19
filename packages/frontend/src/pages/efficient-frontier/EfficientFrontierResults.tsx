/**
 * @file 有效前沿结果主容器
 * @description 组合散点图、配置面积图、相关性矩阵、选中点详情、最大夏普组合与参数摘要
 */
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import type { EfficientFrontierPoint } from '@backtest/shared';
import { SECTION_TITLE_STYLE } from './efficientFrontierSharedConstants.js';
import {
  LoadInBacktesterButton,
  MetricCard,
  StatCard,
  WeightAllocation,
  WeightBar,
  type FrontierResultsProps,
} from './EfficientFrontierShared.js';
import {
  CorrelationMatrixView,
  FrontierAllocations,
  FrontierScatterChart,
} from './EfficientFrontierCharts.js';

/** 选中点详情（权重条 + 收益/波动/夏普 卡） */
function SelectedPointDetail({
  selectedPoint,
  onLoadInBacktester,
}: {
  selectedPoint: EfficientFrontierPoint | null;
  onLoadInBacktester: (p: EfficientFrontierPoint) => void;
}) {
  const { t } = useTranslation();
  if (!selectedPoint) return null;
  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>
          {t('efficientFrontier.results.selectedPoint')}
        </div>
        <LoadInBacktesterButton
          onClick={() => onLoadInBacktester(selectedPoint)}
          label={t('efficientFrontier.results.load')}
          size="sm"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <WeightAllocation
          weights={selectedPoint.weights}
          title={t('efficientFrontier.results.weightAllocation')}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MetricCard
            label={t('efficientFrontier.results.expectedReturn')}
            value={`${selectedPoint.expectedReturn.toFixed(2)}%`}
            color="var(--success)"
          />
          <MetricCard
            label={t('efficientFrontier.results.expectedVolatility')}
            value={`${selectedPoint.expectedVolatility.toFixed(2)}%`}
            color="var(--warning)"
          />
          <MetricCard
            label={t('efficientFrontier.results.sharpeRatio')}
            value={selectedPoint.sharpeRatio.toFixed(2)}
            color="var(--brand)"
          />
        </div>
      </div>
    </div>
  );
}

/** 最大夏普组合区（权重条 + 收益/波动/夏普 卡） */
function MaxSharpeSection({ maxSharpe }: { maxSharpe: EfficientFrontierPoint | undefined }) {
  const { t } = useTranslation();
  if (!maxSharpe) return null;
  return (
    <>
      <div style={SECTION_TITLE_STYLE}>{t('efficientFrontier.results.maxSharpePortfolio')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>
            {t('efficientFrontier.results.weight')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(maxSharpe.weights).map(([ticker, weight], i) => (
              <WeightBar
                key={ticker}
                ticker={ticker}
                weight={weight}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MetricCard
            label={t('efficientFrontier.results.expectedReturn')}
            value={`${maxSharpe.expectedReturn.toFixed(2)}%`}
            color="var(--success)"
            padding={12}
            fontSize={16}
          />
          <MetricCard
            label={t('efficientFrontier.results.expectedVolatility')}
            value={`${maxSharpe.expectedVolatility.toFixed(2)}%`}
            color="var(--warning)"
            padding={12}
            fontSize={16}
          />
          <MetricCard
            label={t('efficientFrontier.results.sharpeRatio')}
            value={maxSharpe.sharpeRatio.toFixed(2)}
            color="var(--brand)"
            padding={12}
            fontSize={16}
          />
        </div>
      </div>
    </>
  );
}

/** 参数摘要（再平衡频率 / 是否允许现金 / 收益目标 / 求解器） */
function ParamsSummary({
  rebalanceFrequency,
  allowCash,
  returnObjective,
  solver,
}: {
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: FrontierResultsProps['returnObjective'];
  solver: FrontierResultsProps['solver'];
}) {
  const { t } = useTranslation();
  return (
    <>
      <div style={SECTION_TITLE_STYLE}>{t('efficientFrontier.results.paramsSummary')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard
          label={t('efficientFrontier.results.rebalanceFreq')}
          value={
            t(`efficientFrontier.rebalanceFreq.${rebalanceFrequency}`, { defaultValue: '' }) ||
            rebalanceFrequency
          }
          color="var(--text-body)"
        />
        <StatCard
          label={t('efficientFrontier.results.allowCash')}
          value={allowCash ? t('efficientFrontier.results.yes') : t('efficientFrontier.results.no')}
          color={allowCash ? 'var(--success)' : 'var(--text-muted)'}
        />
        <StatCard
          label={t('efficientFrontier.results.returnObjective')}
          value={
            returnObjective === 'maxCagr'
              ? t('efficientFrontier.results.maxCagrShort')
              : t('efficientFrontier.results.minVolShort')
          }
          color="var(--text-body)"
        />
        <StatCard
          label={t('efficientFrontier.results.solver')}
          value={t(`efficientFrontier.solver.${solver}`, { defaultValue: solver })}
          color="var(--text-body)"
        />
      </div>
    </>
  );
}

/** 有效前沿结果容器 */
export function FrontierResults(props: FrontierResultsProps) {
  const {
    results: r,
    scatterData,
    sharpeRange,
    maxSharpe,
    allocationData,
    allAssetTickers,
    correlations,
    selectedPoint,
    rebalanceFrequency,
    allowCash,
    returnObjective,
    solver,
    onSelectPoint,
    onLoadInBacktester,
  } = props;
  return (
    <div className="bt-results-card card">
      <FrontierScatterChart
        scatterData={scatterData}
        sharpeRange={sharpeRange}
        maxSharpe={maxSharpe}
        frontier={r.frontier}
        onSelectPoint={onSelectPoint}
        onLoadInBacktester={() => onLoadInBacktester()}
      />
      <FrontierAllocations allocationData={allocationData} allAssetTickers={allAssetTickers} />
      <CorrelationMatrixView correlations={correlations} />
      <SelectedPointDetail selectedPoint={selectedPoint} onLoadInBacktester={onLoadInBacktester} />
      <MaxSharpeSection maxSharpe={maxSharpe} />
      <ParamsSummary
        rebalanceFrequency={rebalanceFrequency}
        allowCash={allowCash}
        returnObjective={returnObjective}
        solver={solver}
      />
    </div>
  );
}
