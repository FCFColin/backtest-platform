/**
 * @file 目标优化器参数面板
 * @description 基于 Field + shadcn Input/Button/CollapsibleSection 重构为 token 化表单：
 *   目标设置、资产配置（动态行 + 总权重校验）、约束条件（可折叠）、模拟次数与执行按钮。
 *   所有 i18n key 与回调逻辑保持不变。
 */
import { useTranslation } from 'react-i18next';
import { Play, Loader2, Plus, X } from 'lucide-react';
import type { InputProps } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/CollapsibleSection.js';
import type { GoalAsset } from './goalOptimizerUtils.js';

/** 参数面板 props */
interface GoalParamsProps {
  targetAmount: number;
  initialAmount: number;
  years: number;
  assets: GoalAsset[];
  maxDrawdown: number | '';
  minSuccessRate: number | '';
  maxVolatility: number | '';
  numSimulations: number;
  totalWeight: number;
  isLoading: boolean;
  onTargetAmountChange: (v: number) => void;
  onInitialAmountChange: (v: number) => void;
  onYearsChange: (v: number) => void;
  onAddAsset: () => void;
  onRemoveAsset: (idx: number) => void;
  onUpdateAsset: (idx: number, field: 'ticker' | 'weight', val: string | number) => void;
  onMaxDrawdownChange: (v: number | '') => void;
  onMinSuccessRateChange: (v: number | '') => void;
  onMaxVolatilityChange: (v: number | '') => void;
  onNumSimulationsChange: (v: number) => void;
  onRun: () => void;
}

/** 百分号后缀输入：相对定位容器 + Input + 右侧 % 标记，数字等宽对齐。 */
function PercentInput(props: InputProps) {
  return (
    <div className="relative">
      <Input type="number" className="pr-8" {...props} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
        %
      </span>
    </div>
  );
}

/** 美元前缀输入：相对定位容器 + 左侧 $ 标记 + Input。 */
function DollarInput(props: InputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
        $
      </span>
      <Input type="number" className="pl-7" {...props} />
    </div>
  );
}

/** 区块小标题：标题 + 可选描述。 */
function SectionHeader({ title, info }: { title: string; info?: string }) {
  return (
    <div>
      <div className="text-label font-semibold text-fg">{title}</div>
      {info && <div className="text-caption text-fg-tertiary">{info}</div>}
    </div>
  );
}

/** 目标设置区：目标金额 / 初始金额 / 时间范围。 */
function GoalSettingsSection({
  targetAmount,
  initialAmount,
  years,
  onTargetAmountChange,
  onInitialAmountChange,
  onYearsChange,
}: Pick<
  GoalParamsProps,
  | 'targetAmount'
  | 'initialAmount'
  | 'years'
  | 'onTargetAmountChange'
  | 'onInitialAmountChange'
  | 'onYearsChange'
>) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('goalOptimizer.goal.section')}
        info={t('goalOptimizer.goal.sectionInfo')}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field>
          <FieldLabel htmlFor="go-target">{t('goalOptimizer.goal.targetAmount')}</FieldLabel>
          <DollarInput
            id="go-target"
            min={0}
            value={targetAmount}
            onChange={(e) => onTargetAmountChange(Number(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="go-initial">{t('goalOptimizer.goal.initialAmount')}</FieldLabel>
          <DollarInput
            id="go-initial"
            min={0}
            value={initialAmount}
            onChange={(e) => onInitialAmountChange(Number(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="go-years">{t('goalOptimizer.goal.timeRange')}</FieldLabel>
          <div className="relative">
            <Input
              id="go-years"
              type="number"
              min={1}
              className="pr-14"
              value={years}
              onChange={(e) => onYearsChange(Number(e.target.value))}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
              {t('goalOptimizer.yearUnit')}
            </span>
          </div>
        </Field>
      </div>
    </section>
  );
}

/** 资产配置区：动态行（代码 + 权重 + 删除）、添加按钮、总权重校验。 */
function AssetConfigSection({
  assets,
  totalWeight,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
}: Pick<
  GoalParamsProps,
  'assets' | 'totalWeight' | 'onAddAsset' | 'onRemoveAsset' | 'onUpdateAsset'
>) {
  const { t } = useTranslation();
  const isComplete = Math.abs(totalWeight - 100) <= 0.01;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('goalOptimizer.asset.section')}
        info={t('goalOptimizer.asset.sectionInfo')}
      />
      <div className="flex flex-col gap-2">
        {assets.map((a, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              type="text"
              className="flex-1 uppercase"
              value={a.ticker}
              placeholder={t('goalOptimizer.asset.tickerPlaceholder')}
              onChange={(e) => onUpdateAsset(idx, 'ticker', e.target.value)}
            />
            <div className="relative w-28 shrink-0">
              <Input
                type="number"
                className="pr-7"
                min={0}
                max={100}
                placeholder="%"
                value={a.weight || ''}
                onChange={(e) => onUpdateAsset(idx, 'weight', Number(e.target.value))}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
                %
              </span>
            </div>
            {assets.length > 1 && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => onRemoveAsset(idx)}
                title={t('goalOptimizer.delete')}
                aria-label={t('goalOptimizer.delete')}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onAddAsset}>
          <Plus />
          {t('goalOptimizer.addAsset')}
        </Button>
        <div className="text-caption">
          <span className="text-fg-tertiary">{t('goalOptimizer.total')}</span>{' '}
          <span
            className={
              isComplete ? 'font-mono tabular-nums text-pos' : 'font-mono tabular-nums text-danger'
            }
          >
            {totalWeight}%
          </span>
        </div>
      </div>
    </section>
  );
}

/** 模拟次数分区 */
function GoalSimulationSection({
  numSimulations,
  onNumSimulationsChange,
}: Pick<GoalParamsProps, 'numSimulations' | 'onNumSimulationsChange'>) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('goalOptimizer.simulation.section')}
        info={t('goalOptimizer.simulation.sectionInfo')}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field>
          <FieldLabel htmlFor="go-sims">{t('goalOptimizer.simulation.count')}</FieldLabel>
          <Input
            id="go-sims"
            type="number"
            min={100}
            max={10000}
            value={numSimulations}
            onChange={(e) => onNumSimulationsChange(Number(e.target.value))}
          />
        </Field>
      </div>
    </section>
  );
}

/** 约束与模拟区：约束可折叠（最大回撤 / 最小成功率 / 最大波动率），模拟次数独立分区。 */
function ConstraintsAndSimulation({
  maxDrawdown,
  minSuccessRate,
  maxVolatility,
  numSimulations,
  onMaxDrawdownChange,
  onMinSuccessRateChange,
  onMaxVolatilityChange,
  onNumSimulationsChange,
}: Pick<
  GoalParamsProps,
  | 'maxDrawdown'
  | 'minSuccessRate'
  | 'maxVolatility'
  | 'numSimulations'
  | 'onMaxDrawdownChange'
  | 'onMinSuccessRateChange'
  | 'onMaxVolatilityChange'
  | 'onNumSimulationsChange'
>) {
  const { t } = useTranslation();
  return (
    <>
      <CollapsibleSection
        title={t('goalOptimizer.constraints.section')}
        description={t('goalOptimizer.constraints.sectionInfo')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field>
            <FieldLabel htmlFor="go-maxdd">{t('goalOptimizer.constraints.maxDrawdown')}</FieldLabel>
            <PercentInput
              id="go-maxdd"
              min={0}
              max={100}
              placeholder={t('goalOptimizer.noLimit')}
              value={maxDrawdown}
              onChange={(e) =>
                onMaxDrawdownChange(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="go-minsr">
              {t('goalOptimizer.constraints.minSuccessRate')}
            </FieldLabel>
            <PercentInput
              id="go-minsr"
              min={0}
              max={100}
              placeholder={t('goalOptimizer.noLimit')}
              value={minSuccessRate}
              onChange={(e) =>
                onMinSuccessRateChange(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="go-maxvol">
              {t('goalOptimizer.constraints.maxVolatility')}
            </FieldLabel>
            <PercentInput
              id="go-maxvol"
              min={0}
              max={100}
              placeholder={t('goalOptimizer.noLimit')}
              value={maxVolatility}
              onChange={(e) =>
                onMaxVolatilityChange(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </Field>
        </div>
      </CollapsibleSection>
      <GoalSimulationSection
        numSimulations={numSimulations}
        onNumSimulationsChange={onNumSimulationsChange}
      />
    </>
  );
}

/** 目标优化器参数面板：目标 + 资产 + 约束 + 模拟 + 执行按钮。 */
export function GoalOptimizerParamsPanel(props: GoalParamsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <GoalSettingsSection {...props} />
      <AssetConfigSection {...props} />
      <ConstraintsAndSimulation {...props} />
      <div className="flex justify-end pt-1">
        <Button variant="primary" size="lg" disabled={props.isLoading} onClick={props.onRun}>
          {props.isLoading ? <Loader2 className="animate-spin" /> : <Play />}
          {props.isLoading ? t('goalOptimizer.optimizing') : t('goalOptimizer.startOptimize')}
        </Button>
      </div>
    </div>
  );
}
