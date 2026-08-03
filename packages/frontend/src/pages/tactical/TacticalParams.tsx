import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, FolderOpen, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { LabeledField, DollarInput, RunButton } from '@/components/form/sharedFields';
import {
  useTacticalPageState,
  REBALANCE_OPTIONS,
  AGGREGATION_OPTIONS,
  RANKING_METHOD_OPTIONS,
} from './TacticalUtils';
import type { TacticalStrategy } from '@backtest/shared/types/tactical';
import type { RebalanceFrequency } from '@backtest/shared';
import { useTacticalConfigs, type TacticalConfigPayload } from './useTacticalConfigs';
import { ParamSection, SignalBuilderSection } from './TacticalSignalEditor';
type TacticalPageState = ReturnType<typeof useTacticalPageState>;
function AggregationSection({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { strategy, setStrategy } = state;
  return (
    <ParamSection title={t('tactical.params.aggregationConfig')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <FieldLabel>{t('tactical.params.aggregationMethod')}</FieldLabel>
          <Select
            value={strategy.aggregationMethod}
            onValueChange={(v) =>
              setStrategy({
                ...strategy,
                aggregationMethod: v as TacticalStrategy['aggregationMethod'],
              })
            }
          >
            <SelectTrigger aria-label={t('tactical.params.aggregationMethod')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGGREGATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {strategy.aggregationMethod === 'rank' && (
          <>
            <Field>
              <FieldLabel>{t('tactical.params.rankingMethod')}</FieldLabel>
              <Select
                value={strategy.rankingConfig?.method ?? 'fixed_share'}
                onValueChange={(v) =>
                  setStrategy({
                    ...strategy,
                    rankingConfig: {
                      method: v as 'fixed_share' | 'risk_parity',
                      topN: strategy.rankingConfig?.topN ?? 3,
                    },
                  })
                }
              >
                <SelectTrigger aria-label={t('tactical.params.rankingMethod')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANKING_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(o.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>TopN</FieldLabel>
              <Input
                type="number"
                min={1}
                value={strategy.rankingConfig?.topN ?? 3}
                onChange={(e) =>
                  setStrategy({
                    ...strategy,
                    rankingConfig: {
                      method: strategy.rankingConfig?.method ?? 'fixed_share',
                      topN: Math.max(1, Number(e.target.value)),
                    },
                  })
                }
              />
            </Field>
          </>
        )}
      </div>
    </ParamSection>
  );
}
function BacktestParamsSection({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    rebalanceFrequency,
    setRebalanceFrequency,
  } = state;
  return (
    <ParamSection title={t('tactical.params.backtestParams')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LabeledField htmlFor="tactical-start-date" label={t('tactical.params.startDate')}>
          <Input
            id="tactical-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </LabeledField>
        <LabeledField htmlFor="tactical-end-date" label={t('tactical.params.endDate')}>
          <Input
            id="tactical-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </LabeledField>
        <LabeledField htmlFor="tactical-starting-value" label={t('tactical.params.startingValue')}>
          <DollarInput
            id="tactical-starting-value"
            type="number"
            className="font-mono tabular-nums"
            value={startingValue}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </LabeledField>
        <Field>
          <FieldLabel htmlFor="tactical-rebalance">{t('tactical.params.rebalanceFreq')}</FieldLabel>
          <Select
            value={rebalanceFrequency}
            onValueChange={(v) => setRebalanceFrequency(v as RebalanceFrequency)}
          >
            <SelectTrigger id="tactical-rebalance" aria-label={t('tactical.params.rebalanceFreq')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REBALANCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </ParamSection>
  );
}
function applyTacticalConfig(state: TacticalPageState, config: TacticalConfigPayload) {
  state.setStrategy(config.strategy);
  state.setStartDate(config.startDate);
  state.setEndDate(config.endDate);
  state.setStartingValue(config.startingValue);
  state.setRebalanceFrequency(config.rebalanceFrequency);
}
function ConfigPersistenceSection({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { configs, save, remove } = useTacticalConfigs();
  const [configName, setConfigName] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!configName.trim()) return;
    setSaving(true);
    const payload: TacticalConfigPayload = {
      strategy: state.strategy,
      startDate: state.startDate,
      endDate: state.endDate,
      startingValue: state.startingValue,
      rebalanceFrequency: state.rebalanceFrequency,
    };
    await save(configName.trim(), payload);
    setConfigName('');
    setSaving(false);
  };
  return (
    <ParamSection title={t('tactical.params.savedConfigs')}>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          className="flex-1"
          value={configName}
          onChange={(e) => setConfigName(e.target.value)}
          placeholder={t('tactical.params.configNamePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleSave()}
          disabled={saving || !configName.trim()}
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
          {t('tactical.params.save')}
        </Button>
      </div>
      {configs.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {configs.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-border-subtle px-2 py-1.5"
            >
              <FolderOpen className="size-3.5 shrink-0 text-fg-tertiary" />
              <button
                className="flex-1 text-left text-caption text-fg hover:text-fg-primary"
                onClick={() => applyTacticalConfig(state, c.config as TacticalConfigPayload)}
              >
                {c.name}
              </button>
              <span className="text-caption text-fg-tertiary">
                {new Date(c.updatedAt).toLocaleDateString()}
              </span>
              <Button
                variant="icon"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => void remove(c.id)}
                title={t('tactical.params.deleteConfig')}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </ParamSection>
  );
}
function TacticalParamsPanel({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { isLoading, handleRunBacktest } = state;
  return (
    <div className="flex flex-col gap-4">
      <ConfigPersistenceSection state={state} />
      <SignalBuilderSection state={state} />
      <AggregationSection state={state} />
      <BacktestParamsSection state={state} />
      <RunButton
        isLoading={isLoading}
        onClick={handleRunBacktest}
        label={t('tactical.params.runBacktest')}
        loadingLabel={t('tactical.params.running')}
      />
    </div>
  );
}
export { TacticalParamsPanel };
