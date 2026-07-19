/**
 * @file 多信号选择器（参数面板）
 * @description 信号列表 + 聚合配置 + 回测参数，封装为 MultiSignalParamsPanel 子组件
 */
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import {
  INDICATORS,
  TickerField,
  DateRangeFields,
  RunAnalysisButton,
} from './SignalParamsPanel.js';
import type { AggregationMethod, SignalItem } from './multiSignalTypes.js';

const AGGREGATION_METHODS: { value: AggregationMethod; label: string }[] = [
  { value: 'weighted', label: 'signal.multi.aggregationWeighted' },
  { value: 'voting', label: 'signal.multi.aggregationVoting' },
  { value: 'rank', label: 'signal.multi.aggregationRank' },
];

interface MultiSignalParamsProps {
  signals: SignalItem[];
  weights: number[];
  aggregationMethod: AggregationMethod;
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onAddSignal: () => void;
  onRemoveSignal: (id: number) => void;
  onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void;
  onUpdateWeight: (idx: number, val: number) => void;
  onAggregationMethodChange: (m: AggregationMethod) => void;
  onTickerChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

function SignalRow({
  signal: s,
  idx,
  weight,
  showWeight,
  canRemove,
  onUpdateSignal,
  onRemoveSignal,
  onUpdateWeight,
}: {
  signal: SignalItem;
  idx: number;
  weight: number;
  showWeight: boolean;
  canRemove: boolean;
  onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void;
  onRemoveSignal: (id: number) => void;
  onUpdateWeight: (idx: number, val: number) => void;
}) {
  const { t } = useTranslation();
  const inputStyle = { width: 64, fontSize: 12, padding: '4px 8px' };
  return (
    <div className="ticker-row" style={{ flexWrap: 'wrap', gap: 6 }}>
      <select
        className="param-input"
        style={{ width: 110, fontSize: 12, padding: '4px 8px' }}
        value={s.indicator}
        onChange={(e) => onUpdateSignal(s.id, { indicator: e.target.value })}
      >
        {INDICATORS.map((ind) => (
          <option key={ind} value={ind}>
            {ind}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="param-input"
        style={inputStyle}
        value={s.period}
        min={2}
        title={t('signal.multi.period')}
        onChange={(e) => onUpdateSignal(s.id, { period: Number(e.target.value) })}
      />
      <input
        type="number"
        className="param-input"
        style={inputStyle}
        value={s.threshold}
        title={t('signal.multi.threshold')}
        onChange={(e) => onUpdateSignal(s.id, { threshold: Number(e.target.value) })}
      />
      {showWeight && (
        <input
          type="number"
          step="0.1"
          className="param-input"
          style={{ ...inputStyle, width: 60 }}
          value={weight}
          title={t('signal.multi.weight')}
          onChange={(e) => onUpdateWeight(idx, Number(e.target.value))}
        />
      )}
      {canRemove && (
        <button
          onClick={() => onRemoveSignal(s.id)}
          className="row-remove-btn"
          title={t('signal.multi.delete')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function SignalListSection({
  signals,
  weights,
  aggregationMethod,
  onAddSignal,
  onRemoveSignal,
  onUpdateSignal,
  onUpdateWeight,
}: Pick<
  MultiSignalParamsProps,
  | 'signals'
  | 'weights'
  | 'aggregationMethod'
  | 'onAddSignal'
  | 'onRemoveSignal'
  | 'onUpdateSignal'
  | 'onUpdateWeight'
>) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('signal.multi.signalList')} info={t('signal.multi.signalListInfo')}>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {signals.map((s, idx) => (
            <SignalRow
              key={s.id}
              signal={s}
              idx={idx}
              weight={weights[idx] ?? 0}
              showWeight={aggregationMethod === 'weighted'}
              canRemove={signals.length > 1}
              onUpdateSignal={onUpdateSignal}
              onRemoveSignal={onRemoveSignal}
              onUpdateWeight={onUpdateWeight}
            />
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={onAddSignal} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" /> {t('signal.multi.addSignal')}
      </button>
    </ParamsSection>
  );
}

function AggregationSection({
  aggregationMethod,
  onAggregationMethodChange,
}: Pick<MultiSignalParamsProps, 'aggregationMethod' | 'onAggregationMethodChange'>) {
  const { t } = useTranslation();
  const descMap: Record<string, string> = {
    weighted: 'signal.multi.descWeighted',
    voting: 'signal.multi.descVoting',
    rank: 'signal.multi.descRank',
  };
  return (
    <ParamsSection title={t('signal.multi.aggregationSection')}>
      <div className="param-field" style={{ marginBottom: 8 }}>
        <span className="param-label">{t('signal.multi.aggregationMethod')}</span>
        <select
          className="param-input"
          value={aggregationMethod}
          onChange={(e) => onAggregationMethodChange(e.target.value as AggregationMethod)}
        >
          {AGGREGATION_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {t(m.label)}
            </option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {t(descMap[aggregationMethod])}
      </div>
    </ParamsSection>
  );
}

function BacktestParamsSection({
  ticker,
  startDate,
  endDate,
  onTickerChange,
  onStartDateChange,
  onEndDateChange,
}: Pick<
  MultiSignalParamsProps,
  'ticker' | 'startDate' | 'endDate' | 'onTickerChange' | 'onStartDateChange' | 'onEndDateChange'
>) {
  const { t } = useTranslation();
  return (
    <ParamsSection title={t('signal.multi.backtestParams')}>
      <TickerField value={ticker} onChange={onTickerChange} />
      <DateRangeFields
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    </ParamsSection>
  );
}

export function MultiSignalParamsPanel(props: MultiSignalParamsProps) {
  return (
    <ParamsPanel>
      <SignalListSection {...props} />
      <AggregationSection {...props} />
      <BacktestParamsSection {...props} />
      <RunAnalysisButton isLoading={props.isLoading} onClick={props.onRun} />
    </ParamsPanel>
  );
}
