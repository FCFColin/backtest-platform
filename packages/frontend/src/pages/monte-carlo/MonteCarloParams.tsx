/**
 * @file 蒙特卡洛参数面板
 * @description 用 Field + Input/Select/Checkbox + Button 就地重构（testfol.io 风格）。
 *   单 Card 内分节渲染：组合配置 / 模拟参数 / 构建模式 / 双目标，底部为主操作按钮。
 *   PortfolioEditor 与 SegmentedControl 为复用复杂组件，保持原调用方式。
 */
import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/form/Field';
import { SegmentedControl } from '../../components/form/SegmentedControl.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import type { McState } from './monteCarloParamsUtils.js';
import type { PortfolioState, PortfolioMode } from './monteCarloTypes.js';

/** 构建优化目标选项（依赖 i18n，需在组件内调用） */
function buildGoalOptions(t: TFunction): { value: string; label: string }[] {
  return [
    { value: 'maxCagrPercentile', label: t('monteCarlo.params.goalMaxCagrPercentile') },
    { value: 'minMaxDrawdown', label: t('monteCarlo.params.goalMinMaxDrawdown') },
    { value: 'maxSharpe', label: t('monteCarlo.params.goalMaxSharpe') },
    { value: 'minVolatility', label: t('monteCarlo.params.goalMinVolatility') },
    { value: 'maxFinalValue', label: t('monteCarlo.params.goalMaxFinalValue') },
    { value: 'maxSuccessRate', label: t('monteCarlo.params.goalMaxSuccessRate') },
  ];
}

/** 区块标题（标题 + 可选说明） */
function SectionHeader({ title, info }: { title: string; info?: string }) {
  return (
    <div>
      <h3 className="text-h3 font-semibold text-fg">{title}</h3>
      {info && <p className="mt-0.5 text-caption text-fg-tertiary">{info}</p>}
    </div>
  );
}

function PortfolioModeToggle({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { portfolioMode, setPortfolioMode } = s;
  return (
    <Field>
      <FieldLabel>{t('monteCarlo.params.portfolioCount')}</FieldLabel>
      <SegmentedControl<PortfolioMode>
        value={portfolioMode}
        onChange={setPortfolioMode}
        options={[
          { value: 1, label: t('monteCarlo.params.portfolioModeN', { mode: 1 }) },
          { value: 2, label: t('monteCarlo.params.portfolioModeN', { mode: 2 }) },
        ]}
      />
    </Field>
  );
}

function PortfolioHeader({
  p,
  onUpdate,
}: {
  p: PortfolioState;
  onUpdate: (patch: Partial<PortfolioState>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="flex-1"
        value={p.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
      />
      <Select
        value={p.rebalanceFrequency}
        onValueChange={(v) => onUpdate({ rebalanceFrequency: v })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yearly">{t('monteCarlo.params.rebalanceYearly')}</SelectItem>
          <SelectItem value="quarterly">{t('monteCarlo.params.rebalanceQuarterly')}</SelectItem>
          <SelectItem value="monthly">{t('monteCarlo.params.rebalanceMonthly')}</SelectItem>
          <SelectItem value="none">{t('monteCarlo.params.rebalanceNone')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function PortfolioConfigSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { portfolios, portfolioMode, ...ops } = s;
  const cardStyle = { width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' } as const;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('monteCarlo.params.portfolioConfigTitle')}
        info={t('monteCarlo.params.portfolioConfigInfo')}
      />
      <PortfolioModeToggle s={s} />
      <div className="flex flex-col gap-3">
        <PortfolioEditor
          singleMode
          assets={portfolios[0].assets}
          totalWeight={ops.getTotalWeight(0)}
          onAdd={() => ops.addAsset(0)}
          onRemove={(aIdx) => ops.removeAsset(0, aIdx)}
          onUpdate={(aIdx, f, v) => ops.updateAsset(0, aIdx, f, v)}
          isComplete={ops.isComplete(0)}
          wrapInSection={false}
          cardStyle={cardStyle}
          header={
            <PortfolioHeader
              p={portfolios[0]}
              onUpdate={(patch) => ops.updatePortfolio(0, patch)}
            />
          }
        />
        {portfolioMode === 2 && (
          <PortfolioEditor
            singleMode
            assets={portfolios[1].assets}
            totalWeight={ops.getTotalWeight(1)}
            onAdd={() => ops.addAsset(1)}
            onRemove={(aIdx) => ops.removeAsset(1, aIdx)}
            onUpdate={(aIdx, f, v) => ops.updateAsset(1, aIdx, f, v)}
            isComplete={ops.isComplete(1)}
            wrapInSection={false}
            cardStyle={cardStyle}
            header={
              <PortfolioHeader
                p={portfolios[1]}
                onUpdate={(patch) => ops.updatePortfolio(1, patch)}
              />
            }
          />
        )}
      </div>
    </section>
  );
}

/** 模拟日期 / 年限 / 次数 / 初始资金 字段组 */
function SimDateAndCountFields({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <>
      <Field>
        <FieldLabel>{t('monteCarlo.params.startDate')}</FieldLabel>
        <Input type="date" value={s.startDate} onChange={(e) => s.setStartDate(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{t('monteCarlo.params.endDate')}</FieldLabel>
        <Input type="date" value={s.endDate} onChange={(e) => s.setEndDate(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{t('monteCarlo.params.simYears')}</FieldLabel>
        <Input
          type="number"
          value={s.numYears}
          onChange={(e) => s.setNumYears(Number(e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel>{t('monteCarlo.params.simCount')}</FieldLabel>
        <Input
          type="number"
          value={s.numSimulations}
          onChange={(e) => s.setNumSimulations(Number(e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel>{t('monteCarlo.params.startingValue')}</FieldLabel>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            $
          </span>
          <Input
            type="number"
            className="pl-7"
            value={s.startingValue}
            onChange={(e) => s.setStartingValue(Number(e.target.value))}
          />
        </div>
      </Field>
    </>
  );
}

/** 块大小 / 随机种子 / 有放回 字段组 */
function SimBlockAndSeedFields({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <>
      <Field>
        <FieldLabel>{t('monteCarlo.params.minBlock')}</FieldLabel>
        <div className="relative">
          <Input
            type="number"
            className="pr-10"
            value={s.minBlock}
            onChange={(e) => s.setMinBlock(Number(e.target.value))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            {t('monteCarlo.params.yearSuffix')}
          </span>
        </div>
      </Field>
      <Field>
        <FieldLabel>{t('monteCarlo.params.maxBlock')}</FieldLabel>
        <div className="relative">
          <Input
            type="number"
            className="pr-10"
            value={s.maxBlock}
            onChange={(e) => s.setMaxBlock(Number(e.target.value))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            {t('monteCarlo.params.yearSuffix')}
          </span>
        </div>
      </Field>
      <Field>
        <FieldLabel>{t('monteCarlo.params.randomSeed')}</FieldLabel>
        <Input
          type="number"
          value={s.randomSeed}
          onChange={(e) => s.setRandomSeed(e.target.value)}
          placeholder={t('monteCarlo.params.randomSeedPlaceholder')}
        />
      </Field>
      <Field>
        <FieldLabel>{t('monteCarlo.params.withReplacement')}</FieldLabel>
        <Checkbox
          id="mc-with-replacement"
          checked={s.withReplacement}
          onCheckedChange={(c) => s.setWithReplacement(c === true)}
        />
      </Field>
    </>
  );
}

function SimParamsSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('monteCarlo.params.simParamsTitle')}
        info={t('monteCarlo.params.simParamsInfo')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SimDateAndCountFields s={s} />
        <SimBlockAndSeedFields s={s} />
      </div>
    </section>
  );
}

function BuildModeSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { simMode, setSimMode } = s;
  const modes = [
    {
      value: 'standard' as const,
      label: t('monteCarlo.params.standardMode'),
      desc: t('monteCarlo.params.standardModeDesc'),
    },
    {
      value: 'frontier' as const,
      label: t('monteCarlo.params.frontierMode'),
      desc: t('monteCarlo.params.frontierModeDesc'),
    },
  ];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('monteCarlo.params.buildModeTitle')}
        info={t('monteCarlo.params.buildModeInfo')}
      />
      <div className="flex flex-col gap-2">
        {modes.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 text-label text-fg-secondary"
          >
            <input
              type="radio"
              name="simMode"
              value={opt.value}
              checked={simMode === opt.value}
              onChange={() => setSimMode(opt.value)}
              className="size-4 cursor-pointer accent-brand"
            />
            <span>{opt.label}</span>
            <span className="text-caption text-fg-tertiary">{opt.desc}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function GoalSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((g) => (
            <SelectItem key={g.value} value={g.value}>
              {g.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function DualGoalSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { goal1, setGoal1, goal2, setGoal2, goalWeight, setGoalWeight } = s;
  const goalOptions = buildGoalOptions(t);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('monteCarlo.params.dualGoalTitle')}
        info={t('monteCarlo.params.dualGoalInfo')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <GoalSelectField
          label={t('monteCarlo.params.goal1')}
          value={goal1}
          onChange={setGoal1}
          options={goalOptions}
        />
        <GoalSelectField
          label={t('monteCarlo.params.goal2')}
          value={goal2}
          onChange={setGoal2}
          options={goalOptions}
        />
      </div>
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel>{t('monteCarlo.params.goal1Weight')}</FieldLabel>
          <span className="font-mono text-caption tabular-nums text-fg">
            {goalWeight}% : {100 - goalWeight}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={goalWeight}
          onChange={(e) => setGoalWeight(Number(e.target.value))}
          className="w-full cursor-pointer accent-brand"
        />
      </Field>
    </section>
  );
}

function McParamsPanel({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <PortfolioConfigSection s={s} />
      <SimParamsSection s={s} />
      <BuildModeSection s={s} />
      <DualGoalSection s={s} />
      <Button onClick={s.runSimulation} disabled={s.isLoading} variant="primary" className="w-full">
        {s.isLoading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {s.isLoading ? t('monteCarlo.params.simulating') : t('monteCarlo.params.startSim')}
      </Button>
    </div>
  );
}

export { McParamsPanel };
