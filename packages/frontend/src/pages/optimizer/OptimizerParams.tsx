/**
 * @file 优化器参数面板
 * @description 基于 Field + shadcn Input/Select/Switch 重构为 token 化表单，
 *   分区为资产选择、求解器设置、历史约束（可折叠）、高级约束（可折叠）与执行按钮。
 *   所有 i18n key 与 hook 逻辑保持不变。
 */
import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import type { InputProps } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/CollapsibleSection.js';
import { TickerTagInput } from '@/components/form/TickerTagInput.js';
import type { EfficientFrontierState, SolverType } from './OptimizerUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

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

/** 区块小标题：标题 + 可选描述。 */
function SectionHeader({ title, info }: { title: string; info?: string }) {
  return (
    <div>
      <div className="text-label font-semibold text-fg">{title}</div>
      {info && <div className="text-caption text-fg-tertiary">{info}</div>}
    </div>
  );
}

/** 资产选择区：标的标签输入。 */
function TickerEditor({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const handleTagChange = (newTickers: string[]) => {
    const oldLen = s.tickers.length;
    if (newTickers.length > oldLen) {
      s.setTickers([...s.tickers, '']);
    } else if (newTickers.length < oldLen) {
      s.setTickers(s.tickers.filter((_, idx) => idx < newTickers.length));
    } else {
      s.setTickers(newTickers);
    }
  };
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('optimizer.assetSelection')}
        info={t('optimizer.assetSelectionInfo')}
      />
      <TickerTagInput
        tickers={s.tickers.filter(Boolean)}
        onChange={handleTagChange}
        minCount={2}
        placeholder={t('optimizer.tickerPlaceholder')}
      />
    </section>
  );
}

/** 全历史开关 + 起止日期 + 目标 字段组 */
function SolverDateAndObjectiveFields({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const allHistory = s.startDate === '' && s.endDate === '';
  return (
    <>
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="opt-all-history">{t('optimizer.allHistory')}</FieldLabel>
          <Switch
            id="opt-all-history"
            checked={allHistory}
            onCheckedChange={(checked) => {
              if (checked) {
                s.setStartDate('');
                s.setEndDate('');
              } else {
                s.setStartDate(DEFAULT_BACKTEST_START_DATE);
                s.setEndDate(DEFAULT_END_DATE);
              }
            }}
          />
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="opt-start-date">{t('optimizer.startDate')}</FieldLabel>
        <Input
          id="opt-start-date"
          type="date"
          value={s.startDate}
          disabled={allHistory}
          onChange={(e) => s.setStartDate(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="opt-end-date">{t('optimizer.endDate')}</FieldLabel>
        <Input
          id="opt-end-date"
          type="date"
          value={s.endDate}
          disabled={allHistory}
          onChange={(e) => s.setEndDate(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="opt-objective">{t('optimizer.objective')}</FieldLabel>
        <Select value={s.objective} onValueChange={s.setObjective}>
          <SelectTrigger id="opt-objective">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="maxSharpe">{t('optimizer.maxSharpe')}</SelectItem>
            <SelectItem value="minVolatility">{t('optimizer.minVolatility')}</SelectItem>
            <SelectItem value="maxReturn">{t('optimizer.maxReturn')}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

/** 权重 / T-Bill / 求解器 / 做空开关 字段组 */
function SolverWeightsAndTypeFields({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  return (
    <>
      <Field>
        <FieldLabel htmlFor="opt-min-weight">{t('optimizer.minWeight')}</FieldLabel>
        <PercentInput
          id="opt-min-weight"
          value={s.minWeight}
          min={0}
          max={100}
          onChange={(e) => s.setMinWeight(Number(e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="opt-max-weight">{t('optimizer.maxWeight')}</FieldLabel>
        <PercentInput
          id="opt-max-weight"
          value={s.maxWeight}
          min={0}
          max={100}
          onChange={(e) => s.setMaxWeight(Number(e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="opt-tbill">{t('optimizer.tbillRate')}</FieldLabel>
        <PercentInput
          id="opt-tbill"
          step={0.1}
          value={s.tbillRate}
          onChange={(e) => s.setTbillRate(Number(e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="opt-solver">{t('optimizer.solver')}</FieldLabel>
        <Select value={s.solver} onValueChange={(v) => s.setSolver(v as SolverType)}>
          <SelectTrigger id="opt-solver">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="markowitz">{t('optimizer.solverMarkowitz')}</SelectItem>
            <SelectItem value="ga">{t('optimizer.solverGA')}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="opt-short">{t('optimizer.allowShort')}</FieldLabel>
          <Switch id="opt-short" checked={s.allowShort} onCheckedChange={s.setAllowShort} />
        </div>
      </Field>
    </>
  );
}

/** 求解器设置区：全历史开关 + 起止日期 + 目标 + 权重/T-Bill + 求解器 + 做空开关。 */
function SolverSettings({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('optimizer.solverSettings')}
        info={t('optimizer.solverSettingsInfo')}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SolverDateAndObjectiveFields s={s} />
        <SolverWeightsAndTypeFields s={s} />
      </div>
    </section>
  );
}

/** 历史约束项：开关 + 百分号输入。 */
function ConstraintField({
  label,
  checked,
  onToggle,
  value,
  onValueChange,
  placeholder,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <Switch checked={checked} onCheckedChange={onToggle} aria-label={label} />
      </div>
      <PercentInput
        step={0.1}
        value={value}
        disabled={!checked}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
      />
    </Field>
  );
}

/** 历史约束区（可折叠）：最大回撤 / CAGR / 波动率。 */
function HistoricalConstraints({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  return (
    <CollapsibleSection
      title={t('optimizer.historicalConstraints')}
      description={t('optimizer.historicalConstraintsInfo')}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ConstraintField
          label={t('optimizer.maxDrawdownLT')}
          checked={s.enableMaxDD}
          onToggle={s.setEnableMaxDD}
          value={s.maxMaxDD}
          onValueChange={s.setMaxMaxDD}
          placeholder={t('optimizer.placeholderDD')}
        />
        <ConstraintField
          label={t('optimizer.cagrGT')}
          checked={s.enableMinCagr}
          onToggle={s.setEnableMinCagr}
          value={s.minCagr}
          onValueChange={s.setMinCagr}
          placeholder={t('optimizer.placeholderCagr')}
        />
        <ConstraintField
          label={t('optimizer.volatilityLT')}
          checked={s.enableMaxVol}
          onToggle={s.setEnableMaxVol}
          value={s.maxVol}
          onValueChange={s.setMaxVol}
          placeholder={t('optimizer.placeholderVol')}
        />
      </div>
    </CollapsibleSection>
  );
}

/** 高级约束项：纯数值/百分号输入，无开关。 */
function AdvancedField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </Field>
  );
}

/** 高级约束区（可折叠）：最小 Sharpe / Sortino / 最大平均回撤 / 最大持仓 / 最小纳入权重。 */
function AdvancedConstraints({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  return (
    <CollapsibleSection
      title={t('optimizer.advancedConstraints')}
      description={t('optimizer.advancedConstraintsInfo')}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdvancedField label={t('optimizer.minSharpeLabel')}>
          <Input
            type="number"
            step={0.01}
            value={s.minSharpe}
            placeholder="-"
            onChange={(e) => s.setMinSharpe(e.target.value)}
          />
        </AdvancedField>
        <AdvancedField label={t('optimizer.minSortinoLabel')}>
          <Input
            type="number"
            step={0.01}
            value={s.minSortino}
            placeholder="-"
            onChange={(e) => s.setMinSortino(e.target.value)}
          />
        </AdvancedField>
        <AdvancedField label={t('optimizer.maxAvgDDLabel')}>
          <PercentInput
            step={0.1}
            value={s.maxAvgDD}
            placeholder="-"
            onChange={(e) => s.setMaxAvgDD(e.target.value)}
          />
        </AdvancedField>
        <AdvancedField label={t('optimizer.maxHoldings')}>
          <Input
            type="number"
            min={2}
            value={s.maxHoldings}
            placeholder="-"
            onChange={(e) => s.setMaxHoldings(e.target.value)}
          />
        </AdvancedField>
        <AdvancedField label={t('optimizer.minWeightToInclude')}>
          <PercentInput
            min={0}
            max={100}
            value={s.minWeightToInclude}
            placeholder="-"
            onChange={(e) => s.setMinWeightToInclude(e.target.value)}
          />
        </AdvancedField>
      </div>
    </CollapsibleSection>
  );
}

/** 优化器参数面板：资产 + 求解器 + 历史约束 + 高级约束 + 执行按钮。 */
export function OptimizerParams({ s }: { s: EfficientFrontierState }) {
  const { t } = useTranslation();
  const running = s.isLoading || s.isCalculatingStats;
  return (
    <div className="flex flex-col gap-5">
      <TickerEditor s={s} />
      <SolverSettings s={s} />
      <HistoricalConstraints s={s} />
      <AdvancedConstraints s={s} />
      <div className="flex justify-end pt-1">
        <Button variant="primary" size="lg" disabled={running} onClick={() => void s.runOptimize()}>
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {s.isCalculatingStats
            ? t('optimizer.calculatingStats')
            : s.isLoading
              ? t('optimizer.optimizing')
              : t('optimizer.startCalc')}
        </Button>
      </div>
    </div>
  );
}
