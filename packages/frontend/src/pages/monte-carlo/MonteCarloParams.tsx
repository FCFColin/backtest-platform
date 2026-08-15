import { useEffect, useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AffixInput,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { SectionHeader, SelectField, RunButton } from '@/components/form/sharedFields';
import { SegmentedControl } from '../../components/form/SegmentedControl.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { useSettingsStore } from '@/store/settingsStore';
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
  minMaxDrawdown: 'backtest.optimizer.minMaxDrawdown',
  maxSharpe: 'monteCarlo.params.goalMaxSharpe',
  minVolatility: 'Minimize Volatility',
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
    { value: 'yearly', labelKey: 'Annual' },
    { value: 'quarterly', labelKey: 'Quarterly' },
    { value: 'monthly', labelKey: 'Monthly' },
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
      <FieldLabel>{t('Portfolio Count')}</FieldLabel>
      <SegmentedControl<PortfolioMode>
        value={portfolioMode}
        onChange={setPortfolioMode}
        options={([1, 2] as PortfolioMode[]).map((mode) => ({
          value: mode,
          label: t('Mode {{mode}}', { mode }),
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
        title={t('Portfolio Allocation')}
        info={t('Add tickers and weights for simulation')}
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
  const inputId = useId();
  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{t(cfg.labelKey)}</FieldLabel>
      <AffixInput
        id={inputId}
        type={cfg.type ?? 'text'}
        value={cfg.value}
        onChange={(e) => cfg.onChange(e.target.value)}
        placeholder={cfg.placeholder}
        prefix={cfg.prefix}
        suffix={cfg.suffixKey ? t(cfg.suffixKey) : undefined}
      />
    </Field>
  );
}
function SimParamsSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const prefix = useSettingsStore((s) => (s.currency === 'cny' ? '¥' : '$'));
  const fields: FieldConfig[] = [
    {
      labelKey: 'Start Date',
      value: s.startDate,
      onChange: s.setStartDate,
      type: 'date',
    },
    {
      labelKey: 'End Date',
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
      labelKey: 'Simulation Count',
      value: s.numSimulations,
      onChange: (v) => s.setNumSimulations(Number(v)),
      type: 'number',
    },
    {
      labelKey: 'Initial Capital',
      value: s.startingValue,
      onChange: (v) => s.setStartingValue(Number(v)),
      type: 'number',
      prefix,
    },
    {
      labelKey: 'monteCarlo.params.minBlock',
      value: s.minBlock,
      onChange: (v) => s.setMinBlock(Number(v)),
      type: 'number',
      suffixKey: 'y',
    },
    {
      labelKey: 'monteCarlo.params.maxBlock',
      value: s.maxBlock,
      onChange: (v) => s.setMaxBlock(Number(v)),
      type: 'number',
      suffixKey: 'y',
    },
    {
      labelKey: 'monteCarlo.params.randomSeed',
      value: s.randomSeed,
      onChange: s.setRandomSeed,
      placeholder: t('Leave empty to use a random seed'),
    },
  ];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Simulation Parameters')}
        info={t('Set simulation years, count, block size and random seed')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((cfg) => (
          <BasicField key={cfg.labelKey} t={t} cfg={cfg} />
        ))}
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
      label: t('Standard Mode'),
      desc: t('Run standard Monte Carlo simulation'),
    },
    {
      value: 'frontier' as const,
      label: t('Frontier Mode'),
      desc: t('Generate efficient frontier showing risk-return tradeoffs'),
    },
  ];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t('Build Mode')} info={t('Choose standard mode or frontier mode')} />
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
function DualGoalSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { goal1, setGoal1, goal2, setGoal2, goalWeight, setGoalWeight } = s;
  const goalOptions = buildGoalOptions(t);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Dual-Goal Optimization')}
        info={t(
          'Set two objectives and their weights; the system will perform weighted optimization',
        )}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label={t('Goal 1')} value={goal1} onChange={setGoal1} options={goalOptions} />
        <SelectField label={t('Goal 2')} value={goal2} onChange={setGoal2} options={goalOptions} />
      </div>
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel>{t('Goal 1 Weight')}</FieldLabel>
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
      <RunButton
        isLoading={s.isLoading}
        onClick={s.runSimulation}
        label={t('Run Simulation')}
        loadingLabel={t('Simulating...')}
      />
    </div>
  );
}
export { McParamsPanel };
