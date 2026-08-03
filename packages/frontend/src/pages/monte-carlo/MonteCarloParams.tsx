import { useEffect, useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { SectionHeader } from '@/components/form/sharedFields';
import { SegmentedControl } from '../../components/form/SegmentedControl.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import type { McState, PortfolioMode, PortfolioState } from './monteCarloUtils.js';
const GOAL_KEYS = [
  'maxCagrPercentile',
  'minMaxDrawdown',
  'maxSharpe',
  'minVolatility',
  'maxFinalValue',
  'maxSuccessRate',
] as const;
const GOAL_LBL: Record<(typeof GOAL_KEYS)[number], string> = {
  maxCagrPercentile: 'monteCarlo.params.goalMaxCagrPercentile',
  minMaxDrawdown: 'monteCarlo.params.goalMinMaxDrawdown',
  maxSharpe: 'monteCarlo.params.goalMaxSharpe',
  minVolatility: 'monteCarlo.params.goalMinVolatility',
  maxFinalValue: 'monteCarlo.params.goalMaxFinalValue',
  maxSuccessRate: 'monteCarlo.params.goalMaxSuccessRate',
};
const buildGoalOptions = (t: TFunction) =>
  GOAL_KEYS.map((k) => ({ value: k, label: t(GOAL_LBL[k]) }));
function PortfolioHeader({
  p,
  onUpdate,
}: {
  p: PortfolioState;
  onUpdate: (patch: Partial<PortfolioState>) => void;
}) {
  const { t } = useTranslation();
  const rebalanceItems = [
    { value: 'yearly', labelKey: 'monteCarlo.params.rebalanceYearly' },
    { value: 'quarterly', labelKey: 'monteCarlo.params.rebalanceQuarterly' },
    { value: 'monthly', labelKey: 'monteCarlo.params.rebalanceMonthly' },
    { value: 'none', labelKey: 'monteCarlo.params.rebalanceNone' },
  ];
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
          {rebalanceItems.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {t(r.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        options={([1, 2] as PortfolioMode[]).map((mode) => ({
          value: mode,
          label: t('monteCarlo.params.portfolioModeN', { mode }),
        }))}
      />
    </Field>
  );
}
function PortfolioConfigSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { portfolios, portfolioMode, ...ops } = s;
  const cardStyle = { width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' } as const;
  const range = portfolioMode === 2 ? [0, 1] : [0];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('monteCarlo.params.portfolioConfigTitle')}
        info={t('monteCarlo.params.portfolioConfigInfo')}
      />
      <PortfolioModeToggle s={s} />
      <div className="flex flex-col gap-3">
        {range.map((idx) => (
          <PortfolioEditor
            key={idx}
            singleMode
            assets={portfolios[idx].assets}
            totalWeight={ops.getTotalWeight(idx)}
            onAdd={() => ops.addAsset(idx)}
            onRemove={(aIdx) => ops.removeAsset(idx, aIdx)}
            onUpdate={(aIdx, f, v) => ops.updateAsset(idx, aIdx, f, v)}
            isComplete={ops.isComplete(idx)}
            wrapInSection={false}
            cardStyle={cardStyle}
            header={
              <PortfolioHeader
                p={portfolios[idx]}
                onUpdate={(patch) => ops.updatePortfolio(idx, patch)}
              />
            }
          />
        ))}
      </div>
    </section>
  );
}
type FieldKind = 'number' | 'text' | 'date';
interface FieldConfig {
  labelKey: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: FieldKind;
  prefix?: string;
  suffixKey?: string;
  placeholder?: string;
}
function BasicField({ t, cfg }: { t: TFunction; cfg: FieldConfig }) {
  return (
    <Field>
      <FieldLabel>{t(cfg.labelKey)}</FieldLabel>
      <div className={cfg.prefix || cfg.suffixKey ? 'relative' : undefined}>
        {cfg.prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            {cfg.prefix}
          </span>
        )}
        <Input
          type={cfg.type ?? 'text'}
          value={cfg.value}
          onChange={(e) => cfg.onChange(e.target.value)}
          placeholder={cfg.placeholder}
          className={cfg.prefix ? 'pl-7' : cfg.suffixKey ? 'pr-10' : undefined}
        />
        {cfg.suffixKey && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            {t(cfg.suffixKey)}
          </span>
        )}
      </div>
    </Field>
  );
}
function SimDateAndCountFields({ s }: { s: McState }) {
  const { t } = useTranslation();
  const numFields: FieldConfig[] = [
    {
      labelKey: 'monteCarlo.params.startDate',
      value: s.startDate,
      onChange: s.setStartDate,
      type: 'date',
    },
    {
      labelKey: 'monteCarlo.params.endDate',
      value: s.endDate,
      onChange: s.setEndDate,
      type: 'date',
    },
    {
      labelKey: 'monteCarlo.params.simYears',
      value: s.numYears,
      onChange: (v) => s.setNumYears(Number(v)),
      type: 'number',
    },
    {
      labelKey: 'monteCarlo.params.simCount',
      value: s.numSimulations,
      onChange: (v) => s.setNumSimulations(Number(v)),
      type: 'number',
    },
    {
      labelKey: 'monteCarlo.params.startingValue',
      value: s.startingValue,
      onChange: (v) => s.setStartingValue(Number(v)),
      type: 'number',
      prefix: '$',
    },
  ];
  return numFields.map((cfg) => <BasicField key={cfg.labelKey} t={t} cfg={cfg} />);
}
function SimBlockAndSeedFields({ s }: { s: McState }) {
  const { t } = useTranslation();
  const blockFields: FieldConfig[] = [
    {
      labelKey: 'monteCarlo.params.minBlock',
      value: s.minBlock,
      onChange: (v) => s.setMinBlock(Number(v)),
      type: 'number',
      suffixKey: 'monteCarlo.params.yearSuffix',
    },
    {
      labelKey: 'monteCarlo.params.maxBlock',
      value: s.maxBlock,
      onChange: (v) => s.setMaxBlock(Number(v)),
      type: 'number',
      suffixKey: 'monteCarlo.params.yearSuffix',
    },
    {
      labelKey: 'monteCarlo.params.randomSeed',
      value: s.randomSeed,
      onChange: s.setRandomSeed,
      placeholder: t('monteCarlo.params.randomSeedPlaceholder'),
    },
  ];
  return [
    ...blockFields.map((cfg) => <BasicField key={cfg.labelKey} t={t} cfg={cfg} />),
    <Field key="withReplacement">
      <FieldLabel>{t('monteCarlo.params.withReplacement')}</FieldLabel>
      <Checkbox
        id="mc-with-replacement"
        checked={s.withReplacement}
        onCheckedChange={(c) => s.setWithReplacement(c === true)}
      />
    </Field>,
  ];
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
  const { simMode } = s;
  const [showExtras, setShowExtras] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShowExtras(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="flex flex-col gap-5">
      <PortfolioConfigSection s={s} />
      {showExtras && (
        <>
          <SimParamsSection s={s} />
          <BuildModeSection s={s} />
          {simMode === 'frontier' && <DualGoalSection s={s} />}
        </>
      )}
      <Button onClick={s.runSimulation} disabled={s.isLoading} variant="primary" className="w-full">
        {s.isLoading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {s.isLoading ? t('monteCarlo.params.simulating') : t('monteCarlo.params.startSim')}
      </Button>
    </div>
  );
}
export { McParamsPanel };
