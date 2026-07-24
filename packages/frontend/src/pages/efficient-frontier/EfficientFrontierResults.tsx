/**
 * @file 有效前沿结果主容器
 * @description 组合散点图、配置面积图、相关性矩阵、选中点详情、最大夏普组合与参数摘要。
 *   外层 Card 由 ToolPageLayout 提供，本组件以 flex-col gap-6 组织各子区。
 */
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import type { EfficientFrontierPoint } from '@backtest/shared';
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

const COLOR_SUCCESS = 'hsl(var(--success))';
const COLOR_WARNING = 'hsl(var(--warning))';
const COLOR_BRAND = 'hsl(var(--brand))';
const COLOR_FG_SECONDARY = 'hsl(var(--fg-secondary))';
const COLOR_FG_TERTIARY = 'hsl(var(--fg-tertiary))';

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
    <div className="mt-4 rounded-md bg-input-bg p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-label font-semibold text-fg">
          {t('efficientFrontier.results.selectedPoint')}
        </h3>
        <LoadInBacktesterButton
          onClick={() => onLoadInBacktester(selectedPoint)}
          label={t('efficientFrontier.results.load')}
          size="sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <WeightAllocation
          weights={selectedPoint.weights}
          title={t('efficientFrontier.results.weightAllocation')}
        />
        <div className="flex flex-col gap-2">
          <MetricCard
            label={t('efficientFrontier.results.expectedReturn')}
            value={`${selectedPoint.expectedReturn.toFixed(2)}%`}
            color={COLOR_SUCCESS}
          />
          <MetricCard
            label={t('efficientFrontier.results.expectedVolatility')}
            value={`${selectedPoint.expectedVolatility.toFixed(2)}%`}
            color={COLOR_WARNING}
          />
          <MetricCard
            label={t('efficientFrontier.results.sharpeRatio')}
            value={selectedPoint.sharpeRatio.toFixed(2)}
            color={COLOR_BRAND}
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
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">
        {t('efficientFrontier.results.maxSharpePortfolio')}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-caption text-fg-tertiary">
            {t('efficientFrontier.results.weight')}
          </div>
          <div className="flex flex-col gap-2">
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
        <div className="flex flex-col gap-3">
          <MetricCard
            label={t('efficientFrontier.results.expectedReturn')}
            value={`${maxSharpe.expectedReturn.toFixed(2)}%`}
            color={COLOR_SUCCESS}
          />
          <MetricCard
            label={t('efficientFrontier.results.expectedVolatility')}
            value={`${maxSharpe.expectedVolatility.toFixed(2)}%`}
            color={COLOR_WARNING}
          />
          <MetricCard
            label={t('efficientFrontier.results.sharpeRatio')}
            value={maxSharpe.sharpeRatio.toFixed(2)}
            color={COLOR_BRAND}
          />
        </div>
      </div>
    </div>
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
    <div>
      <h3 className="mb-3 mt-6 text-h3 font-semibold text-fg">
        {t('efficientFrontier.results.paramsSummary')}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t('efficientFrontier.results.rebalanceFreq')}
          value={
            t(`efficientFrontier.rebalanceFreq.${rebalanceFrequency}`, { defaultValue: '' }) ||
            rebalanceFrequency
          }
          color={COLOR_FG_SECONDARY}
        />
        <StatCard
          label={t('efficientFrontier.results.allowCash')}
          value={allowCash ? t('efficientFrontier.results.yes') : t('efficientFrontier.results.no')}
          color={allowCash ? COLOR_SUCCESS : COLOR_FG_TERTIARY}
        />
        <StatCard
          label={t('efficientFrontier.results.returnObjective')}
          value={
            returnObjective === 'maxCagr'
              ? t('efficientFrontier.results.maxCagrShort')
              : t('efficientFrontier.results.minVolShort')
          }
          color={COLOR_FG_SECONDARY}
        />
        <StatCard
          label={t('efficientFrontier.results.solver')}
          value={t(`efficientFrontier.solver.${solver}`, { defaultValue: solver })}
          color={COLOR_FG_SECONDARY}
        />
      </div>
    </div>
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
    <div className="flex flex-col gap-6">
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
