/**
 * @file 战术网格搜索参数面板子组件
 * @description 承载信号网格、回测参数、目标函数等输入区
 */
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import type { RebalanceFrequency } from '@backtest/shared';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import LoadingButton from '../../components/LoadingButton.js';
import { INDICATOR_OPTIONS, OBJECTIVE_OPTIONS, REBALANCE_OPTIONS } from './tacticalGridUtils.js';
import type { IndicatorType, ObjectiveType, ParamRange } from './tacticalGridUtils.js';
import type { TacticalGridState } from '@/hooks/useTacticalGridState';

function ParamRangeRow({
  range,
  onChange,
  inputMin,
}: {
  range: ParamRange;
  onChange: (v: ParamRange) => void;
  inputMin?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="params-row">
      <div className="param-field">
        <span className="param-label">{t('tacticalGrid.params.min')}</span>
        <input
          type="number"
          className="param-input"
          value={range.min}
          min={inputMin}
          onChange={(e) => onChange({ ...range, min: Number(e.target.value) })}
        />
      </div>
      <div className="param-field">
        <span className="param-label">{t('tacticalGrid.params.max')}</span>
        <input
          type="number"
          className="param-input"
          value={range.max}
          min={inputMin}
          onChange={(e) => onChange({ ...range, max: Number(e.target.value) })}
        />
      </div>
      <div className="param-field">
        <span className="param-label">{t('tacticalGrid.params.step')}</span>
        <input
          type="number"
          className="param-input"
          value={range.step}
          min={0.1}
          step={0.5}
          onChange={(e) => onChange({ ...range, step: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

function SignalGridSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { indicator, setIndicator, param1, setParam1, param2, setParam2, paramLabels } = state;
  return (
    <ParamsSection
      title={t('tacticalGrid.params.signalGrid')}
      info={t('tacticalGrid.params.signalGridInfo')}
    >
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">{t('tacticalGrid.params.indicator')}</span>
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
      </div>

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
    </ParamsSection>
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
    <ParamsSection
      title={t('tacticalGrid.params.backtestParams')}
      info={t('tacticalGrid.params.backtestParamsInfo')}
    >
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">{t('tacticalGrid.params.ticker')}</span>
        <input
          type="text"
          className="param-input"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder={t('tacticalGrid.params.tickerPlaceholder')}
        />
      </div>
      <div className="params-row" style={{ marginBottom: 8 }}>
        <div className="param-field">
          <span className="param-label">{t('tacticalGrid.params.startDate')}</span>
          <input
            type="date"
            className="param-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="param-field">
          <span className="param-label">{t('tacticalGrid.params.endDate')}</span>
          <input
            type="date"
            className="param-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">{t('tacticalGrid.params.startingValue')}</span>
          <input
            type="number"
            className="param-input"
            value={startingValue}
            min={100}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </div>
        <div className="param-field">
          <span className="param-label">{t('tacticalGrid.params.rebalanceFreq')}</span>
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
        </div>
      </div>
    </ParamsSection>
  );
}

/** 战术网格搜索参数面板（信号网格 + 回测参数 + 目标函数 + 执行按钮） */
export function GridParamsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { objective, setObjective, isLoading, runSearch } = state;
  return (
    <ParamsPanel>
      <SignalGridSection state={state} />
      <BacktestParamsSection state={state} />
      <ParamsSection
        title={t('tacticalGrid.params.objectiveSection')}
        info={t('tacticalGrid.params.objectiveSectionInfo')}
      >
        <div className="param-field">
          <span className="param-label">{t('tacticalGrid.params.objective')}</span>
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
        </div>
      </ParamsSection>
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
    </ParamsPanel>
  );
}
