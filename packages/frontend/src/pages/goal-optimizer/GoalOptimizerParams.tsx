import { useTranslation } from 'react-i18next';
import { Play, Loader2, Plus, X } from 'lucide-react';
import type { InputProps } from '@/components/ui/uiComponents';
import { Input } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/cards.js';
import type { GoalAsset } from './goalOptimizerUtils.js';
interface GoalParamsProps {
  targetAmount: number;
  initialAmount: number;
  years: number;
  assets: GoalAsset[];
  totalWeight: number;
  isLoading: boolean;
  maxDrawdown: number | '';
  minSuccessRate: number | '';
  maxVolatility: number | '';
  numSimulations: number;
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
function SectionHeader({ title, info }: { title: string; info?: string }) {
  return (
    <div>
      <div className="text-label font-semibold text-fg">{title}</div>
      {info && <div className="text-caption text-fg-tertiary">{info}</div>}
    </div>
  );
}
type SettingsProps = Pick<
  GoalParamsProps,
  | 'targetAmount'
  | 'initialAmount'
  | 'years'
  | 'onTargetAmountChange'
  | 'onInitialAmountChange'
  | 'onYearsChange'
>;
function GoalSettingsSection({
  targetAmount,
  initialAmount,
  years,
  onTargetAmountChange,
  onInitialAmountChange,
  onYearsChange,
}: SettingsProps) {
  const { t } = useTranslation();
  const dollarFields = [
    {
      id: 'go-target',
      label: t('goalOptimizer.goal.targetAmount'),
      value: targetAmount,
      onChange: onTargetAmountChange,
    },
    {
      id: 'go-initial',
      label: t('goalOptimizer.goal.initialAmount'),
      value: initialAmount,
      onChange: onInitialAmountChange,
    },
  ];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('goalOptimizer.goal.section')}
        info={t('goalOptimizer.goal.sectionInfo')}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {dollarFields.map((f) => (
          <Field key={f.id}>
            <FieldLabel htmlFor={f.id}>{f.label}</FieldLabel>
            <DollarInput
              id={f.id}
              min={0}
              value={f.value}
              onChange={(e) => f.onChange(Number(e.target.value))}
            />
          </Field>
        ))}
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
type AssetProps = Pick<
  GoalParamsProps,
  'assets' | 'totalWeight' | 'onAddAsset' | 'onRemoveAsset' | 'onUpdateAsset'
>;
function AssetConfigSection({
  assets,
  totalWeight,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
}: AssetProps) {
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
type ConstraintProps = Pick<
  GoalParamsProps,
  | 'maxDrawdown'
  | 'minSuccessRate'
  | 'maxVolatility'
  | 'numSimulations'
  | 'onMaxDrawdownChange'
  | 'onMinSuccessRateChange'
  | 'onMaxVolatilityChange'
  | 'onNumSimulationsChange'
>;
function ConstraintsAndSimulation({
  maxDrawdown,
  minSuccessRate,
  maxVolatility,
  numSimulations,
  onMaxDrawdownChange,
  onMinSuccessRateChange,
  onMaxVolatilityChange,
  onNumSimulationsChange,
}: ConstraintProps) {
  const { t } = useTranslation();
  const numOrEmpty = (v: string) => (v === '' ? '' : Number(v));
  const constraints = [
    {
      id: 'go-maxdd',
      label: t('goalOptimizer.constraints.maxDrawdown'),
      value: maxDrawdown,
      onChange: onMaxDrawdownChange,
    },
    {
      id: 'go-minsr',
      label: t('goalOptimizer.constraints.minSuccessRate'),
      value: minSuccessRate,
      onChange: onMinSuccessRateChange,
    },
    {
      id: 'go-maxvol',
      label: t('goalOptimizer.constraints.maxVolatility'),
      value: maxVolatility,
      onChange: onMaxVolatilityChange,
    },
  ];
  return (
    <>
      <CollapsibleSection
        title={t('goalOptimizer.constraints.section')}
        description={t('goalOptimizer.constraints.sectionInfo')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {constraints.map((c) => (
            <Field key={c.id}>
              <FieldLabel htmlFor={c.id}>{c.label}</FieldLabel>
              <PercentInput
                id={c.id}
                min={0}
                max={100}
                placeholder={t('goalOptimizer.noLimit')}
                value={c.value}
                onChange={(e) => c.onChange(numOrEmpty(e.target.value))}
              />
            </Field>
          ))}
        </div>
      </CollapsibleSection>
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
    </>
  );
}
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
