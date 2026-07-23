/**
 * @file 战术网格搜索参数面板子组件
 * @description 承载信号网格、回测参数、目标函数等输入区
 */
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import type { RebalanceFrequency } from '@backtest/shared';
import LoadingButton from '../../components/LoadingButton.js';
import { ParamRow, ParamCard, ParamGroup } from '../../components/params/index.js';
import { INDICATOR_OPTIONS, OBJECTIVE_OPTIONS, REBALANCE_OPTIONS } from './tacticalGridUtils.js';
import type { IndicatorType, ObjectiveType, GridParamRange } from './tacticalGridUtils.js';
import type { TacticalGridState } from '@/hooks/useTacticalGridState';

function ParamRangeRow({
  range,
  onChange,
  inputMin,
}: {
  range: GridParamRange;
  onChange: (v: GridParamRange) => void;
  inputMin?: number;
}) {
  const { t } = useTranslation();
  return (
    <ParamRow>
      <ParamCard label={t('tacticalGrid.params.min')}>
        <input
          type="number"
          className="param-input"
          value={range.min}
          min={inputMin}
          onChange={(e) => onChange({ ...range, min: Number(e.target.value) })}
        />
      </ParamCard>
      <ParamCard label={t('tacticalGrid.params.max')}>
        <input
          type="number"
          className="param-input"
          value={range.max}
          min={inputMin}
          onChange={(e) => onChange({ ...range, max: Number(e.target.value) })}
        />
      </ParamCard>
      <ParamCard label={t('tacticalGrid.params.step')}>
        <input
          type="number"
          className="param-input"
          value={range.step}
          min={0.1}
          step={0.5}
          onChange={(e) => onChange({ ...range, step: Number(e.target.value) })}
        />
      </ParamCard>
    </ParamRow>
  );
}

function SignalGridSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { indicator, setIndicator, param1, setParam1, param2, setParam2, paramLabels } = state;
  return (
    <ParamGroup
      title={t('tacticalGrid.params.signalGrid')}
    >
      <ParamCard label={t('tacticalGrid.params.indicator')} style={{ marginBottom: 8 }}>
        <select
          className="param-input"
          value={indicator}
          onChange={(e) => setIndicator(e.target.value as IndicatorType)}
        >
          {INDICATOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
      </ParamCard>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
        {paramLabels.p1}
      </div>
      <ParamRangeRow range={param1} onChange={setParam1} inputMin={1} />

      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 4,
          marginTop: 8,
          fontWeight: 600,
        }}
      >
        {paramLabels.p2}
      </div>
      <ParamRangeRow range={param2} onChange={setParam2} />

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
        {indicator === 'rsi'
          ? t('tacticalGrid.params.rsiHint')
          : t('tacticalGrid.params.breakoutHint')}
      </div>
    </ParamGroup>
  );
}

function BacktestParamsSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const {
    ticker,
    setTicker,
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
    <ParamGroup
      title={t('tacticalGrid.params.backtestParams')}
    >
      <ParamCard label={t('tacticalGrid.params.ticker')} style={{ marginBottom: 8 }}>
        <input
          type="text"
          className="param-input"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder={t('tacticalGrid.params.tickerPlaceholder')}
        />
      </ParamCard>
      <ParamRow style={{ marginBottom: 8 }}>
        <ParamCard label={t('tacticalGrid.params.startDate')}>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </ParamCard>
        <ParamCard label={t('tacticalGrid.params.endDate')}>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </ParamCard>
      </ParamRow>
      <ParamRow>
        <ParamCard label={t('tacticalGrid.params.startingValue')}>
          <input
            type="number"
            className="param-input"
            value={startingValue}
            min={100}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </ParamCard>
        <ParamCard label={t('tacticalGrid.params.rebalanceFreq')}>
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
    </ParamGroup>
  );
}

/** 战术网格搜索参数面板（信号网格 + 回测参数 + 目标函数 + 执行按钮） */
export function GridParamsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { objective, setObjective, isLoading, runSearch } = state;
  return (
    <div className="flex flex-col">
      <SignalGridSection state={state} />
      <BacktestParamsSection state={state} />
      <ParamGroup
        title={t('tacticalGrid.params.objectiveSection')}
      >
        <ParamCard label={t('tacticalGrid.params.objective')}>
          <select
            className="param-input"
            value={objective}
            onChange={(e) => setObjective(e.target.value as ObjectiveType)}
          >
            {OBJECTIVE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.label)}
              </option>
            ))}
          </select>
        </ParamCard>
      </ParamGroup>
      <div className="bt-action-row">
        <LoadingButton
          isLoading={isLoading}
          onClick={runSearch}
          loadingText={t('tacticalGrid.params.searching')}
        >
          <Play className="w-4 h-4" />
          {t('tacticalGrid.params.startSearch')}
        </LoadingButton>
      </div>
    </div>
  );
}
