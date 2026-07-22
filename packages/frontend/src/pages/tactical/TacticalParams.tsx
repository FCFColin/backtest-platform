import { Plus, X, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import LoadingButton from '../../components/LoadingButton.js';
import { ParamRow, ParamCard, ActionBar } from '../../components/params/index.js';
import {
  useTacticalPageState,
  INDICATOR_OPTIONS,
  OPERATOR_OPTIONS,
  REBALANCE_OPTIONS,
  AGGREGATION_OPTIONS,
  RANKING_METHOD_OPTIONS,
  createDefaultCondition,
} from './TacticalUtils.js';
import type {
  TacticalStrategy,
  TradingSignal,
  SignalCondition,
} from '@backtest/shared/types/tactical';
import type { RebalanceFrequency } from '@backtest/shared';

type TacticalPageState = ReturnType<typeof useTacticalPageState>;

function ConditionRow({
  cond,
  ci,
  onUpdate,
  onRemove,
  canRemove,
}: {
  cond: SignalCondition;
  ci: number;
  onUpdate: (ci: number, patch: Partial<SignalCondition>) => void;
  onRemove: (ci: number) => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="ticker-row" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
      <select
        className="param-input"
        style={{ width: 130, height: 32, fontSize: 12, padding: '2px 6px' }}
        value={cond.indicator}
        onChange={(e) =>
          onUpdate(ci, { indicator: e.target.value as SignalCondition['indicator'] })
        }
      >
        {INDICATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.label)}
          </option>
        ))}
      </select>
      <div className="param-input-suffix-wrap" style={{ width: 80 }}>
        <input
          type="number"
          className="param-input param-input-with-suffix"
          style={{ height: 32, fontSize: 12, padding: '2px 30px 2px 6px' }}
          value={cond.period}
          onChange={(e) => onUpdate(ci, { period: Number(e.target.value) })}
        />
        <span className="param-input-suffix">{t('tactical.params.period')}</span>
      </div>
      <select
        className="param-input"
        style={{ width: 100, height: 32, fontSize: 12, padding: '2px 6px' }}
        value={cond.operator}
        onChange={(e) => onUpdate(ci, { operator: e.target.value as SignalCondition['operator'] })}
      >
        {OPERATOR_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.label)}
          </option>
        ))}
      </select>
      <div className="param-input-prefix-wrap" style={{ width: 90 }}>
        <input
          type="number"
          step="0.01"
          className="param-input param-input-with-prefix"
          style={{ height: 32, fontSize: 12, padding: '2px 6px 2px 18px' }}
          value={cond.threshold}
          onChange={(e) => onUpdate(ci, { threshold: Number(e.target.value) })}
        />
        <span className="param-input-prefix">{t('tactical.params.threshold')}</span>
      </div>
      {canRemove && (
        <button
          className="row-remove-btn"
          onClick={() => onRemove(ci)}
          title={t('tactical.params.deleteCondition')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function WeightRow({
  weight,
  wi,
  onUpdate,
  onRemove,
  canRemove,
}: {
  weight: { ticker: string; weight: number };
  wi: number;
  onUpdate: (wi: number, patch: Partial<{ ticker: string; weight: number }>) => void;
  onRemove: (wi: number) => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="ticker-row" style={{ marginBottom: 4 }}>
      <input
        type="text"
        className="ticker-input"
        style={{ flex: 1, height: 32, fontSize: 12 }}
        value={weight.ticker}
        onChange={(e) => onUpdate(wi, { ticker: e.target.value.toUpperCase() })}
        placeholder={t('tactical.params.tickerPlaceholder')}
      />
      <div className="param-input-suffix-wrap" style={{ width: 100 }}>
        <input
          type="number"
          className="param-input param-input-with-suffix"
          style={{ height: 32, fontSize: 12, padding: '2px 30px 2px 6px' }}
          value={weight.weight}
          onChange={(e) => onUpdate(wi, { weight: Number(e.target.value) })}
        />
        <span className="param-input-suffix">%</span>
      </div>
      {canRemove && (
        <button
          className="row-remove-btn"
          onClick={() => onRemove(wi)}
          title={t('tactical.params.delete')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function useSignalEditorHandlers(signal: TradingSignal, onChange: (s: TradingSignal) => void) {
  const updateName = (name: string) => onChange({ ...signal, name });
  const updateCondition = (ci: number, patch: Partial<SignalCondition>) => {
    const next = signal.conditions.map((c, i) => (i === ci ? { ...c, ...patch } : c));
    onChange({ ...signal, conditions: next });
  };
  const addCondition = () =>
    onChange({ ...signal, conditions: [...signal.conditions, createDefaultCondition()] });
  const removeCondition = (ci: number) => {
    if (signal.conditions.length <= 1) return;
    onChange({ ...signal, conditions: signal.conditions.filter((_, i) => i !== ci) });
  };
  const updateWeight = (wi: number, patch: Partial<{ ticker: string; weight: number }>) => {
    const next = signal.targetWeights.map((w, i) => (i === wi ? { ...w, ...patch } : w));
    onChange({ ...signal, targetWeights: next });
  };
  const addWeight = () =>
    onChange({ ...signal, targetWeights: [...signal.targetWeights, { ticker: '', weight: 0 }] });
  const removeWeight = (wi: number) => {
    if (signal.targetWeights.length <= 1) return;
    onChange({ ...signal, targetWeights: signal.targetWeights.filter((_, i) => i !== wi) });
  };
  return {
    updateName,
    updateCondition,
    addCondition,
    removeCondition,
    updateWeight,
    addWeight,
    removeWeight,
  };
}

const signalEditorStyle = {
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  padding: 12,
  marginBottom: 12,
  background: 'var(--bg-subtle)',
};

function SignalEditor({
  signal,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  signal: TradingSignal;
  index: number;
  onChange: (signal: TradingSignal) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  const h = useSignalEditorHandlers(signal, onChange);
  return (
    <div style={signalEditorStyle}>
      <div className="ticker-row" style={{ marginBottom: 8 }}>
        <input
          type="text"
          className="ticker-input"
          style={{ flex: 1, textTransform: 'none' }}
          value={signal.name}
          onChange={(e) => h.updateName(e.target.value)}
          placeholder={t('tactical.params.signalNamePlaceholder', { index: index + 1 })}
        />
        {canRemove && (
          <button
            className="row-remove-btn"
            onClick={onRemove}
            title={t('tactical.params.deleteSignal')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
        {t('tactical.params.triggerConditions')}
      </div>
      {signal.conditions.map((cond, ci) => (
        <ConditionRow
          key={ci}
          cond={cond}
          ci={ci}
          onUpdate={h.updateCondition}
          onRemove={h.removeCondition}
          canRemove={signal.conditions.length > 1}
        />
      ))}
      <button className="portfolios-add-btn" onClick={h.addCondition} style={{ marginTop: 4 }}>
        <Plus className="w-3 h-3" />
        {t('tactical.params.addCondition')}
      </button>
      <div
        style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 4px', fontWeight: 600 }}
      >
        {t('tactical.params.targetWeights')}
      </div>
      {signal.targetWeights.map((w, wi) => (
        <WeightRow
          key={wi}
          weight={w}
          wi={wi}
          onUpdate={h.updateWeight}
          onRemove={h.removeWeight}
          canRemove={signal.targetWeights.length > 1}
        />
      ))}
      <button className="portfolios-add-btn" onClick={h.addWeight} style={{ marginTop: 4 }}>
        <Plus className="w-3 h-3" />
        {t('tactical.params.addAsset')}
      </button>
    </div>
  );
}

function SignalBuilderSection({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { strategy, updateSignal, addSignal, removeSignal } = state;
  return (
    <ParamsSection
      title={t('tactical.params.signalBuilder')}
      info={t('tactical.params.signalBuilderInfo')}
    >
      {strategy.signals.map((sig, idx) => (
        <SignalEditor
          key={sig.id}
          signal={sig}
          index={idx}
          onChange={(s) => updateSignal(idx, s)}
          onRemove={() => removeSignal(idx)}
          canRemove={strategy.signals.length > 1}
        />
      ))}
      <button
        className="portfolios-add-btn"
        onClick={addSignal}
        style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
      >
        <Plus className="w-4 h-4" />
        {t('tactical.params.addSignal')}
      </button>
    </ParamsSection>
  );
}

function RankingConfigRow({
  strategy,
  setStrategy,
}: {
  strategy: TacticalStrategy;
  setStrategy: (s: TacticalStrategy) => void;
}) {
  const { t } = useTranslation();
  return (
    <ParamRow>
      <ParamCard label={t('tactical.params.rankingMethod')}>
        <select
          className="param-input"
          value={strategy.rankingConfig?.method ?? 'fixed_share'}
          onChange={(e) =>
            setStrategy({
              ...strategy,
              rankingConfig: {
                method: e.target.value as 'fixed_share' | 'risk_parity',
                topN: strategy.rankingConfig?.topN ?? 3,
              },
            })
          }
        >
          {RANKING_METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
      </ParamCard>
      <ParamCard label="TopN">
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            min={1}
            className="param-input param-input-with-suffix"
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
          <span className="param-input-suffix">{t('tactical.params.topNUnit')}</span>
        </div>
      </ParamCard>
    </ParamRow>
  );
}

function AggregationSection({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { strategy, setStrategy } = state;
  return (
    <ParamsSection
      title={t('tactical.params.aggregationConfig')}
      info={t('tactical.params.aggregationConfigInfo')}
    >
      <ParamCard label={t('tactical.params.aggregationMethod')}>
        <select
          className="param-input"
          value={strategy.aggregationMethod}
          onChange={(e) =>
            setStrategy({
              ...strategy,
              aggregationMethod: e.target.value as TacticalStrategy['aggregationMethod'],
            })
          }
        >
          {AGGREGATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
      </ParamCard>
      {strategy.aggregationMethod === 'rank' && (
        <RankingConfigRow strategy={strategy} setStrategy={setStrategy} />
      )}
    </ParamsSection>
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
    <ParamsSection title={t('tactical.params.backtestParams')}>
      <ParamRow>
        <ParamCard label={t('tactical.params.startDate')}>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </ParamCard>
        <ParamCard label={t('tactical.params.endDate')}>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </ParamCard>
        <ParamCard label={t('tactical.params.startingValue')}>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={startingValue}
              onChange={(e) => setStartingValue(Number(e.target.value))}
            />
          </div>
        </ParamCard>
        <ParamCard label={t('tactical.params.rebalanceFreq')}>
          <select
            className="param-input"
            value={rebalanceFrequency}
            onChange={(e) => setRebalanceFrequency(e.target.value as RebalanceFrequency)}
          >
            {REBALANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.label)}
              </option>
            ))}
          </select>
        </ParamCard>
      </ParamRow>
    </ParamsSection>
  );
}

function TacticalParamsPanel({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { isLoading, handleRunBacktest } = state;
  return (
    <ParamsPanel>
      <SignalBuilderSection state={state} />
      <AggregationSection state={state} />
      <BacktestParamsSection state={state} />
      <ActionBar>
        <LoadingButton
          isLoading={isLoading}
          onClick={handleRunBacktest}
          loadingText={t('tactical.params.running')}
          style={{ width: '100%' }}
        >
          <Play className="w-4 h-4" />
          {t('tactical.params.runBacktest')}
        </LoadingButton>
      </ActionBar>
    </ParamsPanel>
  );
}

export { TacticalParamsPanel };
