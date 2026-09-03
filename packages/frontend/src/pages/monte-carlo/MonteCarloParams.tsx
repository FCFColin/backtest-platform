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
  ] as const,
  GOAL_LBL: Record<(typeof GOAL_KEYS)[number], string> = {
    maxCagrPercentile: 'monteCarlo.params.goalMaxCagrPercentile',
    minMaxDrawdown: 'backtest.optimizer.minMaxDrawdown',
    maxSharpe: 'monteCarlo.params.goalMaxSharpe',
    minVolatility: 'Minimize Volatility',
    maxFinalValue: 'monteCarlo.params.goalMaxFinalValue',
    maxSuccessRate: 'monteCarlo.params.goalMaxSuccessRate',
  },
  buildGoalOptions = (t: TFunction) => GOAL_KEYS.map((k) => ({ value: k, label: t(GOAL_LBL[k]) }));
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
          {[
            ['yearly', 'Annual'],
            ['quarterly', 'Quarterly'],
            ['monthly', 'Monthly'],
            ['none', 'monteCarlo.params.rebalanceNone'],
          ].map(([v, k]) => (
            <SelectItem key={v} value={v}>
              {t(k)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function PortfolioModeToggle({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <Field>
      <FieldLabel>{t('Portfolio Count')}</FieldLabel>
      <SegmentedControl<PortfolioMode>
        value={s.portfolioMode}
        onChange={s.setPortfolioMode}
        options={([1, 2] as PortfolioMode[]).map((m) => ({
          value: m,
          label: t('Mode {{mode}}', { mode: m }),
        }))}
      />
    </Field>
  );
}
function PortfolioConfigSection({ s }: { s: McState }) {
  const { t } = useTranslation(),
    { portfolios, portfolioMode, ...ops } = s,
    cardStyle = { width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' } as const;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Portfolio Allocation')}
        info={t('Add tickers and weights for simulation')}
      />
      <PortfolioModeToggle s={s} />
      <div className="flex flex-col gap-3">
        {(portfolioMode === 2 ? [0, 1] : [0]).map((idx) => (
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
function BasicField({
  t,
  cfg,
}: {
  t: TFunction;
  cfg: {
    labelKey: string;
    value: string | number;
    onChange: (v: string) => void;
    type?: 'number' | 'text' | 'date';
    prefix?: string;
    suffixKey?: string;
    placeholder?: string;
  };
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t(cfg.labelKey)}</FieldLabel>
      <AffixInput
        id={id}
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
  const { t } = useTranslation(),
    prefix = useSettingsStore((s) => (s.currency === 'cny' ? '¥' : '$')),
    fields = [
      {
        labelKey: 'Start Date',
        value: s.startDate,
        onChange: s.setStartDate,
        type: 'date' as const,
      },
      { labelKey: 'End Date', value: s.endDate, onChange: s.setEndDate, type: 'date' as const },
      {
        labelKey: 'monteCarlo.params.simYears',
        value: s.numYears,
        onChange: (v: string) => s.setNumYears(Number(v)),
        type: 'number' as const,
      },
      {
        labelKey: 'Simulation Count',
        value: s.numSimulations,
        onChange: (v: string) => s.setNumSimulations(Number(v)),
        type: 'number' as const,
      },
      {
        labelKey: 'Initial Capital',
        value: s.startingValue,
        onChange: (v: string) => s.setStartingValue(Number(v)),
        type: 'number' as const,
        prefix,
      },
      {
        labelKey: 'monteCarlo.params.minBlock',
        value: s.minBlock,
        onChange: (v: string) => s.setMinBlock(Number(v)),
        type: 'number' as const,
        suffixKey: 'y',
      },
      {
        labelKey: 'monteCarlo.params.maxBlock',
        value: s.maxBlock,
        onChange: (v: string) => s.setMaxBlock(Number(v)),
        type: 'number' as const,
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
      <Field>
        <FieldLabel htmlFor="mc-estimation">{t('monteCarlo.params.estimation')}</FieldLabel>
        <Select
          value={s.estimationMethod}
          onValueChange={(v) => (s.setEstimationMethod as unknown as (v: string) => void)(v)}
        >
          <SelectTrigger id="mc-estimation" className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              { value: '', labelKey: 'monteCarlo.params.estimation.bootstrap' },
              { value: 'trimmed', labelKey: 'monteCarlo.params.estimation.trimmed' },
              { value: 'ewWeighted', labelKey: 'monteCarlo.params.estimation.ewWeighted' },
            ].map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </section>
  );
}
function BuildModeSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t('Build Mode')} info={t('Choose standard mode or frontier mode')} />
      <div className="flex flex-col gap-2">
        {[
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
        ].map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 text-label text-fg-secondary"
          >
            <input
              type="radio"
              name="simMode"
              value={o.value}
              checked={s.simMode === o.value}
              onChange={() => s.setSimMode(o.value)}
              className="size-4 cursor-pointer accent-brand"
            />
            <span>{o.label}</span>
            <span className="text-caption text-fg-tertiary">{o.desc}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
function DualGoalSection({ s }: { s: McState }) {
  const { t } = useTranslation(),
    opts = buildGoalOptions(t);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Dual-Goal Optimization')}
        info={t(
          'Set two objectives and their weights; the system will perform weighted optimization',
        )}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label={t('Goal 1')} value={s.goal1} onChange={s.setGoal1} options={opts} />
        <SelectField label={t('Goal 2')} value={s.goal2} onChange={s.setGoal2} options={opts} />
      </div>
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel>{t('Goal 1 Weight')}</FieldLabel>
          <span className="font-mono text-caption tabular-nums text-fg">
            {s.goalWeight}% : {100 - s.goalWeight}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={s.goalWeight}
          onChange={(e) => s.setGoalWeight(Number(e.target.value))}
          className="w-full cursor-pointer accent-brand"
        />
      </Field>
    </section>
  );
}
export function McParamsPanel({ s }: { s: McState }) {
  const { t } = useTranslation(),
    [showExtras, setShowExtras] = useState(false);
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
          {s.simMode === 'frontier' && <DualGoalSection s={s} />}
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
